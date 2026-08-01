-- Corrige a ambiguidade entre a variável PL/pgSQL source_id e a coluna
-- news_source_instagram_accounts.source_id durante a aplicação do Piloto Editorial.
-- A RPC continua transacional e idempotente; nenhuma tabela ou dado é alterado aqui.

CREATE OR REPLACE FUNCTION public.apply_editorial_pilot_proposal(
  _account_id uuid,
  _proposal_id text,
  _profile_fingerprint text,
  _sources jsonb,
  _topics jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  owner_id uuid := auth.uid();
  application_id uuid;
  previous_result jsonb;
  source_value jsonb;
  topic_value jsonb;
  v_source_id uuid;
  source_kind_value public.source_kind;
  source_url text;
  source_query text;
  source_fingerprint_value text;
  source_terms text[];
  topic_title text;
  topic_objective text;
  topic_formats text[];
  inserted_sources integer := 0;
  linked_sources integer := 0;
  link_row_count integer := 0;
  inserted_topics integer := 0;
  skipped_topics integer := 0;
  final_result jsonb;
BEGIN
  IF owner_id IS NULL THEN
    RAISE EXCEPTION 'login required';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.instagram_accounts account
    WHERE account.id = _account_id
      AND account.user_id = owner_id
  ) THEN
    RAISE EXCEPTION 'account not found';
  END IF;
  IF COALESCE(_proposal_id, '') !~ '^preview-[a-f0-9]{16}$' THEN
    RAISE EXCEPTION 'invalid proposal id';
  END IF;
  IF COALESCE(_profile_fingerprint, '') !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'invalid profile fingerprint';
  END IF;
  IF jsonb_typeof(_sources) <> 'array' OR jsonb_array_length(_sources) NOT BETWEEN 1 AND 9 THEN
    RAISE EXCEPTION 'select between 1 and 9 validated sources';
  END IF;
  IF jsonb_typeof(_topics) <> 'array' OR jsonb_array_length(_topics) NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'select between 1 and 12 topics';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(owner_id::text), hashtext(_account_id::text));

  SELECT application.result
  INTO previous_result
  FROM public.editorial_pilot_applications application
  WHERE application.user_id = owner_id
    AND application.instagram_account_id = _account_id
    AND application.proposal_id = _proposal_id;

  IF previous_result IS NOT NULL THEN
    RETURN previous_result || jsonb_build_object('replayed', true);
  END IF;

  INSERT INTO public.editorial_pilot_applications (
    user_id,
    instagram_account_id,
    proposal_id,
    profile_fingerprint,
    selection
  ) VALUES (
    owner_id,
    _account_id,
    _proposal_id,
    _profile_fingerprint,
    jsonb_build_object('sources', _sources, 'topics', _topics)
  )
  RETURNING id INTO application_id;

  FOR source_value IN
    SELECT value FROM jsonb_array_elements(_sources)
  LOOP
    source_url := left(btrim(COALESCE(source_value ->> 'url', '')), 2000);
    source_query := NULLIF(left(btrim(COALESCE(source_value ->> 'query', '')), 500), '');
    IF source_url !~* '^https://' THEN
      RAISE EXCEPTION 'validated source must use https';
    END IF;
    IF COALESCE(source_value ->> 'source_kind', '') NOT IN ('rss', 'topic') THEN
      RAISE EXCEPTION 'unsupported source kind';
    END IF;
    source_kind_value := (source_value ->> 'source_kind')::public.source_kind;
    source_terms := ARRAY(
      SELECT left(btrim(value), 120)
      FROM jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(source_value -> 'include_terms') = 'array'
            THEN source_value -> 'include_terms'
          ELSE '[]'::jsonb
        END
      ) AS terms(value)
      WHERE btrim(value) <> ''
      LIMIT 20
    );
    source_fingerprint_value := public.compute_source_fingerprint(
      source_kind_value,
      source_url,
      source_query,
      'BR',
      'pt-BR'
    );

    SELECT source.id
    INTO v_source_id
    FROM public.news_sources source
    WHERE source.user_id = owner_id
      AND source.active
      AND source.source_fingerprint = source_fingerprint_value
    LIMIT 1;

    IF v_source_id IS NULL THEN
      BEGIN
        INSERT INTO public.news_sources (
          user_id,
          name,
          url,
          source_kind,
          query,
          include_terms,
          niche,
          source_config,
          quality_score,
          fetch_interval_minutes,
          active
        ) VALUES (
          owner_id,
          left(COALESCE(NULLIF(btrim(source_value ->> 'name'), ''), 'Fonte editorial'), 180),
          source_url,
          source_kind_value,
          source_query,
          source_terms,
          CASE
            WHEN source_kind_value = 'topic' THEN 'Tema: ' || left(btrim(COALESCE(source_value ->> 'niche', 'Editorial')), 180)
            ELSE 'RSS: ' || left(btrim(COALESCE(source_value ->> 'niche', 'Editorial')), 180)
          END,
          jsonb_build_object(
            'discovered_by', 'editorial-pilot',
            'proposal_id', _proposal_id,
            'profile_fingerprint', _profile_fingerprint,
            'discovery_method', source_value ->> 'discovery_method',
            'relevance', COALESCE(source_value -> 'relevance', '{}'::jsonb)
          ),
          CASE
            WHEN COALESCE(source_value ->> 'quality_score', '') ~ '^[0-9]{1,3}$'
              THEN LEAST(100, (source_value ->> 'quality_score')::integer)
            ELSE 0
          END,
          60,
          true
        )
        RETURNING id INTO v_source_id;
        inserted_sources := inserted_sources + 1;
      EXCEPTION WHEN unique_violation THEN
        SELECT source.id
        INTO v_source_id
        FROM public.news_sources source
        WHERE source.user_id = owner_id
          AND source.active
          AND source.source_fingerprint = source_fingerprint_value
        LIMIT 1;
      END;
    END IF;

    IF v_source_id IS NULL THEN
      RAISE EXCEPTION 'could not resolve source';
    END IF;

    INSERT INTO public.news_source_instagram_accounts (
      source_id,
      instagram_account_id,
      user_id
    ) VALUES (
      v_source_id,
      _account_id,
      owner_id
    )
    ON CONFLICT ON CONSTRAINT news_source_instagram_accounts_pkey DO NOTHING;
    GET DIAGNOSTICS link_row_count = ROW_COUNT;
    IF link_row_count = 1 THEN
      linked_sources := linked_sources + 1;
    END IF;
  END LOOP;

  FOR topic_value IN
    SELECT value FROM jsonb_array_elements(_topics)
  LOOP
    topic_title := left(btrim(COALESCE(topic_value ->> 'title', '')), 500);
    IF topic_title = '' THEN
      RAISE EXCEPTION 'topic title required';
    END IF;
    topic_objective := CASE topic_value ->> 'objective'
      WHEN 'converter' THEN 'vender'
      WHEN 'educar' THEN 'educar'
      WHEN 'engajar' THEN 'engajar'
      WHEN 'autoridade' THEN 'autoridade'
      ELSE 'educar'
    END;
    topic_formats := ARRAY(
      SELECT left(btrim(value), 40)
      FROM jsonb_array_elements_text(
        CASE
          WHEN jsonb_typeof(topic_value -> 'formats') = 'array'
            THEN topic_value -> 'formats'
          ELSE '["feed"]'::jsonb
        END
      ) AS formats(value)
      WHERE btrim(value) <> ''
      LIMIT 4
    );

    IF EXISTS (
      SELECT 1
      FROM public.content_topics topic
      WHERE topic.user_id = owner_id
        AND topic.instagram_account_id = _account_id
        AND lower(btrim(topic.title)) = lower(topic_title)
    ) THEN
      skipped_topics := skipped_topics + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.content_topics (
      user_id,
      instagram_account_id,
      title,
      notes,
      formats,
      active,
      content_pillar,
      objective,
      target_audience,
      funnel_stage,
      tone,
      frequency_per_week,
      priority,
      evergreen,
      source_type
    ) VALUES (
      owner_id,
      _account_id,
      topic_title,
      left(btrim(COALESCE(topic_value ->> 'reason', 'Criada pelo Piloto Editorial.')), 1200),
      CASE WHEN cardinality(topic_formats) > 0 THEN topic_formats ELSE ARRAY['feed']::text[] END,
      true,
      NULLIF(left(btrim(COALESCE(topic_value ->> 'pillar', '')), 180), ''),
      topic_objective,
      NULLIF(left(btrim(COALESCE(topic_value ->> 'target_audience', '')), 500), ''),
      CASE WHEN topic_objective = 'vender' THEN 'conversao' ELSE 'descoberta' END,
      NULLIF(left(btrim(COALESCE(topic_value ->> 'tone', '')), 500), ''),
      CASE
        WHEN COALESCE(topic_value ->> 'frequency_per_week', '') ~ '^[1-7]$'
          THEN (topic_value ->> 'frequency_per_week')::integer
        ELSE 1
      END,
      3,
      true,
      'editorial_pilot'
    );
    inserted_topics := inserted_topics + 1;
  END LOOP;

  final_result := jsonb_build_object(
    'application_id', application_id,
    'proposal_id', _proposal_id,
    'instagram_account_id', _account_id,
    'inserted_sources', inserted_sources,
    'linked_sources', linked_sources,
    'inserted_topics', inserted_topics,
    'skipped_topics', skipped_topics,
    'replayed', false
  );

  UPDATE public.editorial_pilot_applications
  SET result = final_result
  WHERE id = application_id;

  RETURN final_result;
END;
$$;


REVOKE ALL ON FUNCTION public.apply_editorial_pilot_proposal(uuid, text, text, jsonb, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_editorial_pilot_proposal(uuid, text, text, jsonb, jsonb)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';