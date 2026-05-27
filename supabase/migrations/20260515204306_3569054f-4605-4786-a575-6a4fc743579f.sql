
ALTER TABLE public.support_messages
  ADD COLUMN IF NOT EXISTS audio_url TEXT,
  ADD COLUMN IF NOT EXISTS audio_duration_seconds NUMERIC;

ALTER TABLE public.support_messages ALTER COLUMN body DROP NOT NULL;
ALTER TABLE public.support_messages
  ADD CONSTRAINT support_messages_body_or_audio CHECK (
    (body IS NOT NULL AND length(btrim(body)) > 0) OR audio_url IS NOT NULL
  );

-- Realtime
ALTER TABLE public.support_messages REPLICA IDENTITY FULL;
ALTER TABLE public.support_tickets  REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('support-audio', 'support-audio', false)
ON CONFLICT (id) DO NOTHING;

-- Policies: files are stored under {ticket_id}/{filename}
CREATE POLICY "support audio: ticket owner or admin can read"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'support-audio' AND (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id::text = (storage.foldername(name))[1]
        AND t.user_id = auth.uid()
    )
  )
);

CREATE POLICY "support audio: ticket owner or admin can upload"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'support-audio' AND (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id::text = (storage.foldername(name))[1]
        AND t.user_id = auth.uid()
    )
  )
);

CREATE POLICY "support audio: owner or admin can delete"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'support-audio' AND (
    public.is_admin() OR EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id::text = (storage.foldername(name))[1]
        AND t.user_id = auth.uid()
    )
  )
);
