import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { generateTopicJson } from "../_shared/topic-ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const withoutControlCharacters = (value: unknown) => Array.from(String(value || ""))
  .map((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? " " : character;
  })
  .join("");

const clean = (value: unknown, limit: number) => withoutControlCharacters(value)
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, limit);

const normalize = (value: unknown) => clean(value, 4000)
  .toLocaleLowerCase("pt-BR")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

function neutralDraft(transcript: string, fallbackTitle: string) {
  const excerpt = clean(transcript, 240);
  return {
    title: clean(fallbackTitle, 100) || "O ponto principal deste trecho",
    comment: excerpt || "O conteúdo deste trecho precisa ser conferido antes da publicação.",
    confidence: 0,
    review_required: true,
    safety_reason: "insufficient_confirmed_context",
  };
}

function safeDraft(raw: Record<string, unknown>, transcript: string, fallbackTitle: string) {
  const fallback = neutralDraft(transcript, fallbackTitle);
  const title = clean(raw.title, 140);
  const comment = clean(raw.comment, 600);
  const confidence = Math.max(0, Math.min(1, Number(raw.confidence) || 0));
  const evidence = (Array.isArray(raw.evidence) ? raw.evidence : []).map((item) => clean(item, 180)).filter(Boolean);
  const source = normalize(transcript);
  const evidenceOk = evidence.length > 0 && evidence.every((item) => {
    const normalized = normalize(item);
    return normalized.length >= 8 && source.includes(normalized);
  });
  const numbers = `${title} ${comment}`.match(/\b\d+(?:[.,]\d+)?\b/g) || [];
  const numbersOk = numbers.every((number) => transcript.includes(number));
  if (title.length < 4 || comment.length < 10 || confidence < 0.72 || !evidenceOk || !numbersOk) {
    return {
      ...fallback,
      safety_reason: !numbersOk ? "unsupported_numeric_claim" : !evidenceOk ? "missing_transcript_evidence" : "low_confidence",
    };
  }
  return {
    title,
    comment,
    confidence,
    review_required: Boolean(raw.review_required),
    safety_reason: null,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authorization = request.headers.get("Authorization") || "";
    if (!authorization) return json({ error: "unauthorized" }, 401);
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authorization } } },
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: approved } = await adminClient.rpc("is_approved", { _uid: user.id });
    if (approved === false) return json({ error: "account_not_approved" }, 403);

    const body = await request.json().catch(() => ({}));
    const clipId = typeof body?.clip_id === "string" ? body.clip_id : "";
    if (!/^[0-9a-f-]{36}$/i.test(clipId)) return json({ error: "invalid_clip" }, 400);

    const { data: clip, error: clipError } = await userClient
      .from("video_cut_clips")
      .select("id, user_id, job_id, title, transcript_text, transcript, video_cut_jobs!inner(cut_mode, instagram_account_id)")
      .eq("id", clipId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (clipError) throw clipError;
    const job = Array.isArray(clip?.video_cut_jobs) ? clip?.video_cut_jobs[0] : clip?.video_cut_jobs;
    if (!clip || job?.cut_mode !== "editorial") return json({ error: "editorial_clip_not_found" }, 404);

    const words = Array.isArray(clip.transcript?.words) ? clip.transcript.words : [];
    const transcript = clean(clip.transcript_text || words.map((word: { word?: string }) => word?.word || "").join(" "), 12000);
    if (!transcript) return json(neutralDraft("", clip.title || "O ponto principal deste trecho"));

    const { data: profile } = await userClient
      .from("creator_profiles")
      .select("voice_tone, target_audience, niche_detail")
      .eq("user_id", user.id)
      .eq("instagram_account_id", job.instagram_account_id)
      .maybeSingle();

    const result = await generateTopicJson({
      systemPrompt: "Você edita vídeos com rigor factual. Retorne somente JSON válido e nunca invente nomes, datas, números ou contexto.",
      userPrompt: `Crie um título curto e um comentário de 1 a 3 frases para um Corte Editorial.\n\nTRANSCRIÇÃO (única fonte factual):\n${transcript}\n\nTom do criador: ${clean(profile?.voice_tone, 160) || "claro e natural"}\nPúblico: ${clean(profile?.target_audience, 180) || "público geral"}\nNicho: ${clean(profile?.niche_detail, 180) || "não informado"}\n\nRegras: não identifique ninguém pela aparência; nomes, datas e números somente se estiverem na transcrição; sem sensacionalismo; evidence deve conter 1 a 3 trechos LITERAIS da transcrição; baixa confiança exige review_required=true. JSON: {"title":"","comment":"","confidence":0.0,"review_required":true,"evidence":[""]}`,
    });
    const output = safeDraft(result.content, transcript, clip.title || "O ponto principal deste trecho");
    return json({ ...output, provider: result.provider, persisted: false, video_reprocessed: false });
  } catch (error) {
    console.error("regenerate_cut_editorial_text_failed", { message: error instanceof Error ? error.message.slice(0, 300) : "unknown" });
    return json({ error: "editorial_text_unavailable" }, 503);
  }
});
