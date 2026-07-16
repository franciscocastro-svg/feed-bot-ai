-- Template Studio 2A.3
CREATE TABLE IF NOT EXISTS public.account_brand_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  instagram_account_id uuid NOT NULL REFERENCES public.instagram_accounts(id) ON DELETE CASCADE,
  primary_color text NOT NULL DEFAULT '#18111B' CHECK (primary_color ~ '^#[0-9A-Fa-f]{6}$'),
  secondary_color text NOT NULL DEFAULT '#34132D' CHECK (secondary_color ~ '^#[0-9A-Fa-f]{6}$'),
  accent_color text NOT NULL DEFAULT '#FACC15' CHECK (accent_color ~ '^#[0-9A-Fa-f]{6}$'),
  background_color text NOT NULL DEFAULT '#0A0A0A' CHECK (background_color ~ '^#[0-9A-Fa-f]{6}$'),
  text_color text NOT NULL DEFAULT '#FFFFFF' CHECK (text_color ~ '^#[0-9A-Fa-f]{6}$'),
  heading_font text NOT NULL DEFAULT 'Inter' CHECK (heading_font IN ('Inter', 'Montserrat', 'Poppins', 'Lora')),
  body_font text NOT NULL DEFAULT 'Inter' CHECK (body_font IN ('Inter', 'Montserrat', 'Poppins', 'Lora')),
  visual_style text NOT NULL DEFAULT 'editorial' CHECK (visual_style IN ('editorial', 'impacto', 'minimalista', 'premium', 'tipografico')),
  logo_light_url text CHECK (logo_light_url IS NULL OR (length(logo_light_url) <= 2048 AND logo_light_url ~ '^https://')),
  logo_dark_url text CHECK (logo_dark_url IS NULL OR (length(logo_dark_url) <= 2048 AND logo_dark_url ~ '^https://')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (instagram_account_id)
);

CREATE INDEX IF NOT EXISTS idx_account_brand_kits_owner
  ON public.account_brand_kits (user_id, instagram_account_id);

ALTER TABLE public.account_brand_kits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "owners read account brand kits" ON public.account_brand_kits;
CREATE POLICY "owners read account brand kits"
  ON public.account_brand_kits FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON public.account_brand_kits FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.account_brand_kits TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_brand_kits TO service_role;

INSERT INTO public.account_brand_kits (user_id, instagram_account_id)
SELECT account.user_id, account.id
FROM public.instagram_accounts account
ON CONFLICT (instagram_account_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_account_brand_kit(_account_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  owner_id uuid := auth.uid();
  result jsonb;
BEGIN
  IF owner_id IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.instagram_accounts
    WHERE id = _account_id AND user_id = owner_id
  ) THEN RAISE EXCEPTION 'Instagram account not found'; END IF;

  SELECT jsonb_build_object(
    'brandName', COALESCE(NULLIF(btrim(settings.brand_name), ''), account.username),
    'brandHandle', COALESCE(NULLIF(btrim(settings.brand_handle), ''), account.username),
    'logoPrimaryUrl', NULLIF(btrim(settings.brand_logo_url), ''),
    'logoLightUrl', kit.logo_light_url,
    'logoDarkUrl', kit.logo_dark_url,
    'primaryColor', kit.primary_color,
    'secondaryColor', kit.secondary_color,
    'accentColor', kit.accent_color,
    'backgroundColor', kit.background_color,
    'textColor', kit.text_color,
    'headingFont', kit.heading_font,
    'bodyFont', kit.body_font,
    'visualStyle', kit.visual_style,
    'version', kit.version,
    'niche', COALESCE(NULLIF(btrim(settings.default_niche), ''), NULLIF(btrim(account.niche), '')),
    'configured', settings.brand_name IS NOT NULL
      OR settings.brand_handle IS NOT NULL
      OR settings.brand_logo_url IS NOT NULL
      OR kit.version > 1
  ) INTO result
  FROM public.instagram_accounts account
  LEFT JOIN public.account_settings settings
    ON settings.instagram_account_id = account.id AND settings.user_id = owner_id
  LEFT JOIN public.account_brand_kits kit
    ON kit.instagram_account_id = account.id AND kit.user_id = owner_id
  WHERE account.id = _account_id AND account.user_id = owner_id;

  RETURN COALESCE(result, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.save_account_brand_kit(_account_id uuid, _kit jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  owner_id uuid := auth.uid();
  account_username text;
  brand_name text := left(btrim(COALESCE(_kit->>'brandName', '')), 100);
  brand_handle text := left(regexp_replace(btrim(COALESCE(_kit->>'brandHandle', '')), '^@', ''), 80);
  primary_logo text := NULLIF(btrim(_kit->>'logoPrimaryUrl'), '');
  light_logo text := NULLIF(btrim(_kit->>'logoLightUrl'), '');
  dark_logo text := NULLIF(btrim(_kit->>'logoDarkUrl'), '');
  primary_value text := upper(COALESCE(_kit->>'primaryColor', '#18111B'));
  secondary_value text := upper(COALESCE(_kit->>'secondaryColor', '#34132D'));
  accent_value text := upper(COALESCE(_kit->>'accentColor', '#FACC15'));
  background_value text := upper(COALESCE(_kit->>'backgroundColor', '#0A0A0A'));
  text_value text := upper(COALESCE(_kit->>'textColor', '#FFFFFF'));
  heading_value text := COALESCE(_kit->>'headingFont', 'Inter');
  body_value text := COALESCE(_kit->>'bodyFont', 'Inter');
  style_value text := COALESCE(_kit->>'visualStyle', 'editorial');
BEGIN
  IF owner_id IS NULL THEN RAISE EXCEPTION 'login required'; END IF;
  IF jsonb_typeof(COALESCE(_kit, '{}'::jsonb)) <> 'object' THEN RAISE EXCEPTION 'invalid brand kit'; END IF;

  SELECT username INTO account_username
  FROM public.instagram_accounts
  WHERE id = _account_id AND user_id = owner_id;
  IF account_username IS NULL THEN RAISE EXCEPTION 'Instagram account not found'; END IF;

  IF brand_name = '' THEN brand_name := account_username; END IF;
  IF brand_handle = '' THEN brand_handle := account_username; END IF;
  IF primary_value !~ '^#[0-9A-F]{6}$'
     OR secondary_value !~ '^#[0-9A-F]{6}$'
     OR accent_value !~ '^#[0-9A-F]{6}$'
     OR background_value !~ '^#[0-9A-F]{6}$'
     OR text_value !~ '^#[0-9A-F]{6}$' THEN
    RAISE EXCEPTION 'invalid brand color';
  END IF;
  IF heading_value NOT IN ('Inter', 'Montserrat', 'Poppins', 'Lora')
     OR body_value NOT IN ('Inter', 'Montserrat', 'Poppins', 'Lora') THEN
    RAISE EXCEPTION 'unsupported brand font';
  END IF;
  IF style_value NOT IN ('editorial', 'impacto', 'minimalista', 'premium', 'tipografico') THEN
    RAISE EXCEPTION 'invalid visual style';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(ARRAY[primary_logo, light_logo, dark_logo]) value
    WHERE value IS NOT NULL AND (length(value) > 2048 OR value !~ '^https://')
  ) THEN RAISE EXCEPTION 'invalid brand logo url'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('brand-kit:' || _account_id::text, 0));

  INSERT INTO public.account_settings (
    user_id, instagram_account_id, brand_name, brand_handle, brand_logo_url
  ) VALUES (
    owner_id, _account_id, brand_name, brand_handle, primary_logo
  ) ON CONFLICT (instagram_account_id) DO UPDATE SET
    brand_name = EXCLUDED.brand_name,
    brand_handle = EXCLUDED.brand_handle,
    brand_logo_url = EXCLUDED.brand_logo_url,
    updated_at = now()
  WHERE public.account_settings.user_id = owner_id;

  INSERT INTO public.account_brand_kits (
    user_id, instagram_account_id, primary_color, secondary_color,
    accent_color, background_color, text_color, heading_font, body_font,
    visual_style, logo_light_url, logo_dark_url, version
  ) VALUES (
    owner_id, _account_id, primary_value, secondary_value,
    accent_value, background_value, text_value, heading_value, body_value,
    style_value, light_logo, dark_logo, 1
  ) ON CONFLICT (instagram_account_id) DO UPDATE SET
    primary_color = EXCLUDED.primary_color,
    secondary_color = EXCLUDED.secondary_color,
    accent_color = EXCLUDED.accent_color,
    background_color = EXCLUDED.background_color,
    text_color = EXCLUDED.text_color,
    heading_font = EXCLUDED.heading_font,
    body_font = EXCLUDED.body_font,
    visual_style = EXCLUDED.visual_style,
    logo_light_url = EXCLUDED.logo_light_url,
    logo_dark_url = EXCLUDED.logo_dark_url,
    version = public.account_brand_kits.version + 1,
    updated_at = now()
  WHERE public.account_brand_kits.user_id = owner_id;

  RETURN public.get_account_brand_kit(_account_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_account_brand_kit(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_account_brand_kit(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_account_brand_kit(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_account_brand_kit(uuid, jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';