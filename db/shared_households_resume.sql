-- =====================================================================
-- WiseBudget - resume shared households migration after partial execution
-- Use this if households/household_members already exist but migration stopped.
-- =====================================================================

create extension if not exists "pgcrypto";

alter table public.households
  add column if not exists name text not null default 'Conta pessoal',
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.household_members
  add column if not exists role text not null default 'member',
  add column if not exists joined_at timestamptz not null default now(),
  add column if not exists invited_by uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.household_members'::regclass
      and conname = 'household_members_household_user_key'
  ) then
    alter table public.household_members
      add constraint household_members_household_user_key
      unique (household_id, user_id);
  end if;
end $$;

create table if not exists public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  code_hash text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null,
  max_uses int not null default 1 check (max_uses > 0),
  uses_count int not null default 0 check (uses_count >= 0),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists email text,
  add column if not exists active_household_id uuid references public.households(id) on delete set null;

alter table public.accounts
  add column if not exists household_id uuid references public.households(id) on delete cascade;

alter table public.categories
  add column if not exists household_id uuid references public.households(id) on delete cascade;

alter table public.transactions
  add column if not exists household_id uuid references public.households(id) on delete cascade;

alter table public.objectives
  add column if not exists household_id uuid references public.households(id) on delete cascade;

alter table public.portfolios
  add column if not exists household_id uuid references public.households(id) on delete cascade;

-- Fill missing profile active household from existing memberships.
update public.profiles p
set active_household_id = hm.household_id
from (
  select distinct on (user_id) user_id, household_id
  from public.household_members
  order by user_id, joined_at asc nulls last
) hm
where p.id = hm.user_id
  and p.active_household_id is null;

-- If there are users without membership, create a private household for them.
insert into public.households (name, created_by)
select 'Conta pessoal', u.id
from auth.users u
where not exists (
  select 1 from public.household_members hm where hm.user_id = u.id
);

insert into public.household_members (household_id, user_id, role)
select h.id, h.created_by, 'owner'
from public.households h
where h.created_by is not null
  and not exists (
    select 1
    from public.household_members hm
    where hm.household_id = h.id
      and hm.user_id = h.created_by
  );

update public.profiles p
set active_household_id = hm.household_id
from (
  select distinct on (user_id) user_id, household_id
  from public.household_members
  order by user_id, joined_at asc nulls last
) hm
where p.id = hm.user_id
  and p.active_household_id is null;

update public.accounts a
set household_id = p.active_household_id
from public.profiles p
where a.household_id is null
  and a.user_id = p.id;

update public.categories c
set household_id = p.active_household_id
from public.profiles p
where c.household_id is null
  and c.user_id = p.id;

update public.transactions t
set household_id = a.household_id
from public.accounts a
where t.household_id is null
  and t.account_id = a.id
  and a.household_id is not null;

update public.transactions t
set household_id = p.active_household_id
from public.profiles p
where t.household_id is null
  and t.user_id = p.id
  and p.active_household_id is not null;

update public.objectives o
set household_id = p.active_household_id
from public.profiles p
where o.household_id is null
  and o.user_id = p.id;

update public.portfolios pf
set household_id = p.active_household_id
from public.profiles p
where pf.household_id is null
  and pf.user_id = p.id;

alter table public.accounts alter column household_id set not null;
alter table public.transactions alter column household_id set not null;

create index if not exists idx_accounts_household on public.accounts(household_id);
create index if not exists idx_categories_household on public.categories(household_id);
create index if not exists idx_transactions_household_date on public.transactions(household_id, date desc);
create index if not exists idx_household_members_user on public.household_members(user_id);
create index if not exists idx_household_invites_household on public.household_invites(household_id);

create or replace function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = public, extensions
as $$
  select p.active_household_id
  from public.profiles p
  where p.id = auth.uid()
    and exists (
      select 1
      from public.household_members hm
      where hm.household_id = p.active_household_id
        and hm.user_id = auth.uid()
    )
$$;

create or replace function public.is_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = p_household_id
      and hm.user_id = auth.uid()
  )
$$;

create or replace function public.is_household_admin(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = p_household_id
      and hm.user_id = auth.uid()
      and hm.role in ('owner', 'admin')
  )
$$;

create or replace function public.create_household_invite(
  p_expires_hours int default 168,
  p_max_uses int default 1
) returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_household uuid := public.current_household_id();
  v_code text;
  v_hash text;
begin
  if v_user is null then
    raise exception 'Sessao invalida';
  end if;

  if v_household is null or not public.is_household_admin(v_household) then
    raise exception 'Apenas owner/admin pode gerar codigo';
  end if;

  loop
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5)) || '-' ||
              upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 5));
    v_hash := encode(digest(v_code, 'sha256'), 'hex');
    exit when not exists (select 1 from public.household_invites where code_hash = v_hash);
  end loop;

  insert into public.household_invites (household_id, code_hash, created_by, expires_at, max_uses)
  values (
    v_household,
    v_hash,
    v_user,
    now() + make_interval(hours => greatest(coalesce(p_expires_hours, 168), 1)),
    greatest(coalesce(p_max_uses, 1), 1)
  );

  return v_code;
end $$;

create or replace function public.join_household_by_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_hash text;
  v_invite public.household_invites%rowtype;
begin
  if v_user is null then
    raise exception 'Sessao invalida';
  end if;

  v_hash := encode(digest(upper(trim(coalesce(p_code, ''))), 'sha256'), 'hex');

  select * into v_invite
  from public.household_invites
  where code_hash = v_hash
  for update;

  if not found then
    raise exception 'Codigo invalido';
  end if;

  if v_invite.revoked_at is not null
    or v_invite.expires_at <= now()
    or v_invite.uses_count >= v_invite.max_uses then
    raise exception 'Codigo expirado ou ja usado';
  end if;

  if v_invite.created_by = v_user then
    raise exception 'Nao podes usar o codigo que geraste na tua propria conta';
  end if;

  if exists (
    select 1 from public.household_members
    where household_id = v_invite.household_id
      and user_id = v_user
  ) then
    raise exception 'Ja tens acesso a esta conta financeira';
  end if;

  insert into public.household_members (household_id, user_id, role, invited_by)
  values (v_invite.household_id, v_user, 'member', v_invite.created_by);

  update public.household_invites
  set uses_count = uses_count + 1,
      used_at = case when uses_count + 1 >= max_uses then now() else used_at end,
      used_by = case when uses_count + 1 >= max_uses then v_user else used_by end
  where id = v_invite.id;

  update public.profiles
  set active_household_id = v_invite.household_id
  where id = v_user;

  return v_invite.household_id;
end $$;

create or replace function public.get_household_context()
returns table (
  household_id uuid,
  household_name text,
  role text,
  members_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select h.id, h.name, hm.role, count(hm_all.user_id) as members_count
  from public.profiles p
  join public.households h on h.id = p.active_household_id
  join public.household_members hm
    on hm.household_id = h.id
   and hm.user_id = auth.uid()
  left join public.household_members hm_all on hm_all.household_id = h.id
  where p.id = auth.uid()
  group by h.id, h.name, hm.role
$$;

revoke all on function public.create_household_invite(int, int) from public;
revoke all on function public.join_household_by_invite(text) from public;
revoke all on function public.get_household_context() from public;
grant execute on function public.create_household_invite(int, int) to authenticated;
grant execute on function public.join_household_by_invite(text) to authenticated;
grant execute on function public.get_household_context() to authenticated;

create or replace function public.set_row_household()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid;
begin
  v_household := public.current_household_id();
  if v_household is null then
    raise exception 'Conta financeira ativa invalida';
  end if;

  if new.household_id is null then
    new.household_id := v_household;
  end if;

  if new.household_id <> v_household then
    raise exception 'A linha tem de pertencer a conta financeira ativa';
  end if;

  if new.user_id is null then
    new.user_id := auth.uid();
  end if;

  return new;
end $$;

drop trigger if exists accounts_set_household on public.accounts;
create trigger accounts_set_household
before insert or update of household_id, user_id on public.accounts
for each row execute function public.set_row_household();

drop trigger if exists categories_set_household on public.categories;
create trigger categories_set_household
before insert or update of household_id, user_id on public.categories
for each row
when (new.user_id is not null)
execute function public.set_row_household();

drop trigger if exists transactions_set_household on public.transactions;
create trigger transactions_set_household
before insert or update of household_id, user_id on public.transactions
for each row execute function public.set_row_household();

drop trigger if exists objectives_set_household on public.objectives;
create trigger objectives_set_household
before insert or update of household_id, user_id on public.objectives
for each row execute function public.set_row_household();

drop trigger if exists portfolios_set_household on public.portfolios;
create trigger portfolios_set_household
before insert or update of household_id, user_id on public.portfolios
for each row execute function public.set_row_household();

create or replace function public.create_transfer(
  p_from_account uuid,
  p_to_account uuid,
  p_amount numeric,
  p_date date,
  p_description text default null,
  p_notes text default null,
  p_status_code text default 'DONE'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_household uuid := public.current_household_id();
  gid uuid := gen_random_uuid();
  v_from_curr text;
  v_to_curr text;
  v_status_id smallint;
begin
  if v_user is null or v_household is null then
    raise exception 'Not authenticated';
  end if;

  if p_from_account is null or p_to_account is null or p_from_account = p_to_account then
    raise exception 'Accounts must be different and not null';
  end if;

  if coalesce(p_amount, 0) <= 0 then
    raise exception 'Amount must be > 0';
  end if;

  if not exists(select 1 from public.accounts where id = p_from_account and household_id = v_household) then
    raise exception 'Invalid from account';
  end if;

  if not exists(select 1 from public.accounts where id = p_to_account and household_id = v_household) then
    raise exception 'Invalid to account';
  end if;

  select currency into v_from_curr from public.accounts where id = p_from_account;
  select currency into v_to_curr from public.accounts where id = p_to_account;

  select id into v_status_id from public.statuses where code = upper(p_status_code);
  if v_status_id is null then
    select id into v_status_id from public.statuses where code = 'DONE';
  end if;

  insert into public.transactions (
    household_id, user_id, type_id, account_id, date, amount, description, notes,
    transfer_group_id, currency, status_id, payment_method_id
  ) values (
    v_household, v_user,
    (select id from public.transaction_types where code = 'TRANSFER_OUT'),
    p_from_account, p_date, p_amount,
    coalesce(p_description, 'Transferencia'), p_notes, gid,
    v_from_curr, v_status_id,
    (select id from public.payment_methods where code = 'BANK_TRANSFER')
  );

  insert into public.transactions (
    household_id, user_id, type_id, account_id, date, amount, description, notes,
    transfer_group_id, currency, status_id, payment_method_id
  ) values (
    v_household, v_user,
    (select id from public.transaction_types where code = 'TRANSFER_IN'),
    p_to_account, p_date, p_amount,
    coalesce(p_description, 'Transferencia'), p_notes, gid,
    v_to_curr, v_status_id,
    (select id from public.payment_methods where code = 'BANK_TRANSFER')
  );

  return gid;
end $$;

revoke all on function public.create_transfer(uuid, uuid, numeric, date, text, text, text) from public;
grant execute on function public.create_transfer(uuid, uuid, numeric, date, text, text, text) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid;
begin
  insert into public.households (name, created_by)
  values ('Conta pessoal', new.id)
  returning id into v_household;

  insert into public.household_members (household_id, user_id, role)
  values (v_household, new.id, 'owner')
  on conflict (household_id, user_id) do nothing;

  insert into public.profiles (id, display_name, email, active_household_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', 'Utilizador'),
    new.email,
    v_household
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    email = excluded.email,
    active_household_id = coalesce(public.profiles.active_household_id, excluded.active_household_id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;

drop policy if exists "households: member read" on public.households;
create policy "households: member read"
on public.households for select
using (public.is_household_member(id));

drop policy if exists "household_members: member read" on public.household_members;
create policy "household_members: member read"
on public.household_members for select
using (public.is_household_member(household_id));

drop policy if exists "household_invites: admin read" on public.household_invites;
create policy "household_invites: admin read"
on public.household_invites for select
using (public.is_household_admin(household_id));

drop policy if exists "accounts: owner all" on public.accounts;
drop policy if exists "accounts: household read" on public.accounts;
create policy "accounts: household read"
on public.accounts for select
using (household_id = public.current_household_id());

drop policy if exists "accounts: household write" on public.accounts;
create policy "accounts: household write"
on public.accounts for all
using (household_id = public.current_household_id())
with check (household_id = public.current_household_id());

drop policy if exists "categories: read public or owner" on public.categories;
drop policy if exists "categories: owner write" on public.categories;
drop policy if exists "categories: household read" on public.categories;
create policy "categories: household read"
on public.categories for select
using (user_id is null or household_id = public.current_household_id());

drop policy if exists "categories: household write" on public.categories;
create policy "categories: household write"
on public.categories for all
using (user_id is not null and household_id = public.current_household_id())
with check (user_id is not null and household_id = public.current_household_id());

drop policy if exists "Users can read their own transactions" on public.transactions;
drop policy if exists "transactions: owner all" on public.transactions;
drop policy if exists "transactions: household read" on public.transactions;
create policy "transactions: household read"
on public.transactions for select
using (household_id = public.current_household_id());

drop policy if exists "transactions: household write" on public.transactions;
create policy "transactions: household write"
on public.transactions for all
using (household_id = public.current_household_id())
with check (household_id = public.current_household_id());

drop policy if exists "obj_read_own" on public.objectives;
drop policy if exists "obj_insert_own" on public.objectives;
drop policy if exists "obj_update_own" on public.objectives;
drop policy if exists "obj_delete_own" on public.objectives;
drop policy if exists "objectives: household read" on public.objectives;
create policy "objectives: household read"
on public.objectives for select
using (household_id = public.current_household_id());

drop policy if exists "objectives: household write" on public.objectives;
create policy "objectives: household write"
on public.objectives for all
using (household_id = public.current_household_id())
with check (household_id = public.current_household_id());

drop policy if exists "portfolios select own" on public.portfolios;
drop policy if exists "portfolios insert own" on public.portfolios;
drop policy if exists "portfolios update own" on public.portfolios;
drop policy if exists "portfolios delete own" on public.portfolios;
drop policy if exists "portfolios: owner all" on public.portfolios;
drop policy if exists "portfolios: household read" on public.portfolios;
create policy "portfolios: household read"
on public.portfolios for select
using (household_id = public.current_household_id());

drop policy if exists "portfolios: household write" on public.portfolios;
create policy "portfolios: household write"
on public.portfolios for all
using (household_id = public.current_household_id())
with check (household_id = public.current_household_id());

drop view if exists public.v_expense_by_category;
drop view if exists public.v_monthly_summary;
drop view if exists public.v_account_balances;
drop view if exists public.v_ledger;

create view public.v_ledger as
select
  t.id,
  t.user_id,
  t.household_id,
  t.date,
  t.created_at,
  a.id as account_id,
  a.name as account_name,
  a.currency,
  tt.code as type_code,
  case when tt.code in ('INCOME', 'TRANSFER_IN') then 'IN' else 'OUT' end as direction,
  t.amount as amount_abs,
  t.signed_amount as amount_signed,
  coalesce(pc.name || ' > ' || c.name, c.name, '(Sem categoria)') as category_path,
  t.description,
  t.location,
  t.notes,
  t.transfer_group_id
from public.transactions t
join public.accounts a on a.id = t.account_id
join public.transaction_types tt on tt.id = t.type_id
left join public.categories c on c.id = t.category_id
left join public.categories pc on pc.id = c.parent_id;

alter view public.v_ledger set (security_invoker = on);

create view public.v_account_balances as
select
  a.household_id,
  auth.uid() as user_id,
  a.id as account_id,
  a.name as account_name,
  a.currency,
  coalesce(sum(t.signed_amount), 0) as balance
from public.accounts a
left join public.transactions t
  on t.account_id = a.id
 and t.household_id = a.household_id
group by a.household_id, a.id, a.name, a.currency;

alter view public.v_account_balances set (security_invoker = on);

create view public.v_monthly_summary as
select
  t.household_id,
  auth.uid() as user_id,
  date_trunc('month', t.date)::date as month,
  sum(case when tt.code = 'INCOME' then t.amount else 0 end) as income,
  sum(case when tt.code = 'EXPENSE' then -t.amount else 0 end) as expense,
  sum(case when tt.code = 'SAVINGS' then -t.amount else 0 end) as savings,
  sum(case when tt.code in ('INCOME', 'EXPENSE', 'SAVINGS') then t.signed_amount else 0 end) as net
from public.transactions t
join public.transaction_types tt on tt.id = t.type_id
group by t.household_id, date_trunc('month', t.date)::date;

alter view public.v_monthly_summary set (security_invoker = on);

create view public.v_expense_by_category as
select
  t.household_id,
  auth.uid() as user_id,
  coalesce(c.name, '(Sem categoria)') as category,
  sum(case when tt.code = 'EXPENSE' then -t.signed_amount else 0 end) as total_expense
from public.transactions t
join public.transaction_types tt on tt.id = t.type_id
left join public.categories c on c.id = t.category_id
where date_part('year', t.date) = date_part('year', current_date)
group by t.household_id, coalesce(c.name, '(Sem categoria)');

alter view public.v_expense_by_category set (security_invoker = on);

select * from public.get_household_context();
