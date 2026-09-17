-- Ejecutar completo en SQL Editor del proyecto Supabase, una vez configurado.
-- Puede repetirse sobre ESTA misma estructura: no elimina videos ni usuarios.
begin;

create table if not exists public.techniques (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  discipline text not null default '' check (char_length(discipline) <= 200),
  position text not null default '' check (char_length(position) <= 200),
  category text not null default '' check (char_length(category) <= 200),
  source text not null check (char_length(source) between 1 and 200),
  url text not null check (octet_length(url) <= 2048 and url ~ '^https?://[^[:space:]]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1 check (revision > 0),
  constraint techniques_user_url_unique unique (user_id, url)
);

create index if not exists techniques_user_created_idx
  on public.techniques(user_id, created_at desc, id desc);

create or replace function public.grappling_touch_technique()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  new.revision = old.revision + 1;
  return new;
end;
$$;

drop trigger if exists grappling_touch_technique on public.techniques;
create trigger grappling_touch_technique before update on public.techniques
  for each row execute function public.grappling_touch_technique();

alter table public.techniques enable row level security;

revoke all on public.techniques from public, anon, authenticated;
grant select, delete on public.techniques to authenticated;
grant insert(user_id, name, discipline, position, category, source, url)
  on public.techniques to authenticated;
grant update(name, discipline, position, category)
  on public.techniques to authenticated;

drop policy if exists grappling_select_own on public.techniques;
create policy grappling_select_own on public.techniques
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists grappling_insert_own on public.techniques;
create policy grappling_insert_own on public.techniques
  for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists grappling_update_own on public.techniques;
create policy grappling_update_own on public.techniques
  for update to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists grappling_delete_own on public.techniques;
create policy grappling_delete_own on public.techniques
  for delete to authenticated using ((select auth.uid()) = user_id);

commit;
