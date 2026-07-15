-- Autopiloto Render Worker 1B
-- Durable, leased claims for automatic Feed/Story/Reel rendering on the VPS.

alter table public.scheduled_posts
  add column if not exists media_render_claimed_at timestamptz,
  add column if not exists media_render_claimed_by text,
  add column if not exists media_render_attempt_count integer not null default 0,
  add column if not exists media_render_next_retry_at timestamptz,
  add column if not exists media_render_last_error text;

create index if not exists idx_scheduled_posts_media_render_queue
  on public.scheduled_posts (media_render_next_retry_at, scheduled_for, id)
  where status = 'scheduled';

create or replace function public.claim_editorial_render_jobs(
  _worker text,
  _limit integer default 1,
  _lease_seconds integer default 300
)
returns table (
  scheduled_post_id uuid,
  user_id uuid,
  instagram_account_id uuid,
  news_item_id uuid,
  media_type text,
  attempt_count integer
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_worker text := nullif(btrim(_worker), '');
  v_limit integer := greatest(1, least(coalesce(_limit, 1), 5));
  v_lease interval := make_interval(secs => greatest(60, least(coalesce(_lease_seconds, 300), 1800)));
begin
  if v_worker is null then
    raise exception 'worker_required' using errcode = '22023';
  end if;

  return query
  with candidates as (
    select sp.id
    from public.scheduled_posts sp
    join public.news_items ni on ni.id = sp.news_item_id and ni.user_id = sp.user_id
    where sp.status = 'scheduled'
      and ni.status = 'scheduled'
      and ni.editorial_ready = false
      and ni.content_type is distinct from 'video_cut'
      and nullif(btrim(ni.rewritten_title), '') is not null
      and nullif(btrim(ni.rewritten_summary), '') is not null
      and (sp.media_render_next_retry_at is null or sp.media_render_next_retry_at <= now())
      and (
        sp.media_render_claimed_at is null
        or sp.media_render_claimed_at < now() - v_lease
      )
    order by sp.scheduled_for asc, sp.id asc
    for update of sp skip locked
    limit v_limit
  ), claimed as (
    update public.scheduled_posts sp
    set media_render_claimed_at = now(),
        media_render_claimed_by = v_worker,
        media_render_attempt_count = sp.media_render_attempt_count + 1,
        media_render_next_retry_at = null,
        media_render_last_error = null
    from candidates c
    where sp.id = c.id
    returning sp.id, sp.user_id, sp.instagram_account_id, sp.news_item_id,
      sp.media_type, sp.media_render_attempt_count
  )
  select c.id, c.user_id, c.instagram_account_id, c.news_item_id,
    c.media_type, c.media_render_attempt_count
  from claimed c;
end;
$$;

create or replace function public.complete_editorial_render_job(
  _scheduled_post_id uuid,
  _worker text,
  _success boolean,
  _error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_row_count integer := 0;
begin
  update public.scheduled_posts sp
  set media_render_claimed_at = null,
      media_render_claimed_by = null,
      media_render_attempt_count = case
        when _success then 0
        else sp.media_render_attempt_count
      end,
      media_render_next_retry_at = case
        when _success then null
        when sp.media_render_attempt_count <= 1 then now() + interval '2 minutes'
        when sp.media_render_attempt_count = 2 then now() + interval '5 minutes'
        else now() + interval '15 minutes'
      end,
      media_render_last_error = case
        when _success then null
        else left(coalesce(nullif(btrim(_error), ''), 'Falha desconhecida na renderização'), 500)
      end
  where sp.id = _scheduled_post_id
    and sp.media_render_claimed_by = nullif(btrim(_worker), '');

  get diagnostics v_row_count = row_count;
  return v_row_count > 0;
end;
$$;

revoke all on function public.claim_editorial_render_jobs(text, integer, integer)
  from public, anon, authenticated;
revoke all on function public.complete_editorial_render_job(uuid, text, boolean, text)
  from public, anon, authenticated;
grant execute on function public.claim_editorial_render_jobs(text, integer, integer)
  to service_role;
grant execute on function public.complete_editorial_render_job(uuid, text, boolean, text)
  to service_role;

comment on function public.claim_editorial_render_jobs(text, integer, integer) is
  'Atomically leases scheduled editorial media jobs to the VPS worker with SKIP LOCKED.';
comment on function public.complete_editorial_render_job(uuid, text, boolean, text) is
  'Releases a fenced media render lease and applies bounded retry backoff.';
