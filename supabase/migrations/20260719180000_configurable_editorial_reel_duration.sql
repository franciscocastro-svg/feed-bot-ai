-- Reels editoriais configuráveis (6/20/30 segundos).
-- A preferência global é copiada para a notícia no agendamento do Reel. O
-- snapshot mantém retries determinísticos e nunca alcança Cortes IA.

alter table public.user_settings
  add column if not exists editorial_reel_duration_seconds smallint not null default 20;

alter table public.news_items
  add column if not exists editorial_reel_duration_seconds smallint;

update public.user_settings
set editorial_reel_duration_seconds = 20
where editorial_reel_duration_seconds is null
   or editorial_reel_duration_seconds not in (6, 20, 30);

update public.news_items
set editorial_reel_duration_seconds = null
where editorial_reel_duration_seconds not in (6, 20, 30);

alter table public.user_settings
  alter column editorial_reel_duration_seconds set default 20,
  alter column editorial_reel_duration_seconds set not null;

alter table public.news_items
  alter column editorial_reel_duration_seconds drop default,
  alter column editorial_reel_duration_seconds drop not null;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.user_settings'::regclass
      and conname = 'user_settings_editorial_reel_duration_check'
  ) then
    alter table public.user_settings
      add constraint user_settings_editorial_reel_duration_check
      check (editorial_reel_duration_seconds in (6, 20, 30));
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.news_items'::regclass
      and conname = 'news_items_editorial_reel_duration_check'
  ) then
    alter table public.news_items
      add constraint news_items_editorial_reel_duration_check
      check (editorial_reel_duration_seconds in (6, 20, 30));
  end if;
end;
$$;

create or replace function public.tg_snapshot_editorial_reel_duration()
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
  ), 20);

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

revoke all on function public.tg_snapshot_editorial_reel_duration()
  from public, anon, authenticated;

drop trigger if exists snapshot_editorial_reel_duration on public.scheduled_posts;
create trigger snapshot_editorial_reel_duration
before insert or update of media_type, news_item_id, user_id
on public.scheduled_posts
for each row
execute function public.tg_snapshot_editorial_reel_duration();

comment on column public.user_settings.editorial_reel_duration_seconds is
  'Preferência global para novos Reels editoriais de imagem estática: 6, 20 ou 30 segundos.';

comment on column public.news_items.editorial_reel_duration_seconds is
  'Snapshot imutável da duração do Reel editorial; NULL usa fallback 20 até o primeiro agendamento.';

comment on function public.tg_snapshot_editorial_reel_duration() is
  'Copia a duração global para a notícia ao agendar um Reel editorial ainda sem MP4.';
