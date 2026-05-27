SELECT cron.unschedule('fetch-insights-every-30min');

SELECT cron.schedule(
  'fetch-insights-every-3h',
  '0 */3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://gewnaxrhiyylfizgbqdi.supabase.co/functions/v1/autopilot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_cron_secret')
    ),
    body := '{"only_insights": true}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);