CREATE TABLE public.channel_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('feed','story','reel')),
  active boolean NOT NULL DEFAULT true,
  min_interval_minutes integer NOT NULL DEFAULT 60,
  allowed_hours integer[] NOT NULL DEFAULT ARRAY[8,9,10,11,12,13,14,15,16,17,18,19,20,21],
  max_per_day integer NOT NULL DEFAULT 5,
  keywords text[] NOT NULL DEFAULT '{}',
  urgent_keywords text[] NOT NULL DEFAULT '{}',
  is_priority boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, channel)
);

ALTER TABLE public.channel_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own channel_settings" ON public.channel_settings
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER trg_channel_settings_updated
  BEFORE UPDATE ON public.channel_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();