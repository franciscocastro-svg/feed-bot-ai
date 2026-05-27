-- Tabela de trilhas sonoras para Reels (múltiplas, com nome descritivo)
CREATE TABLE public.reel_audio_tracks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  duration_seconds NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reel_audio_tracks_user ON public.reel_audio_tracks(user_id);

ALTER TABLE public.reel_audio_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own reel_audio_tracks" ON public.reel_audio_tracks
FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Guarda qual trilha foi escolhida pra cada notícia (pra debug e reuso)
ALTER TABLE public.news_items
  ADD COLUMN IF NOT EXISTS chosen_audio_track_id UUID,
  ADD COLUMN IF NOT EXISTS chosen_audio_url TEXT;