-- Ejecutar completo en SQL Editor. Requiere 01-library.sql ya instalado.
-- No contiene videos, no crea Storage y no modifica los datos de techniques.
begin;

create table if not exists public.video_metadata (
  technique_id uuid primary key references public.techniques(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('processing','ready','unavailable','error')),
  reason text not null default '' check (reason in ('','instagram','unsupported','not_found','temporary')),
  title text not null default '' check (char_length(title) <= 1000),
  author text not null default '' check (char_length(author) <= 200),
  thumbnail_url text not null default '' check (char_length(thumbnail_url) <= 4096),
  attempted_at timestamptz not null default now(),
  retry_at timestamptz not null default now(),
  request_token uuid not null default gen_random_uuid()
);
create index if not exists video_metadata_user_attempt_idx
  on public.video_metadata(user_id, attempted_at desc);
alter table public.video_metadata enable row level security;
revoke all on public.video_metadata from public, anon, authenticated;
grant select(technique_id,user_id,status,reason,title,author,thumbnail_url,attempted_at,retry_at)
  on public.video_metadata to authenticated;
drop policy if exists metadata_select_own on public.video_metadata;
create policy metadata_select_own on public.video_metadata for select to authenticated
  using ((select auth.uid()) = user_id);

-- Un turno de consulta con vencimiento evita que dos dispositivos consulten a la vez.
-- El propietario se obtiene de techniques; nunca se acepta desde el navegador.
create or replace function public.claim_video_metadata(p_id uuid, p_refresh boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  original_url text;
  row_data public.video_metadata%rowtype;
begin
  if owner_id is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_id::text, 0));
  select t.url into original_url from public.techniques t
    where t.id = p_id and t.user_id = owner_id;
  if not found then raise exception 'NOT_FOUND' using errcode = '42501'; end if;
  select * into row_data from public.video_metadata where technique_id = p_id for update;
  if found then
    if row_data.retry_at > now()
       or (not p_refresh and row_data.status in ('ready','unavailable')) then
      return jsonb_build_object('claimed',false,'metadata',to_jsonb(row_data) - 'request_token');
    end if;
  end if;
  if (select count(*) from public.video_metadata
      where user_id = owner_id and attempted_at > now() - interval '1 minute') >= 30 then
    raise exception 'RATE_LIMIT';
  end if;
  insert into public.video_metadata(technique_id,user_id,status,attempted_at,retry_at)
    values(p_id,owner_id,'processing',now(),now() + interval '1 minute')
    on conflict (technique_id) do update set
      status = 'processing', reason = '', attempted_at = now(),
      retry_at = now() + interval '1 minute', request_token = gen_random_uuid()
    returning * into row_data;
  return jsonb_build_object('claimed',true,'url',original_url,'token',row_data.request_token,
    'metadata',to_jsonb(row_data) - 'request_token');
end;
$$;

-- Solo finaliza el turno vigente del usuario; una respuesta antigua no pisa otra nueva.
create or replace function public.finish_video_metadata(
  p_id uuid, p_token uuid, p_status text, p_reason text,
  p_title text, p_author text, p_thumbnail text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare row_data public.video_metadata%rowtype;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  if p_status not in ('ready','unavailable','error') then raise exception 'INVALID_STATUS'; end if;
  update public.video_metadata set
    status = p_status, reason = p_reason,
    title = case when p_status = 'ready' then p_title else title end,
    author = case when p_status = 'ready' then p_author else author end,
    thumbnail_url = case when p_status = 'ready' then p_thumbnail else thumbnail_url end,
    retry_at = attempted_at + case when p_status = 'error' then interval '5 minutes' else interval '1 minute' end,
    request_token = gen_random_uuid()
    where technique_id = p_id and user_id = auth.uid() and request_token = p_token
    returning * into row_data;
  if not found then
    select * into row_data from public.video_metadata where technique_id = p_id and user_id = auth.uid();
    if not found then raise exception 'NOT_FOUND' using errcode = '42501'; end if;
  end if;
  return to_jsonb(row_data) - 'request_token';
end;
$$;

revoke all on function public.claim_video_metadata(uuid,boolean) from public, anon;
revoke all on function public.finish_video_metadata(uuid,uuid,text,text,text,text,text) from public, anon;
grant execute on function public.claim_video_metadata(uuid,boolean) to authenticated;
grant execute on function public.finish_video_metadata(uuid,uuid,text,text,text,text,text) to authenticated;
commit;
