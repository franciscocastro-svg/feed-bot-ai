-- Store INTERNAL_CRON_SECRET in vault so cron can authenticate to autopilot
DO $$
DECLARE
  v_secret text;
BEGIN
  -- Place the secret in vault if not already present
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'internal_cron_secret') THEN
    -- placeholder; will be set via insert below if available
    NULL;
  END IF;
END $$;

-- Recreate cron jobs to send the x-internal-secret header read from vault at runtime
SELECT cron.unschedule('fetch-rss-every-5min');
SELECT cron.unschedule('publish-due-every-5min');
SELECT cron.unschedule('fetch-insights-every-30min');
SELECT cron.unschedule('autopilot-every-15min');

SELECT cron.schedule(
  'fetch-rss-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://gewnaxrhiyylfizgbqdi.supabase.co/functions/v1/autopilot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_cron_secret')
    ),
    body := '{"only_fetch": true}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);

SELECT cron.schedule(
  'publish-due-every-5min',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://gewnaxrhiyylfizgbqdi.supabase.co/functions/v1/autopilot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_cron_secret')
    ),
    body := '{"only_publish": true}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);

SELECT cron.schedule(
  'fetch-insights-every-30min',
  '*/30 * * * *',
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

SELECT cron.schedule(
  'autopilot-every-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://gewnaxrhiyylfizgbqdi.supabase.co/functions/v1/autopilot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'internal_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);