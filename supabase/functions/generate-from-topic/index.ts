// Gera um item de conteúdo a partir de uma "pauta" cadastrada pelo usuário.
// Não substitui o fluxo de notícias; insere em news_items com content_type='topic'.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { generateTopicJson } from "../_shared/topic-ai.ts";
import {
  assertCreatorProfileCompliance,
  creatorProfilePrompt,
  loadEffectiveCreatorProfile,
} from "../_shared/creator-profile.ts";
import { carouselPromptContract, normalizeTopicCarousel } from "../_shared/topic-carousel.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FORMAT_GUIDE: Record<string, string> = {
  dica: "DICA RÁPIDA: gancho curto + 3 a 5 dicas práticas numeradas + CTA. Tom direto, útil.",
  mini_aula: "MINI-AULA: conceito explicado em linguagem simples, com exemplo prático e takeaway final.",
  pergunta: "ENGAJAMENTO: pergunta provocativa que faça o público comentar. Comece com a pergunta forte, contexto curto, peça opinião.",
  carrossel: "CARROSSEL: crie 5-7 slides estruturados (capa, desenvolvimento e CTA final).",
  frase: "FRASE/CITAÇÃO: uma frase curta e impactante sobre o tema + 1-2 linhas explicando o porquê.",
  bastidor: "BASTIDOR: mostre processo, decisão, erro ou aprendizado real. Crie proximidade sem perder a utilidade.",
  lista: "LISTA: gancho objetivo + itens claros, escaneáveis e acionáveis + conclusão curta.",
  mito_verdade: "MITO OU VERDADE: apresente uma crença comum, dê o veredito e explique de forma simples.",
  estudo_caso: "ESTUDO DE CASO: contexto, desafio, decisão, resultado e aprendizado aplicável. Não invente números.",
  oferta: "OFERTA: problema, transformação, benefício, tratamento de objeção e CTA claro sem promessas enganosas.",
  roteiro_reel: "ROTEIRO DE REEL: gancho de 2 segundos, falas curtas por cena, virada e CTA. Duração estimada de 20-45s.",
};

async function generateContent(topic: any, format: string, settings: any, profile: any) {
  const guide = FORMAT_GUIDE[format] || FORMAT_GUIDE.dica;
  const tone = profile?.voice_tone || settings?.ai_tone || "engajante e descontraído";
  const niche = profile?.niche_detail || settings?.default_niche || "";
  const contextNote = topic.notes ? `\nContexto da pauta: ${topic.notes}` : "";
  const planningBlock = `
PLANEJAMENTO DESTA PAUTA:
- Pilar: ${topic.content_pillar || "não informado"}
- Objetivo: ${topic.objective || "educar"}
- Etapa do funil: ${topic.funnel_stage || "descoberta"}
- Público específico: ${topic.target_audience || "use o perfil geral"}
- Tom específico: ${topic.tone || "use o perfil geral"}
- CTA desejado: ${topic.call_to_action || "escolha um CTA natural"}
- Palavras-chave: ${Array.isArray(topic.keywords) && topic.keywords.length ? topic.keywords.join(", ") : "livres"}
`;

  const profileBlock = creatorProfilePrompt(profile);

  const carouselContract = format === "carrossel" ? `\n${carouselPromptContract()}` : "";
  const systemPrompt = `Você é o ghostwriter pessoal de um criador de conteúdo de Instagram, nicho "${niche}". Tom de voz base: ${tone}.
Você produz conteúdo PERENE (não notícia) baseado em uma pauta dada.
Formato solicitado: ${format.toUpperCase()}.
Diretriz do formato: ${guide}${contextNote}
${profileBlock}
${planningBlock}
REGRAS:
- Caption rica em informação real, ensinando algo concreto.
- Escreva COMO O CRIADOR escreveria, não como uma IA genérica.
- NÃO invente dados estatísticos. Use conhecimento amplamente aceito.
- Hashtags: 8-15, mix de nicho e amplas, em pt-BR.
- Título curto (até 80 chars) para usar em capa.${carouselContract}

Retorne APENAS JSON: {"title":"...","caption":"...","hashtags":["#..."],"cover_text":"frase curta da capa","slides":[{"title":"...","body":"...","emphasis":["..."],"image_mode":"text","image_query":null,"image_alt":null}]}`;

  const userPrompt = `Pauta: "${topic.title}"\nGere o conteúdo no formato ${format}.`;

  const generated = await generateTopicJson({ systemPrompt, userPrompt });
  const parsed = generated.content;
  const slides = format === "carrossel"
    ? normalizeTopicCarousel(parsed.slides, parsed.title || topic.title, topic.call_to_action)
    : null;
  assertCreatorProfileCompliance([
    String(parsed.title || ""),
    String(parsed.caption || ""),
    String(parsed.cover_text || ""),
    ...(Array.isArray(parsed.hashtags) ? parsed.hashtags : []),
    ...(slides || []).flatMap((slide) => [slide.title, slide.body]),
  ], profile);
  return {
    title: String(parsed.title || topic.title).slice(0, 200),
    caption: String(parsed.caption || ""),
    hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.slice(0, 20) : [],
    cover_text: String(parsed.cover_text || parsed.title || topic.title).slice(0, 120),
    slides,
    ai_provider: generated.provider,
    ai_model: generated.model,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const body = await req.json().catch(() => ({} as any));
    const topicId: string | null = body?.topic_id || null;
    const forcedFormat: string | null = body?.format || null;
    let userId: string | null = body?.user_id || null;
    let supabase;

    if (userId) {
      const internalSecret = Deno.env.get("INTERNAL_CRON_SECRET");
      const provided = req.headers.get("x-internal-secret");
      if (!internalSecret || provided !== internalSecret) {
        return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    } else {
      if (!auth) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      userId = user.id;
      const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
      const { data: approved } = await adminClient.rpc("is_approved", { _uid: userId });
      if (approved === false) return new Response(JSON.stringify({ error: "account_not_approved" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Settings globais; o Perfil do Criador efetivo depende da conta da pauta.
    const { data: settings } = await supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle();

    // Seleciona pauta: específica ou menos usada recentemente
    let topicQuery = supabase.from("content_topics").select("*").eq("user_id", userId).eq("active", true);
    if (topicId) topicQuery = topicQuery.eq("id", topicId);
    const { data: topics } = await topicQuery;
    if (!topics || topics.length === 0) {
      return new Response(JSON.stringify({ error: "no_active_topics" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // ordena por last_used_at asc nulls first, depois use_count asc
    // Na geração automática, respeita os dias preferidos e distribui a
    // frequência ao longo da semana. Geração manual de uma pauta específica
    // sempre é permitida.
    const today = new Date().getDay();
    const now = Date.now();
    const eligible = topicId ? topics : topics.filter((candidate: any) => {
      const days = Array.isArray(candidate.preferred_days) ? candidate.preferred_days : [];
      if (days.length > 0 && !days.includes(today)) return false;
      if (!candidate.last_used_at) return true;
      const frequency = Math.max(1, Math.min(7, Number(candidate.frequency_per_week) || 1));
      const minimumGapMs = (7 / frequency) * 24 * 60 * 60 * 1000;
      return now - new Date(candidate.last_used_at).getTime() >= minimumGapMs;
    });
    const candidates = eligible.length > 0 ? eligible : (topicId ? topics : []);
    if (candidates.length === 0) {
      return new Response(JSON.stringify({ error: "no_topic_due_today", skipped: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sorted = [...candidates].sort((a, b) => {
      const priorityDiff = (Number(b.priority) || 3) - (Number(a.priority) || 3);
      if (priorityDiff !== 0) return priorityDiff;
      const av = a.last_used_at ? new Date(a.last_used_at).getTime() : 0;
      const bv = b.last_used_at ? new Date(b.last_used_at).getTime() : 0;
      if (av !== bv) return av - bv;
      return (a.use_count || 0) - (b.use_count || 0);
    });
    const topic = sorted[0];
    const profile = await loadEffectiveCreatorProfile(supabase, userId!, topic.instagram_account_id);
    assertCreatorProfileCompliance([topic.title || "", topic.notes || ""], profile);

    // Escolhe formato
    const allowed: string[] = (topic.formats && topic.formats.length > 0) ? topic.formats : ["dica"];
    const format = forcedFormat && allowed.includes(forcedFormat)
      ? forcedFormat
      : allowed[Math.floor(Math.random() * allowed.length)];

    // Gera conteúdo
    const generated = await generateContent(topic, format, settings, profile);

    // Insere em news_items (pending; segue o mesmo cano de aprovação/agendamento)
    const insertRow: any = {
      user_id: userId,
      source_id: null,
      source_name: "Pauta",
      instagram_account_id: topic.instagram_account_id,
      original_title: topic.title,
      original_content: topic.notes || topic.title,
      original_url: `topic://${topic.id}/${Date.now()}`,
      original_image_url: null,
      published_at: new Date().toISOString(),
      niche: settings?.default_niche || null,
      status: format === "carrossel" ? "processed" : "pending",
      rewritten_title: generated.title,
      rewritten_summary: generated.cover_text,
      caption: generated.caption,
      hashtags: generated.hashtags,
      content_type: "topic",
      topic_id: topic.id,
      content_format: format,
      editorial_ready: format !== "carrossel",
      carousel_slides: generated.slides,
      carousel_media_urls: null,
    };
    const { data: inserted, error: insErr } = await supabase.from("news_items").insert(insertRow).select("id").single();
    if (insErr) throw insErr;

    // marca pauta como usada
    await supabase.from("content_topics").update({
      last_used_at: new Date().toISOString(),
      use_count: (topic.use_count || 0) + 1,
    }).eq("id", topic.id);

    await supabase.from("activity_logs").insert({
      user_id: userId,
      action: "generate_from_topic",
      entity_type: "news_item",
      entity_id: inserted.id,
      details: { topic_id: topic.id, format, title: generated.title, ai_provider: generated.ai_provider, ai_model: generated.ai_model },
    });

    return new Response(JSON.stringify({ ok: true, news_item_id: inserted.id, format, topic_id: topic.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "unknown";
    const code = e?.code || null;
    // Fix: status HTTP semântico (não retornar 200 para erros)
    const status = code === "no_credits" ? 402
      : code === "rate_limited" ? 429
      : code === "creator_profile_forbidden" ? 422
      : code === "no_provider" || code === "ai_unavailable" ? 503
      : 500;
    return new Response(JSON.stringify({ error: msg, code }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
