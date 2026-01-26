-- Tabela de configurações visuais por utilizador (Schema V2)
-- Compatível com o sistema "Tema Visual Global"

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  bg_image_url text,
  bg_color text,
  bg_blur_px integer,
  overlay_color text,
  card_bg_rgba text,
  card_border_rgba text,
  card_blur_px integer,
  header_bg_rgba text,
  menu_bg_rgba text,
  fab_bg text,
  updated_at timestamptz default now()
);

-- RLS (Row Level Security)
alter table public.user_settings enable row level security;

-- Policy: Select (View own settings)
create policy "Users can view their own settings"
  on public.user_settings for select
  using (auth.uid() = user_id);

-- Policy: Insert (Create own settings)
create policy "Users can insert their own settings"
  on public.user_settings for insert
  with check (auth.uid() = user_id);

-- Policy: Update (Update own settings)
create policy "Users can update their own settings"
  on public.user_settings for update
  using (auth.uid() = user_id);
