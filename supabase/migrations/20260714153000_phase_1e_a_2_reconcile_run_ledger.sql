-- =============================================================================
-- Phase 1E-A.2/ii-b — durable, sanitized payment reconciliation ledger
--
-- This migration does not change subscription, payment, refund or effect data.
-- It creates a private dispatch/run ledger and service-role-only RPCs used by
-- the existing payments-reconcile Edge Function and the versioned cron jobs.
-- =============================================================================

create table if not exists public.payment_reconcile_runs (
  id uuid primary key default gen_random_uuid(),
  environment text not null,
  trigger_source text not null default 'cron',
  status text not null default 'queued',
  pg_net_request_id bigint unique,
  edge_request_id uuid,
  queued_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms bigint,
  response_http_status integer,
  subs_scanned integer not null default 0,
  subs_updated integer not null default 0,
  divergences integer not null default 0,
  effects_recovered integer not null default 0,
  errors_count integer not null default 0,
  error_code text,
  constraint payment_reconcile_runs_environment_check
    check (environment in ('sandbox', 'live')),
  constraint payment_reconcile_runs_trigger_source_check
    check (trigger_source in ('cron', 'legacy_cron')),
  constraint payment_reconcile_runs_status_check
    check (status in ('queued', 'running', 'completed', 'completed_with_errors', 'failed')),
  constraint payment_reconcile_runs_duration_check
    check (duration_ms is null or duration_ms >= 0),
  constraint payment_reconcile_runs_http_status_check
    check (response_http_status is null or response_http_status between 100 and 599),
  constraint payment_reconcile_runs_metrics_check
    check (
      subs_scanned >= 0 and
      subs_updated >= 0 and
      divergences >= 0 and
      effects_recovered >= 0 and
      errors_count >= 0
    ),
  constraint payment_reconcile_runs_error_code_check
    check (error_code is null or error_code ~ '^[A-Za-z0-9_.-]{1,40}$')
);

create index if not exists payment_reconcile_runs_environment_queued_idx
  on public.payment_reconcile_runs (environment, queued_at desc);

create index if not exists payment_reconcile_runs_unfinished_idx
  on public.payment_reconcile_runs (status, queued_at)
  where status in ('queued', 'running');

alter table public.payment_reconcile_runs enable row level security;

revoke all on table public.payment_reconcile_runs from public, anon, authenticated;
grant select, insert, update on table public.payment_reconcile_runs to service_role;

comment on table public.payment_reconcile_runs is
  'Private, sanitized delivery and execution ledger for payments-reconcile. Contains no customer, payment, payload, header or secret data.';

-- A cron dispatch is committed together with the pg_net queue insertion. If
-- pg_net cannot enqueue, the transaction rolls back and no false queued run is
-- retained. Values from Vault are used in memory and never stored here.
create or replace function public.dispatch_payment_reconcile(
  p_environment text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_run_id uuid;
  v_request_id bigint;
  v_url text;
  v_internal_secret text;
begin
  if p_environment not in ('sandbox', 'live') then
    raise exception 'invalid_environment' using errcode = '22023';
  end if;
  if to_regnamespace('net') is null then
    raise exception 'pg_net_missing' using errcode = '55000';
  end if;

  select decrypted_secret
    into v_internal_secret
    from vault.decrypted_secrets
   where name = 'internal_cron_secret'
   limit 1;

  select decrypted_secret
    into v_url
    from vault.decrypted_secrets
   where name = case
     when p_environment = 'sandbox' then 'PAYMENTS_RECONCILE_URL_SANDBOX'
     else 'PAYMENTS_RECONCILE_URL_LIVE'
   end
   limit 1;

  if nullif(v_internal_secret, '') is null then
    raise exception 'internal_cron_auth_missing' using errcode = '55000';
  end if;
  if v_url is null or v_url !~ '^https://[^[:space:]]+$' then
    raise exception 'reconcile_url_invalid' using errcode = '55000';
  end if;

  insert into public.payment_reconcile_runs (
    environment,
    trigger_source,
    status
  ) values (
    p_environment,
    'cron',
    'queued'
  )
  returning id into v_run_id;

  select net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', v_internal_secret
    ),
    body := jsonb_build_object(
      'environment', p_environment,
      'run_id', v_run_id
    ),
    timeout_milliseconds := 120000
  )
  into v_request_id;

  if v_request_id is null then
    raise exception 'pg_net_enqueue_failed' using errcode = '55000';
  end if;

  update public.payment_reconcile_runs
     set pg_net_request_id = v_request_id
   where id = v_run_id;

  return v_run_id;
end;
$$;

-- Starts a queued correlated run. A null run id is accepted only as a safe
-- transition path for the already-installed legacy cron body; it creates a
-- private ledger row before any Stripe or subscription work begins.
create or replace function public.begin_payment_reconcile_run(
  p_run_id uuid,
  p_environment text,
  p_edge_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_run_id uuid;
begin
  if p_environment not in ('sandbox', 'live') then
    raise exception 'invalid_environment' using errcode = '22023';
  end if;
  if p_edge_request_id is null then
    raise exception 'missing_edge_request_id' using errcode = '22023';
  end if;

  if p_run_id is null then
    insert into public.payment_reconcile_runs (
      environment,
      trigger_source,
      status,
      edge_request_id,
      started_at
    ) values (
      p_environment,
      'legacy_cron',
      'running',
      p_edge_request_id,
      now()
    )
    returning id into v_run_id;
  else
    update public.payment_reconcile_runs
       set status = 'running',
           edge_request_id = p_edge_request_id,
           started_at = now(),
           finished_at = null,
           error_code = null
     where id = p_run_id
       and environment = p_environment
       and status = 'queued'
    returning id into v_run_id;
  end if;

  return v_run_id;
end;
$$;

create or replace function public.complete_payment_reconcile_run(
  p_run_id uuid,
  p_environment text,
  p_edge_request_id uuid,
  p_status text,
  p_response_http_status integer,
  p_duration_ms bigint,
  p_subs_scanned integer,
  p_subs_updated integer,
  p_divergences integer,
  p_effects_recovered integer,
  p_errors_count integer,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_environment not in ('sandbox', 'live') then
    raise exception 'invalid_environment' using errcode = '22023';
  end if;
  if p_status not in ('completed', 'completed_with_errors', 'failed') then
    raise exception 'invalid_run_status' using errcode = '22023';
  end if;
  if p_response_http_status not between 100 and 599 then
    raise exception 'invalid_http_status' using errcode = '22023';
  end if;
  if p_duration_ms < 0 or
     p_subs_scanned < 0 or
     p_subs_updated < 0 or
     p_divergences < 0 or
     p_effects_recovered < 0 or
     p_errors_count < 0 then
    raise exception 'invalid_run_metrics' using errcode = '22023';
  end if;
  if p_error_code is not null and p_error_code !~ '^[A-Za-z0-9_.-]{1,40}$' then
    raise exception 'invalid_error_code' using errcode = '22023';
  end if;

  update public.payment_reconcile_runs
     set status = p_status,
         finished_at = now(),
         duration_ms = p_duration_ms,
         response_http_status = p_response_http_status,
         subs_scanned = p_subs_scanned,
         subs_updated = p_subs_updated,
         divergences = p_divergences,
         effects_recovered = p_effects_recovered,
         errors_count = p_errors_count,
         error_code = p_error_code
   where id = p_run_id
     and environment = p_environment
     and edge_request_id = p_edge_request_id
     and status = 'running';

  return found;
end;
$$;

revoke all on function public.dispatch_payment_reconcile(text) from public;
revoke execute on function public.dispatch_payment_reconcile(text) from anon, authenticated;
grant execute on function public.dispatch_payment_reconcile(text) to postgres, service_role;

revoke all on function public.begin_payment_reconcile_run(uuid,text,uuid) from public;
revoke execute on function public.begin_payment_reconcile_run(uuid,text,uuid) from anon, authenticated;
grant execute on function public.begin_payment_reconcile_run(uuid,text,uuid) to service_role;

revoke all on function public.complete_payment_reconcile_run(uuid,text,uuid,text,integer,bigint,integer,integer,integer,integer,integer,text) from public;
revoke execute on function public.complete_payment_reconcile_run(uuid,text,uuid,text,integer,bigint,integer,integer,integer,integer,integer,text) from anon, authenticated;
grant execute on function public.complete_payment_reconcile_run(uuid,text,uuid,text,integer,bigint,integer,integer,integer,integer,integer,text) to service_role;

comment on function public.dispatch_payment_reconcile(text) is
  'Creates a sanitized cron dispatch record and queues payments-reconcile through pg_net in the same transaction.';
comment on function public.begin_payment_reconcile_run(uuid,text,uuid) is
  'Claims a correlated queued reconciliation run, or creates a transitional legacy-cron run, before external work starts.';
comment on function public.complete_payment_reconcile_run(uuid,text,uuid,text,integer,bigint,integer,integer,integer,integer,integer,text) is
  'Fenced terminal update for sanitized reconciliation metrics; service_role only.';
