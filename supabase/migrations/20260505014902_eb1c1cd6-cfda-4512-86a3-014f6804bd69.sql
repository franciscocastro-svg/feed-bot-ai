
-- Templates table for custom post layouts
CREATE TABLE public.post_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'custom', -- 'custom' | 'preset'
  preset_key TEXT, -- when kind='preset': 'minimal_editorial' | 'bold_stripe' | 'breaking_news'
  background_url TEXT, -- uploaded 1080x1080 background (custom only)
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- config schema:
  -- { titleX, titleY, titleSize, titleColor, titleMaxChars, titleAlign,
  --   subtitleX, subtitleY, subtitleSize, subtitleColor,
  --   showBadge, badgeText, badgeX, badgeY, badgeBg, badgeColor,
  --   showHandle, handleX, handleY, handleColor }
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.post_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own templates" ON public.post_templates
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_post_templates_updated_at
  BEFORE UPDATE ON public.post_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_post_templates_user ON public.post_templates(user_id);

-- Add default template ref to user_settings
ALTER TABLE public.user_settings
  ADD COLUMN default_template_id UUID;

-- Storage bucket for template backgrounds
INSERT INTO storage.buckets (id, name, public)
VALUES ('template-backgrounds', 'template-backgrounds', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Template bg public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'template-backgrounds');

CREATE POLICY "Users upload own template bg"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'template-backgrounds' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own template bg"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'template-backgrounds' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own template bg"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'template-backgrounds' AND auth.uid()::text = (storage.foldername(name))[1]);
