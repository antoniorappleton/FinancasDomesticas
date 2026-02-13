-- ========================================
-- PUSH NOTIFICATIONS
-- ========================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint uq_user_endpoint unique(user_id, endpoint)
);

-- Garantir que as colunas novas existem se a tabela já existia
alter table public.push_subscriptions add column if not exists user_agent text;
alter table public.push_subscriptions add column if not exists updated_at timestamptz default now();

alter table public.push_subscriptions enable row level security;

-- Trigger para updated_at
create or replace function public.trg_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_push_subs_updated_at on public.push_subscriptions;
create trigger trg_push_subs_updated_at
before update on public.push_subscriptions
for each row execute function public.trg_set_updated_at();

-- Index for performance
create index if not exists idx_push_subscriptions_user_id on public.push_subscriptions(user_id);

-- Add notification settings to profiles
alter table public.profiles add column if not exists notification_settings jsonb default '{
  "urgent": true,
  "smart": true,
  "digest": true,
  "quiet_start": "22:00",
  "quiet_end": "08:00"
}'::jsonb;

-- Policies for push_subscriptions
drop policy if exists "subscriptions: owner read" on public.push_subscriptions;
create policy "subscriptions: owner read" on public.push_subscriptions for select using (user_id = auth.uid());

drop policy if exists "subscriptions: owner insert" on public.push_subscriptions;
create policy "subscriptions: owner insert" on public.push_subscriptions for insert with check (user_id = auth.uid());

drop policy if exists "subscriptions: owner update" on public.push_subscriptions;
create policy "subscriptions: owner update" on public.push_subscriptions for update using (user_id = auth.uid());

drop policy if exists "subscriptions: owner delete" on public.push_subscriptions;
drop policy if exists "subscriptions: owner update" on public.push_subscriptions;
create policy "subscriptions: owner update" on public.push_subscriptions for update using (user_id = auth.uid());

drop policy if exists "subscriptions: owner delete" on public.push_subscriptions;
create policy "subscriptions: owner delete" on public.push_subscriptions for delete using (user_id = auth.uid());
