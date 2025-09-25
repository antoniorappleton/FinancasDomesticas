-- =====================================================================
-- SUPABASE HOME FINANCE — ESQUEMA COMPLETO (IDEMPOTENTE)
-- =====================================================================

-- ========================================
-- EXTENSIONS
-- ========================================
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ========================================
-- PERFIS (ligados a auth.users)
-- ========================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz default now()
);

-- Trigger: cria/atualiza profile ao registar utilizador
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'name','Utilizador'))
  on conflict (id) do update set display_name = excluded.display_name;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ========================================
-- TABELAS DE REFERÊNCIA
-- ========================================
create table if not exists public.regularities (
  id smallserial primary key,
  code text unique not null,
  name_pt text not null
);

create table if not exists public.transaction_types (
  id smallserial primary key,
  code text unique not null,
  name_pt text not null
);

create table if not exists public.payment_methods (
  id smallserial primary key,
  code text unique not null,
  name_pt text not null
);

create table if not exists public.statuses (
  id smallserial primary key,
  code text unique not null,
  name_pt text not null
);

-- ========================================
-- CATEGORIAS (hierarquia Pai → Filho)
-- ========================================
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  parent_id uuid references public.categories(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('income','expense','savings','transfer')),
  color text,
  created_at timestamptz default now()
);

create index if not exists idx_categories_user   on public.categories(user_id);
create index if not exists idx_categories_parent on public.categories(parent_id);

-- Unicidade por (user_id, parent_id, name) + índice parcial para globais (user_id IS NULL)
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.categories'::regclass
      and conname  = 'categories_user_id_name_key'
  ) then
    alter table public.categories drop constraint categories_user_id_name_key;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.categories'::regclass
      and conname  = 'uq_categories_user_parent_name'
  ) then
    alter table public.categories
      add constraint uq_categories_user_parent_name unique (user_id, parent_id, name);
  end if;

  create unique index if not exists uq_categories_global_parent_name
    on public.categories(parent_id, name)
    where user_id is null;
end $$;

-- ========================================
-- CONTAS
-- ========================================
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text check (type in ('cash','bank','card','investment')) default 'bank',
  currency text not null default 'EUR',
  created_at timestamptz default now()
);
create index if not exists idx_accounts_user on public.accounts(user_id);

-- ========================================
-- TRANSAÇÕES
-- ========================================
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type_id smallint not null references public.transaction_types(id),
  regularity_id smallint references public.regularities(id),
  account_id uuid not null references public.accounts(id) on delete restrict,
  category_id uuid references public.categories(id),
  payment_method_id smallint references public.payment_methods(id),
  status_id smallint references public.statuses(id),
  date date not null,
  amount numeric(14,2) not null,
  description text,
  location text,
  notes text,
  currency text not null default 'EUR',
  created_at timestamptz default now(),
  transfer_group_id uuid, -- liga as duas linhas de uma transferência
  signed_amount numeric(14,2) -- calculada por trigger
);

create index if not exists idx_transactions_user_date           on public.transactions(user_id, date);
create index if not exists idx_transactions_user_date_created   on public.transactions(user_id, date desc, created_at desc);
create index if not exists idx_transactions_category            on public.transactions(category_id);
create index if not exists idx_transactions_account             on public.transactions(account_id);
create index if not exists idx_transactions_transfer_group      on public.transactions(transfer_group_id);

-- amount > 0 (sinal é calculado em signed_amount)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.transactions'::regclass
      and conname  = 'chk_transactions_amount_positive'
  ) then
    alter table public.transactions
      add constraint chk_transactions_amount_positive check (amount > 0);
  end if;
end $$;

-- ========================================
-- TRIGGER: signed_amount (+ entradas, – saídas)
-- ========================================
create or replace function public.trg_set_signed_amount()
returns trigger
language plpgsql
as $$
declare v_code text;
begin
  select code into v_code from public.transaction_types where id = new.type_id;

  if v_code in ('INCOME','TRANSFER_IN') then
    new.signed_amount := new.amount;
  elsif v_code in ('EXPENSE','SAVINGS','TRANSFER_OUT') then
    new.signed_amount := -new.amount;
  else
    new.signed_amount := new.amount;
  end if;

  return new;
end $$;

drop trigger if exists transactions_set_signed_amount on public.transactions;
create trigger transactions_set_signed_amount
before insert or update of amount, type_id on public.transactions
for each row execute function public.trg_set_signed_amount();

-- Recalcular existentes (seguro mesmo que a tabela esteja vazia)
update public.transactions set amount = amount;

-- ========================================
-- RLS (Row Level Security)
-- ========================================
alter table public.profiles     enable row level security;
alter table public.accounts     enable row level security;
alter table public.categories   enable row level security;
alter table public.transactions enable row level security;

-- Policies (DROP + CREATE para idempotência)
drop policy if exists "profiles: owner read" on public.profiles;
create policy "profiles: owner read"
on public.profiles for select
using (id = auth.uid());

drop policy if exists "accounts: owner all" on public.accounts;
create policy "accounts: owner all"
on public.accounts for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "categories: read public or owner" on public.categories;
create policy "categories: read public or owner"
on public.categories for select
using (user_id is null or user_id = auth.uid());

drop policy if exists "categories: owner write" on public.categories;
create policy "categories: owner write"
on public.categories for all
using (user_id = auth.uid() or (user_id is null and false))
with check (user_id = auth.uid());

drop policy if exists "transactions: owner all" on public.transactions;
create policy "transactions: owner all"
on public.transactions for all
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- Tabelas de referência: leitura para autenticados
alter table public.regularities      enable row level security;
alter table public.transaction_types enable row level security;
alter table public.payment_methods   enable row level security;
alter table public.statuses          enable row level security;

drop policy if exists "ref: read regularities" on public.regularities;
create policy "ref: read regularities"
on public.regularities for select using (auth.role() = 'authenticated');

drop policy if exists "ref: read transaction_types" on public.transaction_types;
create policy "ref: read transaction_types"
on public.transaction_types for select using (auth.role() = 'authenticated');

drop policy if exists "ref: read payment_methods" on public.payment_methods;
create policy "ref: read payment_methods"
on public.payment_methods for select using (auth.role() = 'authenticated');

drop policy if exists "ref: read statuses" on public.statuses;
create policy "ref: read statuses"
on public.statuses for select using (auth.role() = 'authenticated');

-- ========================================
-- SEEDS (dados de referência)
-- ========================================
insert into public.regularities (code, name_pt) values
  ('DAILY','Diária'),('WEEKLY','Semanal'),('MONTHLY','Mensal'),
  ('BIMONTHLY','2 em 2 meses'),('QUARTERLY','Trimestral'),
  ('YEARLY','Anual'),('ONCE','Única')
on conflict (code) do nothing;

-- Tipos (inclui TRANSFER_* para RPC)
insert into public.transaction_types (code, name_pt) values
  ('INCOME','Receita'),
  ('EXPENSE','Despesa'),
  ('SAVINGS','Poupança'),
  ('TRANSFER','Transferência'),
  ('TRANSFER_IN','Transferência (entrada)'),
  ('TRANSFER_OUT','Transferência (saída)')
on conflict (code) do nothing;

insert into public.payment_methods (code, name_pt) values
  ('MBWAY','MB Way'),
  ('ATM','Multibanco'),
  ('CASH','Dinheiro'),
  ('BANK_TRANSFER','Transferência Bancária')
on conflict (code) do nothing;

insert into public.statuses (code, name_pt) values
  ('PENDING','Em processo'),
  ('DONE','Concluído'),
  ('CANCELED','Cancelado')
on conflict (code) do nothing;

-- ========================================
-- SEED DE CATEGORIAS (globais: user_id NULL)
-- ========================================
with parents as (
  insert into public.categories (user_id, parent_id, name, kind, color)
  values
    (null,null,'Alimentação','expense','#22c55e'),
    (null,null,'Casa','expense','#0ea5e9'),
    (null,null,'Carros','expense','#f97316'),
    (null,null,'Saúde','expense','#ef4444'),
    (null,null,'Lazer e Entretenimento','expense','#a855f7'),
    (null,null,'Vestuário','expense','#06b6d4'),
    (null,null,'Outras Despesas','expense','#64748b'),
    (null,null,'Receitas','income','#16a34a'),
    (null,null,'Poupança','savings','#2563eb')
  on conflict do nothing
  returning id, name
)
select 1;

do $$
declare p uuid;
begin
  -- Alimentação
  select id into p from public.categories where user_id is null and name='Alimentação' and parent_id is null;
  if p is not null then
    insert into public.categories (user_id,parent_id,name,kind) values
      (null,p,'Supermercado','expense'),
      (null,p,'Restaurantes','expense'),
      (null,p,'Cafés','expense')
    on conflict do nothing;
  end if;

  -- Casa
  select id into p from public.categories where user_id is null and name='Casa' and parent_id is null;
  if p is not null then
    insert into public.categories (user_id,parent_id,name,kind) values
      (null,p,'Renda','expense'),
      (null,p,'Utilidades (água, luz, gás)','expense'),
      (null,p,'TV + Internet','expense'),
      (null,p,'Empregada','expense')
    on conflict do nothing;
  end if;

  -- Carros
  select id into p from public.categories where user_id is null and name='Carros' and parent_id is null;
  if p is not null then
    insert into public.categories (user_id,parent_id,name,kind) values
      (null,p,'Combustível','expense'),
      (null,p,'Manutenção do Veículo','expense'),
      (null,p,'Seguro do Veículo','expense')
    on conflict do nothing;
  end if;

  -- Saúde
  select id into p from public.categories where user_id is null and name='Saúde' and parent_id is null;
  if p is not null then
    insert into public.categories (user_id,parent_id,name,kind) values
      (null,p,'Consultas Médicas','expense'),
      (null,p,'Medicamentos','expense')
    on conflict do nothing;
  end if;

  -- Lazer e Entretenimento
  select id into p from public.categories where user_id is null and name='Lazer e Entretenimento' and parent_id is null;
  if p is not null then
    insert into public.categories (user_id,parent_id,name,kind) values
      (null,p,'Viagens','expense'),
      (null,p,'Cinema e Teatro','expense'),
      (null,p,'Hobbies','expense'),
      (null,p,'Mensalidades Escolares','expense'),
      (null,p,'Livros e Materiais','expense'),
      (null,p,'Cursos e Workshops','expense'),
      (null,p,'Remo','expense')
    on conflict do nothing;
  end if;

  -- Vestuário
  select id into p from public.categories where user_id is null and name='Vestuário' and parent_id is null;
  if p is not null then
    insert into public.categories (user_id,parent_id,name,kind) values
      (null,p,'Roupas','expense'),
      (null,p,'Calçados','expense'),
      (null,p,'Acessórios','expense')
    on conflict do nothing;
  end if;

  -- Outras Despesas
  select id into p from public.categories where user_id is null and name='Outras Despesas' and parent_id is null;
  if p is not null then
    insert into public.categories (user_id,parent_id,name,kind) values
      (null,p,'Presentes','expense'),
      (null,p,'Assinaturas e Serviços Online','expense'),
      (null,p,'Telemóveis','expense'),
      (null,p,'Créditos','expense'),
      (null,p,'Doações','expense')
    on conflict do nothing;
  end if;

  -- Receitas
  select id into p from public.categories where user_id is null and name='Receitas' and parent_id is null;
  if p is not null then
    insert into public.categories (user_id,parent_id,name,kind) values
      (null,p,'Ordenado','income'),
      (null,p,'Explicações','income'),
      (null,p,'Extras','income')
    on conflict do nothing;
  end if;

  -- Poupança
  select id into p from public.categories where user_id is null and name='Poupança' and parent_id is null;
  if p is not null then
    insert into public.categories (user_id,parent_id,name,kind) values
      (null,p,'Poupança','savings')
    on conflict do nothing;
  end if;
end $$;

-- ========================================
-- RPC: CRIAR TRANSFERÊNCIA (2 linhas IN/OUT)
-- ========================================
-- limpar assinaturas antigas
drop function if exists public.create_transfer(uuid, uuid, uuid, numeric, date, text, text);
drop function if exists public.create_transfer(uuid, uuid, numeric, date, text, text, text);

create or replace function public.create_transfer(
  p_from_account uuid,
  p_to_account   uuid,
  p_amount       numeric,
  p_date         date,
  p_description  text default null,
  p_notes        text default null,
  p_status_code  text default 'DONE'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  gid uuid := gen_random_uuid();
  v_from_curr text;
  v_to_curr   text;
  v_status_id smallint;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  if p_from_account is null or p_to_account is null or p_from_account = p_to_account then
    raise exception 'Accounts must be different and not null';
  end if;

  if coalesce(p_amount,0) <= 0 then
    raise exception 'Amount must be > 0';
  end if;

  -- garantir que as contas são do utilizador atual
  if not exists(select 1 from public.accounts where id=p_from_account and user_id=v_user) then
    raise exception 'Invalid from account';
  end if;
  if not exists(select 1 from public.accounts where id=p_to_account and user_id=v_user) then
    raise exception 'Invalid to account';
  end if;

  select currency into v_from_curr from public.accounts where id=p_from_account;
  select currency into v_to_curr   from public.accounts where id=p_to_account;

  select id into v_status_id from public.statuses where code = upper(p_status_code);
  if v_status_id is null then
    select id into v_status_id from public.statuses where code='DONE';
  end if;

  -- Saída (TRANSFER_OUT)
  insert into public.transactions (
    user_id,type_id,account_id,date,amount,description,notes,transfer_group_id,
    currency,status_id,payment_method_id
  ) values (
    v_user,
    (select id from public.transaction_types where code='TRANSFER_OUT'),
    p_from_account, p_date, p_amount,
    coalesce(p_description,'Transferência'), p_notes, gid,
    v_from_curr,
    v_status_id,
    (select id from public.payment_methods where code='BANK_TRANSFER')
  );

  -- Entrada (TRANSFER_IN)
  insert into public.transactions (
    user_id,type_id,account_id,date,amount,description,notes,transfer_group_id,
    currency,status_id,payment_method_id
  ) values (
    v_user,
    (select id from public.transaction_types where code='TRANSFER_IN'),
    p_to_account, p_date, p_amount,
    coalesce(p_description,'Transferência'), p_notes, gid,
    v_to_curr,
    v_status_id,
    (select id from public.payment_methods where code='BANK_TRANSFER')
  );

  return gid;
end $$;

revoke all on function public.create_transfer(uuid, uuid, numeric, date, text, text, text) from public;
grant execute on function public.create_transfer(uuid, uuid, numeric, date, text, text, text) to authenticated;

-- ========================================
-- VIEWS (relatórios)
-- ========================================

-- Livro-razão (direção, categoria Pai > Filho)
create or replace view public.v_ledger as
select
  t.id, t.user_id, t.date, t.created_at,
  a.id as account_id, a.name as account_name, a.currency,
  tt.code as type_code,
  case when tt.code in ('INCOME','TRANSFER_IN') then 'IN' else 'OUT' end as direction,
  t.amount as amount_abs,
  t.signed_amount as amount_signed,
  coalesce(pc.name || ' > ' || c.name, c.name, '(Sem categoria)') as category_path,
  t.description, t.location, t.notes, t.transfer_group_id
from public.transactions t
join public.accounts a on a.id = t.account_id
join public.transaction_types tt on tt.id = t.type_id
left join public.categories c  on c.id = t.category_id
left join public.categories pc on pc.id = c.parent_id;

alter view public.v_ledger set (security_invoker = on);

-- Saldos por conta
create or replace view public.v_account_balances as
select
  a.user_id,
  a.id   as account_id,
  a.name as account_name,
  a.currency,
  coalesce(sum(t.signed_amount),0) as balance
from public.accounts a
left join public.transactions t
  on t.account_id = a.id
 and t.user_id    = a.user_id
group by 1,2,3,4;

alter view public.v_account_balances set (security_invoker = on);

-- Resumo mensal (entradas, saídas, poupança, net) — ignora transferências
create or replace view public.v_monthly_summary as
select
  t.user_id,
  date_trunc('month', t.date)::date as month,
  sum(case when tt.code='INCOME'  then  t.amount        else 0 end) as income,
  sum(case when tt.code='EXPENSE' then -t.amount        else 0 end) as expense,
  sum(case when tt.code='SAVINGS' then -t.amount        else 0 end) as savings,
  sum(case when tt.code in ('INCOME','EXPENSE','SAVINGS')
           then t.signed_amount else 0 end)                          as net
from public.transactions t
join public.transaction_types tt on tt.id = t.type_id
group by 1,2;

alter view public.v_monthly_summary set (security_invoker = on);

-- Despesa por categoria (ano corrente)
create or replace view public.v_expense_by_category as
select
  t.user_id,
  coalesce(c.name,'(Sem categoria)') as category,
  sum(case when tt.code='EXPENSE' then -t.signed_amount else 0 end) as total_expense
from public.transactions t
join public.transaction_types tt on tt.id = t.type_id
left join public.categories c on c.id = t.category_id
where date_part('year', t.date) = date_part('year', current_date)
group by 1,2;

alter view public.v_expense_by_category set (security_invoker = on);

-- =====================================================================
-- FIM
-- =====================================================================