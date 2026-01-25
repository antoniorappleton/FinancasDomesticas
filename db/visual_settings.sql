-- Tabela de configurações visuais por utilizador
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  bg_image_url text,
  bg_overlay_color text default 'rgba(0,0,0,0.35)',
  bg_overlay_opacity numeric default 0.35,
  bg_overlay_blur integer default 0,
  card_bg_color text default 'rgba(255,255,255,0.92)',
  card_border_color text default 'rgba(255,255,255,0.12)',
  card_backdrop_blur integer default 0,
  updated_at timestamptz default now()
);

-- RLS
alter table public.user_settings enable row level security;

create policy "Users can view their own settings"
  on public.user_settings for select
  using (auth.uid() = user_id);

create policy "Users can update their own settings"
  on public.user_settings for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own settings update"
  on public.user_settings for update
  using (auth.uid() = user_id);
