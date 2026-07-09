
ALTER TABLE public.video_cut_jobs
  ADD COLUMN IF NOT EXISTS source_video_url text,
  ADD COLUMN IF NOT EXISTS source_file_name text;
