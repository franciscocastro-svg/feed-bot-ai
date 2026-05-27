
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS brand_name text,
  ADD COLUMN IF NOT EXISTS brand_handle text,
  ADD COLUMN IF NOT EXISTS brand_logo_url text;
