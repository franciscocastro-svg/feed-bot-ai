-- Entrega Segura 1A.2-B.1
-- Reconcilia as migrations editoriais sem reescrever historico nem preencher
-- snapshots existentes. O snapshot passa a ocorrer exclusivamente no primeiro
-- agendamento elegivel em scheduled_posts.

begin;

alter table public.user_settings
  add column if not exists editorial_reel_duration_seconds smallint not null default 20;

alter table public.news_items
  add column if not exists editorial_reel_duration_seconds smallint;

do $$
declare
  v_user_settings_type text;
  v_news_items_type text;
begin
  select columns.data_type
    into v_user_settings_type
  from information_schema.columns
  where columns.table_schema = 'public'
    and columns.table_name = 'user_settings'
    and columns.column_name = 'editorial_reel_duration_seconds';

  select columns.data_type
    into v_news_items_type
  from information_schema.columns
  where columns.table_schema = 'public'
    and columns.table_name = 'news_items'
    and columns.column_name = 'editorial_reel_duration_seconds';

  if v_user_settings_type is distinct from 'smallint' then
    raise exception 'editorial_duration_user_settings_type_mismatch';
  end if;

  if v_news_items_type is distinct from 'smallint' then
    raise exception 'editorial_duration_news_items_type_mismatch';
  end if;
end;
$$;

alter table public.user_settings
  alter column editorial_reel_duration_seconds set default 20,
  alter column editorial_reel_duration_seconds set not null;

alter table public.news_items
  alter column editorial_reel_duration_seconds drop default,
  alter column editorial_reel_duration_seconds drop not null;

-- Consolida tanto os nomes explicitos da migration original quanto os nomes
-- gerados automaticamente pela migration aditiva observada no Gate M0.
alter table public.user_settings
  drop constraint if exists user_settings_editorial_reel_duration_check,
  drop constraint if exists user_settings_editorial_reel_duration_seconds_check;

alter table public.news_items
  drop constraint if exists news_items_editorial_reel_duration_check,
  drop constraint if exists news_items_editorial_reel_duration_seconds_check;

alter table public.user_settings
  add constraint user_settings_editorial_reel_duration_check
  check (editorial_reel_duration_seconds in (6, 20, 30)) not valid;

alter table public.news_items
  add constraint news_items_editorial_reel_duration_check
  check (
    editorial_reel_duration_seconds is null
    or editorial_reel_duration_seconds in (6, 20, 30)
  ) not valid;

alter table public.user_settings
  validate constraint user_settings_editorial_reel_duration_check;

alter table public.news_items
  validate constraint news_items_editorial_reel_duration_check;

-- A funcao historica foi usada por triggers com tipos de NEW incompatíveis.
-- Removemos primeiro todas as dependencias conhecidas, sem remocao automatica:
-- uma dependencia inesperada deve abortar a migration e preservar o estado anterior.
drop trigger if exists snapshot_editorial_reel_duration on public.news_items;
drop trigger if exists snapshot_editorial_reel_duration on public.scheduled_posts;
drop trigger if exists snapshot_editorial_reel_duration_from_scheduled_post
  on public.scheduled_posts;

drop function if exists public.tg_snapshot_editorial_reel_duration();
drop function if exists public.tg_snapshot_editorial_reel_duration_from_scheduled_post();

create function public.tg_snapshot_editorial_reel_duration_from_scheduled_post()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_duration smallint := 20;
begin
  if new.media_type is distinct from 'reel' then
    return new;
  end if;

  v_duration := coalesce((
    select settings.editorial_reel_duration_seconds
    from public.user_settings as settings
    where settings.user_id = new.user_id
  ), 20::smallint);

  update public.news_items as item
  set editorial_reel_duration_seconds = v_duration
  where item.id = new.news_item_id
    and item.user_id = new.user_id
    and item.content_type is distinct from 'video_cut'
    and item.content_format is distinct from 'carrossel'
    and item.generated_video_url is null
    and item.editorial_reel_duration_seconds is null;

  return new;
end;
$$;

revoke all on function public.tg_snapshot_editorial_reel_duration_from_scheduled_post()
  from public, anon, authenticated;

create trigger snapshot_editorial_reel_duration_from_scheduled_post
before insert or update of media_type, news_item_id, user_id
on public.scheduled_posts
for each row
execute function public.tg_snapshot_editorial_reel_duration_from_scheduled_post();

comment on column public.user_settings.editorial_reel_duration_seconds is
  'Preferencia global para novos Reels editoriais de imagem estatica: 6, 20 ou 30 segundos.';

comment on column public.news_items.editorial_reel_duration_seconds is
  'Snapshot first-write-wins no primeiro agendamento elegivel; NULL preserva fallback 20.';

comment on function public.tg_snapshot_editorial_reel_duration_from_scheduled_post() is
  'Copia a duracao global no primeiro agendamento de Reel editorial sem MP4; ignora Cortes IA e carrosseis.';

commit;
