do $phase_1e_a_2_observable_cron$
declare
  v_internal_secret text;
  v_sandbox_url text;
  v_live_url text;
  v_job record;
begin
  if to_regnamespace('cron') is null or to_regnamespace('net') is null then
    raise exception 'required_cron_extensions_missing' using errcode = '55000';
  end if;
  if to_regprocedure('public.dispatch_payment_reconcile(text)') is null then
    raise exception 'reconcile_dispatch_rpc_missing' using errcode = '55000';
  end if;

  select decrypted_secret into v_internal_secret
    from vault.decrypted_secrets
   where name = 'internal_cron_secret'
   limit 1;
  select decrypted_secret into v_sandbox_url
    from vault.decrypted_secrets
   where name = 'PAYMENTS_RECONCILE_URL_SANDBOX'
   limit 1;
  select decrypted_secret into v_live_url
    from vault.decrypted_secrets
   where name = 'PAYMENTS_RECONCILE_URL_LIVE'
   limit 1;

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
    select jobid
      from cron.job
     where jobname in ('payments-reconcile-sandbox', 'payments-reconcile-live')
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$phase_1e_a_2_observable_cron$;

select cron.schedule(
  'payments-reconcile-sandbox',
  '0 3 * * *',
  $payments_reconcile_sandbox$
    select public.dispatch_payment_reconcile('sandbox');
  $payments_reconcile_sandbox$
);

select cron.schedule(
  'payments-reconcile-live',
  '15 3 * * *',
  $payments_reconcile_live$
    select public.dispatch_payment_reconcile('live');
  $payments_reconcile_live$
);