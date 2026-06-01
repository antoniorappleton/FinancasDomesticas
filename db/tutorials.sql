-- =====================================================================
-- WiseBudget - App tutorials admin/content system
-- Run in Supabase SQL Editor.
-- Admin: antonioappleton@gmail.com
-- =====================================================================

create table if not exists public.app_tutorials (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  image_url text,
  video_url text,
  sort_order integer not null default 0,
  is_published boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_app_tutorials_published_order
on public.app_tutorials(is_published, sort_order, created_at desc);

create or replace function public.is_project_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = auth.uid()
      and lower(u.email) = 'antonioappleton@gmail.com'
  )
$$;

create or replace function public.trg_app_tutorials_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
  end if;

  new.updated_at := now();
  return new;
end $$;

drop trigger if exists app_tutorials_defaults on public.app_tutorials;
create trigger app_tutorials_defaults
before insert or update on public.app_tutorials
for each row execute function public.trg_app_tutorials_defaults();

alter table public.app_tutorials enable row level security;

drop policy if exists "tutorials: published read" on public.app_tutorials;
create policy "tutorials: published read"
on public.app_tutorials for select
to authenticated
using (is_published or public.is_project_admin());

drop policy if exists "tutorials: admin insert" on public.app_tutorials;
create policy "tutorials: admin insert"
on public.app_tutorials for insert
to authenticated
with check (public.is_project_admin());

drop policy if exists "tutorials: admin update" on public.app_tutorials;
create policy "tutorials: admin update"
on public.app_tutorials for update
to authenticated
using (public.is_project_admin())
with check (public.is_project_admin());

drop policy if exists "tutorials: admin delete" on public.app_tutorials;
create policy "tutorials: admin delete"
on public.app_tutorials for delete
to authenticated
using (public.is_project_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tutorial-assets',
  'tutorial-assets',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "tutorial-assets: public read" on storage.objects;
create policy "tutorial-assets: public read"
on storage.objects for select
to authenticated
using (bucket_id = 'tutorial-assets');

drop policy if exists "tutorial-assets: admin insert" on storage.objects;
create policy "tutorial-assets: admin insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'tutorial-assets'
  and public.is_project_admin()
);

drop policy if exists "tutorial-assets: admin update" on storage.objects;
create policy "tutorial-assets: admin update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'tutorial-assets'
  and public.is_project_admin()
)
with check (
  bucket_id = 'tutorial-assets'
  and public.is_project_admin()
);

drop policy if exists "tutorial-assets: admin delete" on storage.objects;
create policy "tutorial-assets: admin delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'tutorial-assets'
  and public.is_project_admin()
);

revoke all on function public.is_project_admin() from public;
grant execute on function public.is_project_admin() to authenticated;
