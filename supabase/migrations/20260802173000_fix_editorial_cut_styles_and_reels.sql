-- Corrige a compatibilidade dos estilos Bold/Clean no Corte Editorial e
-- adiciona criadores v2 que escolhem com segurança entre Feed 4:5 e Reel 9:16.
-- Os criadores anteriores permanecem compatíveis e continuam gerando 4:5.

CREATE OR REPLACE FUNCTION public.create_editorial_video_cut_job_v2(
  _instagram_account_id uuid,
  _youtube_url text,
  _requested_clips integer,
  _rights_confirmed boolean,
  _subtitle_style text DEFAULT 'clean',
  _format text DEFAULT 'feed_portrait'
) RETURNS public.video_cut_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_job public.video_cut_jobs;
  v_style text := CASE
    WHEN _subtitle_style IN ('none','classic','neon','karaoke','clean','bold') THEN _subtitle_style
    ELSE 'clean'
  END;
  v_legacy_style text;
  v_format text := COALESCE(_format, 'feed_portrait');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Corte Editorial em Beta: acesso exclusivo para administradores.'
      USING ERRCODE = '42501';
  END IF;
  IF v_format NOT IN ('feed_portrait', 'reels') THEN
    RAISE EXCEPTION 'Formato editorial inválido. Use feed_portrait ou reels.';
  END IF;

  -- O criador legado aceita somente estes quatro estilos. A conversão existe
  -- apenas durante a criação; o estilo editorial solicitado é restaurado na
  -- mesma transação antes que o worker consiga enxergar o job.
  v_legacy_style := CASE
    WHEN v_style IN ('bold', 'clean') THEN 'classic'
    ELSE v_style
  END;

  v_job := public.create_video_cut_job(
    _instagram_account_id,
    _youtube_url,
    _requested_clips,
    _rights_confirmed,
    v_format,
    v_legacy_style,
    false,
    true,
    false,
    true,
    ARRAY[v_format]::text[],
    false
  );

  UPDATE public.video_cut_jobs
  SET cut_mode = 'editorial',
      format = v_format,
      formats = ARRAY[v_format]::text[],
      subtitle_style = v_style,
      auto_publish = false,
      hook_enabled = false,
      processing_mode = 'cloud',
      updated_at = now()
  WHERE id = v_job.id
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;

REVOKE ALL ON FUNCTION public.create_editorial_video_cut_job_v2(uuid, text, integer, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_editorial_video_cut_job_v2(uuid, text, integer, boolean, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_editorial_video_cut_job(
  _instagram_account_id uuid,
  _youtube_url text,
  _requested_clips integer,
  _rights_confirmed boolean,
  _subtitle_style text DEFAULT 'clean'
) RETURNS public.video_cut_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_job public.video_cut_jobs;
BEGIN
  v_job := public.create_editorial_video_cut_job_v2(
    _instagram_account_id,
    _youtube_url,
    _requested_clips,
    _rights_confirmed,
    _subtitle_style,
    'feed_portrait'
  );
  RETURN v_job;
END;
$$;

REVOKE ALL ON FUNCTION public.create_editorial_video_cut_job(uuid, text, integer, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_editorial_video_cut_job(uuid, text, integer, boolean, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_editorial_video_cut_upload_job_v2(
  _instagram_account_id uuid,
  _storage_path text,
  _requested_clips integer,
  _rights_confirmed boolean,
  _source_title text DEFAULT NULL,
  _subtitle_style text DEFAULT 'clean',
  _format text DEFAULT 'feed_portrait'
) RETURNS public.video_cut_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_job public.video_cut_jobs;
  v_style text := CASE
    WHEN _subtitle_style IN ('none','classic','neon','karaoke','clean','bold') THEN _subtitle_style
    ELSE 'clean'
  END;
  v_legacy_style text;
  v_format text := COALESCE(_format, 'feed_portrait');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Corte Editorial em Beta: acesso exclusivo para administradores.'
      USING ERRCODE = '42501';
  END IF;
  IF v_format NOT IN ('feed_portrait', 'reels') THEN
    RAISE EXCEPTION 'Formato editorial inválido. Use feed_portrait ou reels.';
  END IF;

  v_legacy_style := CASE
    WHEN v_style IN ('bold', 'clean') THEN 'classic'
    ELSE v_style
  END;

  v_job := public.create_video_cut_upload_job_v2(
    _instagram_account_id,
    _storage_path,
    _requested_clips,
    _rights_confirmed,
    _source_title,
    v_format,
    v_legacy_style,
    false,
    true,
    false,
    true,
    ARRAY[v_format]::text[],
    false
  );

  UPDATE public.video_cut_jobs
  SET cut_mode = 'editorial',
      format = v_format,
      formats = ARRAY[v_format]::text[],
      subtitle_style = v_style,
      auto_publish = false,
      hook_enabled = false,
      processing_mode = 'cloud',
      updated_at = now()
  WHERE id = v_job.id
  RETURNING * INTO v_job;

  RETURN v_job;
END;
$$;

REVOKE ALL ON FUNCTION public.create_editorial_video_cut_upload_job_v2(uuid, text, integer, boolean, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_editorial_video_cut_upload_job_v2(uuid, text, integer, boolean, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_editorial_video_cut_upload_job(
  _instagram_account_id uuid,
  _storage_path text,
  _requested_clips integer,
  _rights_confirmed boolean,
  _source_title text DEFAULT NULL,
  _subtitle_style text DEFAULT 'clean'
) RETURNS public.video_cut_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_job public.video_cut_jobs;
BEGIN
  v_job := public.create_editorial_video_cut_upload_job_v2(
    _instagram_account_id,
    _storage_path,
    _requested_clips,
    _rights_confirmed,
    _source_title,
    _subtitle_style,
    'feed_portrait'
  );
  RETURN v_job;
END;
$$;

REVOKE ALL ON FUNCTION public.create_editorial_video_cut_upload_job(uuid, text, integer, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_editorial_video_cut_upload_job(uuid, text, integer, boolean, text, text) TO authenticated;
