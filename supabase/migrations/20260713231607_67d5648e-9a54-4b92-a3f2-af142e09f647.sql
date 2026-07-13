-- =============================================================================
-- Phase 1E-A.2/ii — isolated payment reconciliation + versioned cron
-- =============================================================================

create or replace function public.claim_payment_webhook_effects_for_reconcile(
  p_environment text,
  p_request_id uuid,
  p_limit integer default 100
)
returns table (
  id uuid,
  event_id text,
  effect_type text,
  attempt_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_environment not in ('sandbox', 'live') then
    raise exception 'invalid_environment' using errcode = '22023';
  end if;
  if p_request_id is null then
    raise exception 'missing_request_id' using errcode = '22023';
  end if;

  return query
  with candidates as (
    select effect.id
      from public.payment_webhook_effects as effect
     where effect.provider = 'stripe'
       and effect.environment = p_environment
       and effect.effect_type in (
         'stripe_cancel_after_refund',
         'meta_start_trial',
         'meta_purchase'
       )
       and effect.attempt_count < 8
       and (
         (
           effect.status = 'pending'
           and effect.created_at <= now() - interval '10 minutes'
         )
         or (
           effect.status = 'failed'
           and effect.updated_at <= now() - make_interval(
             secs => least(
               3600,
               (60 * power(2::numeric, least(greatest(effect.attempt_count, 0), 6)))::integer
             )
           )
         )
         or (
           effect.status = 'processing'
           and effect.claim_expires_at is not null
           and effect.claim_expires_at < now()
         )
       )
     order by
       case effect.status when 'processing' then 0 when 'pending' then 1 else 2 end,
       coalesce(effect.claim_expires_at, effect.updated_at, effect.created_at),
       effect.id
     for update skip locked
     limit greatest(1, least(coalesce(p_limit, 100), 500))
  ), claimed as (
    update public.payment_webhook_effects as effect
       set status = 'processing',
           request_id = p_request_id,
           attempt_count = effect.attempt_count + 1,
           started_at = now(),
           completed_at = null,
           error_code = null,
           claim_expires_at = now() + interval '5 minutes',
           updated_at = now()
      from candidates
     where effect.id = candidates.id
    returning effect.id, effect.event_id, effect.effect_type, effect.attempt_count
  )
  select claimed.id, claimed.event_id, claimed.effect_type, claimed.attempt_count
    from claimed
   order by claimed.id;
end;
$$;

revoke all on function public.claim_payment_webhook_effects_for_reconcile(text,uuid,integer) from public;
revoke execute on function public.claim_payment_webhook_effects_for_reconcile(text,uuid,integer)
  from anon, authenticated;
grant execute on function public.claim_payment_webhook_effects_for_reconcile(text,uuid,integer)
  to service_role;

comment on function public.claim_payment_webhook_effects_for_reconcile(text,uuid,integer) is
  'Claims only retry-safe payment effects with SKIP LOCKED, exponential backoff, max 8 attempts, and a fenced 5-minute lease.';

do $phase_1e_a_2_cron$
declare
  v_internal_secret text;
  v_sandbox_url text;
  v_live_url text;
  v_job record;
begin
  if to_regnamespace('cron') is null or to_regnamespace('net') is null then
    raise exception 'required_cron_extensions_missing' using errcode = '55000';
  end if;

  select decrypted_secret into v_internal_secret
    from vault.decrypted_secrets
   where name = 'internal_cron_secret';
  select decrypted_secret into v_sandbox_url
    from vault.decrypted_secrets
   where name = 'PAYMENTS_RECONCILE_URL_SANDBOX';
  select decrypted_secret into v_live_url
    from vault.decrypted_secrets
   where name = 'PAYMENTS_RECONCILE_URL_LIVE';

  if nullif(v_internal_secret, '') is null then
    raise exception 'internal_cron_auth_missing' using errcode = '55000';
  end if;
  if v_sandbox_url is null or v_sandbox_url !~ '^https://[^[:space:]]+$' then
    raise exception 'sandbox_reconcile_url_invalid' using errcode = '55000';
  end if;
  if v_live_url is null or v_live_url !~ '^https://[^[:space:]]+$' then
    raise exception 'live_reconcile_url_invalid' using errcode = '55000';
  end if;

  for v_job in
    select jobid from cron.job
     where jobname in ('payments-reconcile-sandbox', 'payments-reconcile-live')
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$phase_1e_a_2_cron$;

select cron.schedule(
  'payments-reconcile-sandbox',
  '0 3 * * *',
  $payments_reconcile_sandbox$
    select net.http_post(
      url := (
        select decrypted_secret
          from vault.decrypted_secrets
         where name = 'PAYMENTS_RECONCILE_URL_SANDBOX'
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', (
          select decrypted_secret
            from vault.decrypted_secrets
           where name = 'internal_cron_secret'
        )
      ),
      body := '{"environment":"sandbox"}'::jsonb
    );
  $payments_reconcile_sandbox$
);

select cron.schedule(
  'payments-reconcile-live',
  '15 3 * * *',
  $payments_reconcile_live$
    select net.http_post(
      url := (
        select decrypted_secret
          from vault.decrypted_secrets
         where name = 'PAYMENTS_RECONCILE_URL_LIVE'
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', (
          select decrypted_secret
            from vault.decrypted_secrets
           where name = 'internal_cron_secret'
        )
      ),
      body := '{"environment":"live"}'::jsonb
    );
  $payments_reconcile_live$
);