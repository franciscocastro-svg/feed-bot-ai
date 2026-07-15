// Processes a news item: AI rewrites + image generation, then uploads to storage
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  decideNewsClaim,
  processingErrorMessage,
  STALE_NEWS_PROCESSING_MS,
} from "../_shared/news-processing-policy.ts";
import {
  assertEditorialCopy,
  resolveEditorialIdentity,
} from "../_shared/editorial-integrity.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-request-id",
  "Access-Control-Expose-Headers": "x-request-id",
};

function jsonResponse(payload: unknown, status: number, requestId: string) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "x-request-id": requestId },
  });
}

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const GROQ_AI_URL = "https://api.groq.com/openai/v1/chat/completions";
const GEMINI_AI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const GEMINI_CIRCUIT_BREAKER_MS = 60_000;
let geminiUnavailableUntil = 0;
let groqUnavailableUntil = 0;
const GROQ_AUTH_CIRCUIT_BREAKER_MS = 6 * 60 * 60_000;
const AI_PROVIDER_TIMEOUT_MS = 25_000;

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^169\.254\./.test(host) || /^192\.168\./.test(host)) return true;
  const match172 = host.match(/^172\.(\d+)\./);
  if (match172) {
    const n = Number(match172[1]);
    if (n >= 16 && n <= 31) return true;
  }
  return false;
}

function assertSafeHttpUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("URL precisa usar http ou https");
  if (isPrivateHostname(url.hostname)) throw new Error("URL privada/local não permitida");
  url.username = "";
  url.password = "";
  return url.toString();
}

function decodeEntities(s: string): string {
  if (!s) return s;
  return s
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/gi, "&");
}

function cleanExtractedUrl(raw: string): string | null {
  try {
    const cleaned = decodeEntities(raw)
      .replace(/\\u0026/g, "&")
      .replace(/[^\x20-\x7E]+/g, "")
      .split(/["'<>\\\s]/)[0]
      .replace(/[),.;]+$/g, "");
    const safe = assertSafeHttpUrl(cleaned);
    const host = new URL(safe).hostname.toLowerCase();
    if (host === "news.google.com" || host.endsWith(".google.com")) return null;
    return safe;
  } catch {
    return null;
  }
}

function decodeGoogleNewsArticleUrl(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.hostname.toLowerCase() !== "news.google.com") return null;
    const token = url.pathname.match(/\/(?:rss\/)?articles\/([^/?#]+)/)?.[1];
    if (!token) return null;
    const normalized = token.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const decoded = atob(padded);
    const matches = decoded.match(/https?:\/\/[^\s"'<>\\]+/g) || [];
    for (const match of matches) {
      const cleaned = cleanExtractedUrl(match);
      if (cleaned) return cleaned;
    }
  } catch {
    return null;
  }
  return null;
}

function resolveReadableUrl(rawUrl: string): string {
  return decodeGoogleNewsArticleUrl(rawUrl) || rawUrl;
}

// Client de service-role pro cache de reescrita (acesso restrito).
// Reaproveitar reescritas entre usuários economiza 40-70% de chamadas IA caras.
let _cacheClient: any = null;
function getCacheClient() {
  if (_cacheClient) return _cacheClient;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const url = Deno.env.get("SUPABASE_URL");
  if (!key || !url) return null;
  _cacheClient = createClient(url, key);
  return _cacheClient;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getCachedRewrite(cacheKey: string): Promise<any | null> {
  const sb = getCacheClient();
  if (!sb) return null;
  try {
    const { data } = await sb.from("ai_rewrite_cache")
      .select("payload, expires_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (!data) return null;
    if (new Date(data.expires_at).getTime() < Date.now()) return null;
    // bump hits + last_hit_at em background (sem await pra não atrasar)
    sb.from("ai_rewrite_cache")
      .update({ last_hit_at: new Date().toISOString(), hits: (data.hits ?? 0) + 1 })
      .eq("cache_key", cacheKey)
      .then(() => {}, () => {});
    return data.payload;
  } catch (e) {
    console.warn("[ai-cache] lookup failed", e);
    return null;
  }
}

async function setCachedRewrite(cacheKey: string, sourceUrl: string | null, payload: any): Promise<void> {
  const sb = getCacheClient();
  if (!sb) return;
  try {
    await sb.from("ai_rewrite_cache").upsert({
      cache_key: cacheKey,
      source_url: sourceUrl,
      payload,
      hits: 0,
      last_hit_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: "cache_key" });
  } catch (e) {
    console.warn("[ai-cache] write failed", e);
  }
}

const LANG_NAMES: Record<string, string> = {
  en: "inglês", es: "espanhol", fr: "francês", it: "italiano", de: "alemão",
  ja: "japonês", zh: "chinês", ko: "coreano", ru: "russo", ar: "árabe",
  pt: "português", auto: "detectar automaticamente",
};

type TextAiProvider = "lovable" | "groq" | "gemini";

function getTextAiProvider(): TextAiProvider {
  const provider = (Deno.env.get("AI_TEXT_PROVIDER") || "").trim().toLowerCase();
  if (provider === "gemini" && Deno.env.get("GEMINI_API_KEY")) return "gemini";
  return provider === "groq" && !!Deno.env.get("GROQ_API_KEY") ? "groq" : "lovable";
}

function getTextAiModel(): string {
  const provider = getTextAiProvider();
  if (provider === "gemini") return Deno.env.get("GEMINI_TEXT_MODEL") || "gemini-2.5-flash-lite";
  if (provider === "groq") return Deno.env.get("GROQ_TEXT_MODEL") || "llama-3.1-8b-instant";
  return "google/gemini-2.5-pro";
}

function extractJsonObject(text: string): any {
  const cleaned = String(text || "")
    .replace(/```json/gi, "```")
    .replace(/```/g, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error("Resposta da IA sem JSON válido");
  }
}

function normalizeRewritePayload(parsed: any, item: any): any {
  const fallback = fallbackRewrite(item);
  const hashtags = Array.isArray(parsed?.hashtags)
    ? parsed.hashtags
        .map((h: any) => String(h || "").replace(/^#/, "").trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 15)
    : fallback.hashtags;

  return {
    title: sanitizeNewsTitle(String(parsed?.title || fallback.title)).slice(0, 90),
    subtitle: normalizeCaptionText(String(parsed?.subtitle || fallback.subtitle)).slice(0, 180),
    hook: String(parsed?.hook || fallback.hook || "URGENTE").slice(0, 30).toUpperCase(),
    summary: normalizeCaptionText(String(parsed?.summary || fallback.summary)).slice(0, 420),
    caption: dedupeCaptionText(String(parsed?.caption || fallback.caption)),
    reel_caption: dedupeCaptionText(String(parsed?.reel_caption || parsed?.caption || fallback.reel_caption)),
    hashtags,
  };
}

const AI_FEED_CAPTION_MIN = 900;
const AI_FEED_CAPTION_MAX = 1950;
const AI_REEL_CAPTION_MIN = 550;
const AI_REEL_CAPTION_MAX = 1200;

type CaptionQualityPayload = {
  caption?: string | null;
  reel_caption?: string | null;
};

function hasShortCaption(parsed: CaptionQualityPayload) {
  const feedLength = parsed?.caption?.length || 0;
  const reelLength = parsed?.reel_caption?.length || 0;
  return feedLength < AI_FEED_CAPTION_MIN || reelLength < AI_REEL_CAPTION_MIN;
}

function acceptCaptionWithoutQualityRetry<T extends CaptionQualityPayload>(parsed: T, provider: string): T {
  if (hasShortCaption(parsed)) {
    console.warn(
      `[${provider.toLowerCase()}] legenda abaixo da meta; seguindo com expansão determinística ` +
        `(feed=${parsed?.caption?.length || 0}, reel=${parsed?.reel_caption?.length || 0})`,
    );
  }
  return parsed;
}

function buildGroqRewriteMessages(item: any, tone: string, srcOpts: { lang?: string; translate?: boolean; cultural?: boolean } = {}, attempt = 1) {
  const articleBody = item._article_body ? String(item._article_body).slice(0, 9000) : "";
  const sourceText = [
    `Titulo: ${sanitizeNewsTitle(item.original_title || "")}`,
    item.original_content ? `Resumo RSS: ${normalizeCaptionText(item.original_content)}` : "",
    articleBody ? `Corpo da materia:\n${articleBody}` : "",
  ].filter(Boolean).join("\n\n");

  const retryNote = attempt > 1
    ? `\nA resposta anterior ficou curta e foi rejeitada. Desta vez entregue a caption com ${AI_FEED_CAPTION_MIN}-${AI_FEED_CAPTION_MAX} caracteres e a reel_caption com ${AI_REEL_CAPTION_MIN}-${AI_REEL_CAPTION_MAX} caracteres.`
    : "";

  const system = `Voce e um redator jornalistico viral para Instagram em PT-BR. Tom: ${tone}.
Gere texto informativo, natural, sem copiar frases literais da noticia.
Nao cite fonte, nao use link na bio, nao use leia mais, nao invente fatos.
Use os nomes, datas, locais, numeros e detalhes concretos do texto fornecido.
Cada paragrafo deve acrescentar uma informacao nova. Nao repita o titulo, o resumo nem o mesmo fato com outras palavras.
Proibido usar preenchimentos genericos como "O ponto central", "O que se sabe ate agora", "Por que isso importa", "quando uma informacao ganha forca" ou "observe os proximos capitulos".
Caption do feed: longa, util, com paragrafos curtos, entre ${AI_FEED_CAPTION_MIN} e ${AI_FEED_CAPTION_MAX} caracteres.
Caption do reel: rica e direta, entre ${AI_REEL_CAPTION_MIN} e ${AI_REEL_CAPTION_MAX} caracteres.
Hashtags: exatamente 15, sem #, minusculas, relevantes ao tema.${srcOpts.translate ? `\nA fonte pode estar em ${LANG_NAMES[srcOpts.lang || "auto"] || "outro idioma"}; traduza tudo para PT-BR natural.` : ""}${srcOpts.cultural ? "\nExplique referencias culturais somente com informacoes presentes na fonte. Nao estime cotacoes, conversoes, datas ou contexto ausente." : ""}${retryNote}
Responda APENAS um JSON valido com estas chaves:
{"title":"...","subtitle":"...","hook":"...","summary":"...","caption":"...","reel_caption":"...","hashtags":["..."]}`;

  return [
    { role: "system", content: system },
    { role: "user", content: `Base da noticia:\n\n${sourceText}` },
  ];
}

async function rewriteWithGroq(item: any, tone: string, srcOpts: { lang?: string; translate?: boolean; cultural?: boolean } = {}, attempt = 1): Promise<any> {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) throw new Error("GROQ_API_KEY ausente");
  if (Date.now() < groqUnavailableUntil) {
    throw new Error("Groq temporariamente indisponível; usando próximo provedor");
  }

  const res = await fetch(GROQ_AI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("GROQ_TEXT_MODEL") || "llama-3.1-8b-instant",
      messages: buildGroqRewriteMessages(item, tone, srcOpts, attempt),
      temperature: 0.45,
      max_tokens: 3600,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(AI_PROVIDER_TIMEOUT_MS),
  });
  if (!res.ok) {
    const errorBody = (await res.text()).slice(0, 500);
    if (res.status === 401 || res.status === 403) {
      groqUnavailableUntil = Date.now() + GROQ_AUTH_CIRCUIT_BREAKER_MS;
      throw new Error(`Groq AI ${res.status}: credencial inválida ou expirada`);
    }
    throw new Error(`Groq AI ${res.status}: ${errorBody}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || "{}";
  const parsed = normalizeRewritePayload(extractJsonObject(content), item);
  return acceptCaptionWithoutQualityRetry(parsed, "Groq");
}

function readGeminiUsage(data: any) {
  const usage = data?.usage || {};
  const native = data?.usageMetadata || data?.usage_metadata || {};
  const promptTokens = Number(
    usage.prompt_tokens ?? usage.promptTokenCount ?? native.promptTokenCount ?? native.prompt_token_count ?? 0,
  );
  const candidatesTokens = Number(
    usage.completion_tokens ?? usage.candidatesTokenCount ?? native.candidatesTokenCount ?? native.candidates_token_count ?? 0,
  );
  const thoughtsTokens = usage.completion_tokens == null
    ? Number(native.thoughtsTokenCount ?? native.thoughts_token_count ?? 0)
    : 0;
  const completionTokens = candidatesTokens + thoughtsTokens;
  const totalTokens = Number(
    usage.total_tokens ?? usage.totalTokenCount ?? native.totalTokenCount ?? native.total_token_count
      ?? (promptTokens + completionTokens),
  );
  return {
    promptTokens: Number.isFinite(promptTokens) ? Math.max(0, promptTokens) : 0,
    completionTokens: Number.isFinite(completionTokens) ? Math.max(0, completionTokens) : 0,
    totalTokens: Number.isFinite(totalTokens) ? Math.max(0, totalTokens) : 0,
    thoughtsTokens: Number.isFinite(thoughtsTokens) ? Math.max(0, thoughtsTokens) : 0,
  };
}

function estimateGeminiCostUsd(model: string, promptTokens: number, completionTokens: number) {
  const normalized = model.toLowerCase();
  const rates = normalized.includes("2.5-flash-lite")
    ? { input: 0.10, output: 0.40 }
    : normalized.includes("2.5-flash")
      ? { input: 0.30, output: 2.50 }
      : null;
  if (!rates) return 0;
  return (promptTokens * rates.input + completionTokens * rates.output) / 1_000_000;
}

async function recordGeminiUsage(event: {
  userId?: string | null;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  success: boolean;
  httpStatus?: number;
  latencyMs: number;
  metadata?: Record<string, unknown>;
}) {
  const sb = getCacheClient();
  if (!sb) return;
  const estimatedCostUsd = estimateGeminiCostUsd(
    event.model,
    event.promptTokens || 0,
    event.completionTokens || 0,
  );
  try {
    const { error } = await sb.from("ai_usage_events").insert({
      user_id: event.userId || null,
      provider: "gemini",
      model: event.model,
      operation: "rewrite_news",
      prompt_tokens: event.promptTokens || 0,
      completion_tokens: event.completionTokens || 0,
      total_tokens: event.totalTokens || 0,
      estimated_cost_usd: estimatedCostUsd,
      success: event.success,
      http_status: event.httpStatus || null,
      latency_ms: event.latencyMs,
      metadata: event.metadata || {},
    });
    if (error) console.warn("[gemini-metrics] não foi possível registrar o uso:", error.message);
  } catch (error) {
    console.warn("[gemini-metrics] falha não bloqueante:", error);
  }
}

async function rewriteWithGemini(item: any, tone: string, srcOpts: { lang?: string; translate?: boolean; cultural?: boolean } = {}, attempt = 1): Promise<any> {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY ausente");
  if (Date.now() < geminiUnavailableUntil) {
    throw new Error("Gemini temporariamente indisponível; usando provedor de reserva");
  }

  const model = Deno.env.get("GEMINI_TEXT_MODEL") || "gemini-2.5-flash-lite";
  const requestBody = JSON.stringify({
    model,
    messages: buildGroqRewriteMessages(item, tone, srcOpts, attempt),
    temperature: 0.45,
    max_tokens: 3600,
    reasoning_effort: "none",
    response_format: { type: "json_object" },
  });
  // Uma nova chamada por falha transitória é suficiente. Repetições de
  // qualidade são tratadas localmente para preservar o orçamento de CPU.
  const maxApiAttempts = 2;
  let data: any = null;

  for (let apiAttempt = 1; apiAttempt <= maxApiAttempts; apiAttempt++) {
    const startedAt = Date.now();
    const res = await fetch(GEMINI_AI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: requestBody,
      signal: AbortSignal.timeout(AI_PROVIDER_TIMEOUT_MS),
    });

    if (res.ok) {
      geminiUnavailableUntil = 0;
      data = await res.json();
      const usage = readGeminiUsage(data);
      await recordGeminiUsage({
        userId: item?.user_id,
        model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        success: true,
        httpStatus: res.status,
        latencyMs: Date.now() - startedAt,
        metadata: { attempt, api_attempt: apiAttempt, thoughts_tokens: usage.thoughtsTokens, news_item_id: item?.id || null },
      });
      break;
    }

    const errorBody = (await res.text()).slice(0, 500);
    await recordGeminiUsage({
      userId: item?.user_id,
      model,
      success: false,
      httpStatus: res.status,
      latencyMs: Date.now() - startedAt,
      metadata: { attempt, api_attempt: apiAttempt, error: errorBody, news_item_id: item?.id || null },
    });

    const retryable = res.status === 429 || res.status === 500 || res.status === 502 || res.status === 503 || res.status === 504;
    if (!retryable || apiAttempt === maxApiAttempts) {
      if (retryable) geminiUnavailableUntil = Date.now() + GEMINI_CIRCUIT_BREAKER_MS;
      throw new Error(`Gemini AI ${res.status}: ${errorBody}`);
    }

    const retryAfterSeconds = Number(res.headers.get("retry-after"));
    const exponentialDelay = 700 * (2 ** (apiAttempt - 1));
    const retryDelay = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? Math.min(retryAfterSeconds * 1000, 5000)
      : exponentialDelay + Math.floor(Math.random() * 400);
    console.warn(`[gemini] HTTP ${res.status}; nova tentativa ${apiAttempt + 1}/${maxApiAttempts} em ${retryDelay}ms`);
    await new Promise((resolve) => setTimeout(resolve, retryDelay));
  }

  if (!data) throw new Error("Gemini AI não retornou conteúdo após as tentativas");
  const content = data.choices?.[0]?.message?.content || "{}";
  const parsed = normalizeRewritePayload(extractJsonObject(content), item);
  return acceptCaptionWithoutQualityRetry(parsed, "Gemini");
}

async function rewriteWithLovableFactLocked(
  item: any,
  tone: string,
  srcOpts: { lang?: string; translate?: boolean; cultural?: boolean } = {},
  attempt = 1,
): Promise<any> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY ausente");
  const res = await fetch(AI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: buildGroqRewriteMessages(item, tone, srcOpts, attempt),
      temperature: 0.25,
      max_tokens: 5000,
      response_format: { type: "json_object" },
    }),
    signal: AbortSignal.timeout(AI_PROVIDER_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).slice(0, 500)}`);
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || "{}";
  const parsed = normalizeRewritePayload(extractJsonObject(raw), item);
  return acceptCaptionWithoutQualityRetry(parsed, "Lovable/Gemini");
}

async function fetchArticleBody(url: string): Promise<string> {
  try {
    const safeUrl = assertSafeHttpUrl(resolveReadableUrl(url));
    const r = await fetch(safeUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) return "";
    const html = await r.text();

    // 1) JSON-LD primeiro (NewsArticle/Article costuma trazer articleBody completo)
    let jsonLdBody = "";
    const jsonldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let jm: RegExpExecArray | null;
    while ((jm = jsonldRe.exec(html)) !== null) {
      try {
        const data = JSON.parse(jm[1].trim());
        const nodes = Array.isArray(data) ? data : (data["@graph"] || [data]);
        for (const n of nodes) {
          const t = n?.["@type"];
          const isArticle = typeof t === "string" ? /article|news/i.test(t) : Array.isArray(t) && t.some((x: any) => /article|news/i.test(x));
          if (isArticle && typeof n.articleBody === "string" && n.articleBody.length > jsonLdBody.length) {
            jsonLdBody = n.articleBody;
          }
        }
      } catch { /* ignore */ }
    }

    // 2) Recorta o bloco principal por seletores comuns
    const tryMatchers: RegExp[] = [
      /<article[\s\S]*?<\/article>/i,
      /<main[\s\S]*?<\/main>/i,
      /<div[^>]+(?:id|class)=["'][^"']*(?:article-body|article__body|entry-content|post-content|story-body|story-content|c-content|s-content|materia-conteudo|article-content|content-body|td-post-content)[^"']*["'][\s\S]*?<\/div>/i,
      /<section[^>]+(?:id|class)=["'][^"']*(?:article|content|materia|post)[^"']*["'][\s\S]*?<\/section>/i,
    ];
    let chunk = html;
    for (const re of tryMatchers) {
      const mm = html.match(re);
      if (mm && mm[0].length > 500) { chunk = mm[0]; break; }
    }

    // Remove ruído (scripts, ads, share, related, footer, nav, aside, comments)
    chunk = chunk
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<aside[\s\S]*?<\/aside>/gi, " ")
      .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
      .replace(/<header[\s\S]*?<\/header>/gi, " ")
      .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
      .replace(/<form[\s\S]*?<\/form>/gi, " ")
      .replace(/<figcaption[\s\S]*?<\/figcaption>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<(?:div|section|ul|aside)[^>]+(?:id|class)=["'][^"']*(?:share|social|related|recommend|newsletter|subscribe|comments?|tags?|author-box|sidebar|breadcrumb|advert|ads?-|banner|promo|popup|paywall|cookie|widget)[^"']*["'][\s\S]*?<\/(?:div|section|ul|aside)>/gi, " ");

    // Extrai textos de <p>, <h2>, <h3>, <h4>, <li>, <blockquote>
    const paragraphs: string[] = [];
    const pRe = /<(p|h2|h3|h4|li|blockquote)[^>]*>([\s\S]*?)<\/\1>/gi;
    let m: RegExpExecArray | null;
    const seen = new Set<string>();
    while ((m = pRe.exec(chunk)) !== null) {
      const text = normalizeCaptionText(m[2].replace(/<[^>]+>/g, " "));
      if (text.length < 40) continue;
      // Filtra linhas de UI comuns
      if (/^(compartilhar|leia (também|mais)|veja também|assine|inscreva-se|siga-nos|publicidade|continua após|relacionadas?|tags?:|por\s+\w+\s*\|)/i.test(text)) continue;
      const key = text.slice(0, 80);
      if (seen.has(key)) continue;
      seen.add(key);
      paragraphs.push(text);
    }
    let body = paragraphs.join("\n\n");

    // Se JSON-LD trouxe mais texto, usa esse (geralmente mais limpo e completo)
    if (jsonLdBody && jsonLdBody.length > body.length) {
      body = normalizeCaptionText(jsonLdBody);
    }

    // Limite generoso pra IA absorver bastante material (~15k chars)
    return normalizeCaptionText(body).slice(0, 15000);
  } catch (e) {
    console.warn("fetchArticleBody failed", url, e instanceof Error ? e.message : e);
    return "";
  }
}

async function rewriteWithAI(item: any, tone: string, srcOpts: { lang?: string; translate?: boolean; cultural?: boolean } = {}, attempt = 1): Promise<any> {
  // ===== CACHE: chave por URL+config (mesmo item RSS pra N usuários -> 1 chamada IA) =====
  // Só ativa no primeiro attempt (retry por legenda curta força nova chamada).
  // E só pra itens com original_url estável.
  const cacheKey = attempt === 1 && item.original_url
    ? await sha256Hex(JSON.stringify({
        u: item.original_url,
        t: tone || "",
        l: srcOpts.lang || "auto",
        tr: !!srcOpts.translate,
        c: !!srcOpts.cultural,
        provider: getTextAiProvider(),
        model: getTextAiModel(),
        v: 6, // invalida textos anteriores à trava factual
      }))
    : null;
  if (cacheKey) {
    const cached = await getCachedRewrite(cacheKey);
    if (cached) {
      console.log(`[ai-cache] HIT ${item.original_url}`);
      return cached;
    }
  }

  const __origRewrite = rewriteWithAIRaw;
  const parsed = await __origRewrite(item, tone, srcOpts, attempt);
  if (cacheKey) {
    // Só cacheia se as legendas vieram em tamanho aceitável (qualidade).
    const ok = (parsed?.caption?.length || 0) >= AI_FEED_CAPTION_MIN && (parsed?.reel_caption?.length || 0) >= AI_REEL_CAPTION_MIN;
    if (ok) await setCachedRewrite(cacheKey, item.original_url, parsed);
  }
  return parsed;
}

async function rewriteWithAIRaw(item: any, tone: string, srcOpts: { lang?: string; translate?: boolean; cultural?: boolean } = {}, attempt = 1): Promise<any> {
  const provider = getTextAiProvider();
  if (provider === "gemini") {
    try {
      return await rewriteWithGemini(item, tone, srcOpts, attempt);
    } catch (e) {
      console.warn("[gemini] falhou; tentando provedor de reserva", e);
      if (Deno.env.get("GROQ_API_KEY")) {
        try {
          return await rewriteWithGroq(item, tone, srcOpts, attempt);
        } catch (groqError) {
          console.warn("[groq] reserva falhou; voltando para provedor Lovable/Gemini", groqError);
        }
      }
      if (!Deno.env.get("LOVABLE_API_KEY")) throw e;
    }
  } else if (provider === "groq") {
    try {
      return await rewriteWithGroq(item, tone, srcOpts, attempt);
    } catch (e) {
      console.warn("[groq] falhou; tentando Gemini direto", e);
      if (Deno.env.get("GEMINI_API_KEY")) {
        try {
          return await rewriteWithGemini(item, tone, srcOpts, attempt);
        } catch (geminiError) {
          console.warn("[gemini] reserva falhou; tentando Lovable/Gemini", geminiError);
        }
      }
      if (!Deno.env.get("LOVABLE_API_KEY")) throw e;
    }
  }

  return await rewriteWithLovableFactLocked(item, tone, srcOpts, attempt);
}

function cleanWords(text: string): string[] {
  return (text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !["para", "com", "uma", "sobre", "mais", "apos", "pela", "pelo", "entre", "isso", "essa", "esse"].includes(w));
}

const INSTAGRAM_CAPTION_LIMIT = 2200;
const MIN_USEFUL_CAPTION_CHARS = 700;

function sanitizeNewsTitle(text: string): string {
  return decodeHtmlEntities(String(text || ""))
    .replace(/\s+-\s+UOL$/i, "")
    .replace(/\s+\d{1,2}\/\d{1,2}\/\d{4}(?:\s*(?:às|as|-|,)?\s*\d{1,2}[:h]\d{2})?\s*$/i, "")
    .replace(/\s+\d{1,2}[:h]\d{2}\s*$/i, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function stripArticleUiNoise(text: string): string {
  return String(text || "")
    .replace(/\bOuvir\s+(?:\d+(?:[.,]\d+)?\s*[x×]\s*){2,}/gi, " ")
    .replace(/\b(?:continua após a publicidade|publicidade|publicidade eleitoral|adchoices)\b/gi, " ")
    .replace(/\b(?:compartilhar|salvar|comentar|ouça|leia também|veja também)\b\s*[:\-]?/gi, " ");
}

function normalizeCaptionText(text: string): string {
  return stripArticleUiNoise(decodeHtmlEntities(String(text || "")))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function captionSentenceWords(text: string): Set<string> {
  const normalized = normalizeCaptionText(text)
    .replace(/^[^a-zA-ZÀ-ÿ0-9]+/, "")
    .replace(/^(?:o ponto central|o que se sabe até agora|por que isso importa)\s*:\s*/i, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ");
  const ignored = new Set(["para", "como", "uma", "com", "mais", "pela", "pelo", "sobre", "entre", "isso", "essa", "esse", "ainda", "tambem"]);
  return new Set(normalized.split(/\s+/).filter(word => word.length > 3 && !ignored.has(word)));
}

function captionSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size < 8 || b.size < 8) return 0;
  let common = 0;
  for (const word of a) if (b.has(word)) common++;
  return common / Math.min(a.size, b.size);
}

function dedupeCaptionText(text: string): string {
  const withoutFiller = normalizeCaptionText(text)
    .replace(/(?:🧭\s*)?Por que isso importa:\s*notícias assim ajudam a entender o movimento por trás do assunto, os personagens envolvidos e o impacto que pode aparecer nos próximos dias\.\s*/gi, "")
    .replace(/Quando uma informação ganha força, ela não fica só no título\. Ela mexe com decisões, bastidores, torcida, mercado, opinião pública e com a forma como as pessoas acompanham o tema\.\s*/gi, "")
    .replace(/Agora, o mais importante é observar os próximos capítulos:\s*novas declarações, possíveis mudanças de rota e a reação do público\.\s*/gi, "");
  const seen: Set<string>[] = [];
  const paragraphs = withoutFiller.split(/\n{2,}/).map(paragraph => {
    const sentences = paragraph.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
    const unique = sentences.filter(sentence => {
      const words = captionSentenceWords(sentence);
      if (sentence.trim().length < 80 || words.size < 8) return true;
      if (seen.some(previous => captionSimilarity(words, previous) >= 0.82)) return false;
      seen.push(words);
      return true;
    });
    return unique.join(" ").replace(/\s+/g, " ").trim();
  }).filter(Boolean);
  return normalizeCaptionText(paragraphs.join("\n\n"));
}

function smartTrimCaption(text: string, max = INSTAGRAM_CAPTION_LIMIT): string {
  const clean = normalizeCaptionText(text);
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, Math.max(0, max - 1));
  const paragraphBreak = cut.lastIndexOf("\n\n");
  const sentenceBreak = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  const safeCut = Math.max(
    paragraphBreak > max * 0.65 ? paragraphBreak : 0,
    sentenceBreak > max * 0.65 ? sentenceBreak + 1 : 0,
  );
  return (safeCut ? cut.slice(0, safeCut) : cut).trim();
}

function extractUsefulSentences(text: string, limit = 8): string[] {
  const clean = normalizeCaptionText(text).replace(/\s+/g, " ");
  const parts = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  const seen = new Set<string>();
  const useful: string[] = [];
  for (const part of parts) {
    const sentence = part.replace(/\s+/g, " ").trim();
    if (sentence.length < 50 || sentence.length > 360) continue;
    const key = sentence.slice(0, 90).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    useful.push(sentence);
    if (useful.length >= limit) break;
  }
  return useful;
}

function buildInformativeCaptionFallback(item: any, title: string, summary: string): string {
  const raw = normalizeCaptionText(`${item._article_body || ""}\n\n${item.original_content || ""}`);
  const sentences = extractUsefulSentences(raw, 14);
  const factualParagraphs: string[] = [];
  for (let index = 0; index < sentences.length; index += 2) {
    factualParagraphs.push(sentences.slice(index, index + 2).join(" "));
  }
  const factualBody = factualParagraphs.length > 0
    ? factualParagraphs
    : summary ? [normalizeCaptionText(summary)] : [];
  const blocks = [
    `🚨 ${title}`,
    ...factualBody,
    `💬 Qual é a sua opinião sobre ${title.toLowerCase()}?`,
  ];
  return smartTrimCaption(dedupeCaptionText(blocks.filter(Boolean).join("\n\n")), 1850);
}

function ensureUsefulCaption(caption: string, item: any, title: string, summary: string): string {
  const clean = normalizeCaptionText(caption);
  if (clean.length >= MIN_USEFUL_CAPTION_CHARS) return clean;
  const fallback = buildInformativeCaptionFallback(item, title, summary);
  return fallback.length > clean.length ? fallback : clean;
}

function buildCaptionWithExtras(base: string, extraBlocks: string[], hashtagsLine: string): string {
  const suffix = [...extraBlocks, hashtagsLine].filter(Boolean).join("\n\n");
  if (!suffix) return smartTrimCaption(base);
  const maxBase = Math.max(900, INSTAGRAM_CAPTION_LIMIT - suffix.length - 4);
  return smartTrimCaption([smartTrimCaption(base, maxBase), suffix].filter(Boolean).join("\n\n"));
}

function fallbackRewrite(item: any) {
  const title = sanitizeNewsTitle(item.original_title || "Notícia importante").slice(0, 90);
  const raw = normalizeCaptionText(item._article_body || item.original_content || item.original_title || "");
  const summary = raw ? smartTrimCaption(raw, 320) : title;
  const words = Array.from(new Set(cleanWords(`${item.original_title || ""} ${item.original_content || ""}`))).slice(0, 8);
  const hashtags = Array.from(new Set([...(words.length ? words : ["noticias", "atualidade"]), "noticias", "brasil", "viral", "urgente", "informacao", "conteudo", "instagram"])).slice(0, 15);
  const caption = buildInformativeCaptionFallback(item, title, summary);
  return {
    title,
    subtitle: summary.slice(0, 110),
    hook: "URGENTE",
    summary,
    caption,
    reel_caption: caption,
    hashtags,
  };
}

function isAiCreditError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.includes("AI 402") || msg.includes("Image AI 402") || msg.includes("payment_required") || msg.includes("Not enough credits");
}

function decodeHtmlEntities(s: string): string {
  if (!s) return "";
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/&lsquo;|&rsquo;/gi, "'")
    .replace(/&hellip;/gi, "…")
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyLogo(url: string): boolean {
  const u = url.toLowerCase();
  if (/(logo|brand|sprite|icon|favicon|placeholder|default|avatar|share|social|watermark|selo|header|nav|footer)/i.test(u)) return true;
  if (/\.svg(\?|$)/i.test(u)) return true;
  const m = u.match(/[?&](?:w|width|h|height)=(\d+)/);
  if (m && parseInt(m[1]) < 300) return true;
  return false;
}

async function findOgImage(pageUrl: string): Promise<string | null> {
  try {
    const safePageUrl = assertSafeHttpUrl(resolveReadableUrl(pageUrl));
    const r = await fetch(safePageUrl, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const html = await r.text();
    const origin = new URL(safePageUrl).origin;
    const candidates: string[] = [];
    const push = (u?: string | null) => { if (u && typeof u === "string" && !candidates.includes(u)) candidates.push(u); };
    const pushImageValue = (value: any) => {
      if (!value) return;
      if (typeof value === "string") {
        push(value);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach(pushImageValue);
        return;
      }
      if (typeof value === "object") {
        push(value.url);
        push(value.contentUrl);
        push(value.thumbnailUrl);
        push(value["@id"]);
      }
    };
    const pushSrcset = (srcset?: string | null) => {
      if (!srcset) return;
      for (const part of srcset.split(",")) {
        const candidate = part.trim().split(/\s+/)[0];
        push(candidate);
      }
    };

    // JSON-LD primeiro
    const jsonldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let jm: RegExpExecArray | null;
    while ((jm = jsonldRe.exec(html)) !== null) {
      try {
        const data = JSON.parse(jm[1].trim());
        const nodes = Array.isArray(data) ? data : (data["@graph"] || [data]);
        for (const n of nodes) {
          pushImageValue(n?.image);
          pushImageValue(n?.thumbnailUrl);
          pushImageValue(n?.primaryImageOfPage);
        }
      } catch {}
    }

    // figure dentro do article
    const articleMatch = html.match(/<article[\s\S]*?<\/article>/i);
    const articleHtml = articleMatch ? articleMatch[0] : html;
    const figRe = /<figure[\s\S]*?<img[^>]+(?:src|data-src|data-original|data-lazy-src|data-original-src|data-img-src)=["']([^"']+)["']/gi;
    let fm: RegExpExecArray | null;
    while ((fm = figRe.exec(articleHtml)) !== null) push(fm[1]);

    // og:image / twitter:image
    const metaPatterns = [
      /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/gi,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/gi,
      /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/gi,
    ];
    for (const p of metaPatterns) {
      let mm: RegExpExecArray | null;
      while ((mm = p.exec(html)) !== null) push(mm[1]);
    }

    // imgs grandes no article
    const srcsetRe = /<(?:img|source)[^>]+(?:srcset|data-srcset)=["']([^"']+)["']/gi;
    let sm: RegExpExecArray | null;
    while ((sm = srcsetRe.exec(articleHtml)) !== null) pushSrcset(sm[1]);

    const imgRe = /<img[^>]+(?:src|data-src|data-original|data-lazy-src|data-original-src|data-img-src)=["']([^"']+\.(?:jpe?g|png|webp)[^"']*)["']/gi;
    let im: RegExpExecArray | null;
    while ((im = imgRe.exec(articleHtml)) !== null) push(im[1]);

    const filtered = candidates
      .map(u => u.startsWith("//") ? "https:" + u : u.startsWith("/") ? origin + u : u)
      .filter(u => /^https?:\/\//i.test(u))
      .filter(u => {
        try { assertSafeHttpUrl(u); return true; } catch { return false; }
      })
      .filter(u => !isLikelyLogo(u));
    return filtered[0] || null;
  } catch { return null; }
}

async function generateAIImage(prompt: string): Promise<Uint8Array> {
  const key = Deno.env.get("LOVABLE_API_KEY")!;
  const res = await fetch(AI_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.0-flash-preview-image-generation",
      messages: [{ role: "user", content: `Imagem fotográfica vibrante, dramática, alta qualidade, formato quadrado 1:1, atmosfera editorial moderna, sem texto, ${prompt}` }],
      modalities: ["image", "text"],
    }),
  });
  if (!res.ok) throw new Error(`Image AI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url?.startsWith("data:image")) throw new Error("no image returned");
  const b64 = url.split(",")[1];
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function stableTrackIndex(seed: string, length: number): number {
  if (length <= 1) return 0;
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % length;
}

async function doProcessing(supabase: any, item: any, userId: string, image_style: string, requestedMediaType = "") {
  try {
    const cleanTitle = sanitizeNewsTitle(item.original_title);
    if (cleanTitle && cleanTitle !== item.original_title) {
      item.original_title = cleanTitle;
      await supabase.from("news_items").update({ original_title: cleanTitle }).eq("id", item.id);
    }

    if (item.original_url) {
      const readableUrl = resolveReadableUrl(item.original_url);
      if (readableUrl !== item.original_url) {
        await supabase.from("news_items").update({ original_url: readableUrl }).eq("id", item.id);
        item.original_url = readableUrl;
      }
    }

    // Prefer per-account overrides if this news_item is bound to an IG account.
    // The account username remains the safe identity fallback when legacy brand
    // fields are empty.
    let settings: any = null;
    let accountUsername = "";
    if (item.instagram_account_id) {
      const { data: eff } = await supabase.rpc("get_effective_account_settings", { _account_id: item.instagram_account_id });
      if (eff) settings = eff;
      // Algumas instalações antigas restringem a RPC ao role authenticated.
      // Como a propriedade do item já foi validada, o cliente interno pode ler
      // diretamente os overrides sem perder a identidade ou o template da conta.
      if (!settings) {
        const { data: accountOverrides } = await supabase
          .from("account_settings")
          .select("*")
          .eq("instagram_account_id", item.instagram_account_id)
          .eq("user_id", userId)
          .maybeSingle();
        if (accountOverrides) settings = accountOverrides;
      }
      const { data: account } = await supabase
        .from("instagram_accounts")
        .select("username")
        .eq("id", item.instagram_account_id)
        .maybeSingle();
      accountUsername = account?.username || "";
    }
    const missingGlobalFallback = !settings ||
      !String(settings?.brand_name || "").trim() ||
      !String(settings?.brand_handle || "").trim() ||
      !String(settings?.brand_logo_url || "").trim();
    if (missingGlobalFallback) {
      const { data: us } = await supabase
        .from("user_settings")
        .select("ai_tone, brand_name, brand_handle, brand_logo_url, default_media_type, default_template_id, default_feed_template_id, default_story_template_id, default_reel_template_id")
        .eq("user_id", userId)
        .maybeSingle();
      settings = {
        ...(us || {}),
        ...(settings || {}),
        brand_name: String(settings?.brand_name || "").trim() || us?.brand_name || null,
        brand_handle: String(settings?.brand_handle || "").trim() || us?.brand_handle || null,
        brand_logo_url: String(settings?.brand_logo_url || "").trim() || us?.brand_logo_url || null,
      };
    }
    const intendedMediaType = requestedMediaType || settings?.default_media_type || "feed";
    let srcOpts: { lang?: string; translate?: boolean; cultural?: boolean } = {};
    if (item.source_id) {
      const { data: src } = await supabase.from("news_sources").select("source_language, translate_to_pt, cultural_adaptation").eq("id", item.source_id).maybeSingle();
      if (src) srcOpts = { lang: src.source_language, translate: src.translate_to_pt, cultural: src.cultural_adaptation };
    }
    // Gate translation/cultural adaptation by plan
    if (srcOpts.translate || srcOpts.cultural) {
      const { data: limits } = await supabase.rpc("get_user_plan_limits", { _user_id: userId });
      const row: any = Array.isArray(limits) ? limits[0] : limits;
      if (!row?.translation_enabled) {
        srcOpts.translate = false;
        srcOpts.cultural = false;
      }
    }
    let usedFallback = false;
    let ai: any;
    // Busca o corpo completo do artigo para enriquecer a legenda (RSS só traz resumo curto)
    if (item.original_url) {
      const body = await fetchArticleBody(item.original_url);
      if (body && body.length > 300) {
        (item as any)._article_body = body;
        console.log(`[article-body] ${item.original_url} -> ${body.length} chars`);
      } else {
        console.warn(`[article-body] ${item.original_url} -> apenas ${body?.length || 0} chars extraídos (insuficiente, usando só RSS)`);
      }
    }
    try {
      ai = await rewriteWithAI(item, settings?.ai_tone || "engajante e descontraído", srcOpts);
    } catch (e) {
      if (!isAiCreditError(e)) throw e;
      // Se a fonte exige tradução, NÃO usar fallback (geraria post em inglês misturado com PT).
      // Marca pra reprocessar quando os créditos voltarem.
      if (srcOpts.translate) {
        throw new Error("Sem créditos de IA e fonte requer tradução — aguardando recarga de créditos para reprocessar.");
      }
      usedFallback = true;
      ai = fallbackRewrite(item);
    }

    // A Edge Function prepara apenas texto e fonte visual. A composição pesada
    // (Canvas, fontes, templates e vídeo) acontece no worker media do VPS.
    // Isso mantém o runtime abaixo do limite de CPU e preserva a mesma arte dos
    // fluxos manual, automático e multi-conta.
    let photoUrl = item.original_image_url as string | null;
    if (!photoUrl && item.original_url) {
      photoUrl = await findOgImage(item.original_url);
    }

    if (image_style === "ai" && !usedFallback) {
      try {
        const generatedPhoto = await generateAIImage(`${ai.title}. ${ai.subtitle}`);
        const rawPath = `${userId}/${item.id}_raw.png`;
        const { error: rawErr } = await supabase.storage
          .from("post-images")
          .upload(rawPath, generatedPhoto, { contentType: "image/png", upsert: true });
        if (rawErr) throw rawErr;
        const { data: rawPub } = supabase.storage.from("post-images").getPublicUrl(rawPath);
        photoUrl = rawPub.publicUrl;
      } catch (e) {
        if (!isAiCreditError(e)) throw e;
        usedFallback = true;
      }
    }

    if (!photoUrl) throw new Error("Sem foto disponível para esta notícia");
    const safePhotoUrl = assertSafeHttpUrl(photoUrl.replace(/&amp;/gi, "&").replace(/&#38;/g, "&").trim());
    const identity = resolveEditorialIdentity(settings, accountUsername);
    assertEditorialCopy(ai.title, ai.subtitle);
    const handle = identity.brandHandle;
    const followCta = handle ? `👉 SIGA @${handle} para mais notícias do dia` : "";

    // Override de hashtags por conta IG: se a conta tiver custom_hashtags
    // configuradas, usa SEMPRE essas (ignora as geradas pela IA).
    if (item.instagram_account_id) {
      const { data: igAcc } = await supabase
        .from("instagram_accounts")
        .select("custom_hashtags")
        .eq("id", item.instagram_account_id)
        .maybeSingle();
      const custom = (igAcc?.custom_hashtags || []) as string[];
      if (custom.length > 0) {
        ai.hashtags = custom.map((h) => String(h).replace(/^#/, "").trim()).filter(Boolean);
      }
    }

    const safeHashtags = Array.isArray(ai.hashtags) && ai.hashtags.length > 0
      ? ai.hashtags
      : fallbackRewrite(item).hashtags;
    const hashtagsLine = safeHashtags.map((h: string) => `#${h.replace(/^#/, "")}`).join(" ");
    const reelHashtagsLine = safeHashtags.slice(0, 5).map((h: string) => `#${h.replace(/^#/, "")}`).join(" ");
    const usefulCaption = ensureUsefulCaption(ai.caption, item, ai.title, ai.summary);
    const finalCaption = buildCaptionWithExtras(
      usefulCaption,
      ["💬 Comente sua opinião\n💾 Salve para ler depois\n🔁 Compartilhe com quem precisa ver", followCta],
      hashtagsLine,
    );
    const usefulReelCaption = ensureUsefulCaption(ai.reel_caption || usefulCaption, item, ai.title, ai.summary);
    const reelCaptionFinal = buildCaptionWithExtras(usefulReelCaption, [followCta], reelHashtagsLine);

    // Escolha local e determinística de trilha. Uma segunda chamada de IA só
    // para áudio aumentava latência e consumo sem melhorar a notícia.
    let chosenTrackId: string | null = null;
    let chosenTrackUrl: string | null = null;
    try {
      const { data: tracks } = await supabase.from("reel_audio_tracks")
        .select("id, name, file_url").eq("user_id", userId);
      if (tracks && tracks.length > 0) {
        if (tracks.length === 1) {
          chosenTrackId = tracks[0].id;
          chosenTrackUrl = tracks[0].file_url;
        } else {
          // Anti-repetição: busca as últimas trilhas usadas para evitar repetir
          const { data: recent } = await supabase.from("news_items")
            .select("chosen_audio_track_id")
            .eq("user_id", userId)
            .not("chosen_audio_track_id", "is", null)
            .order("created_at", { ascending: false })
            .limit(3);
          const recentIds = new Set((recent || []).map((r: any) => r.chosen_audio_track_id));
          // Candidatas = trilhas que NÃO foram usadas recentemente.
          // Se todas foram usadas (ex: só tem 2-3 trilhas no total), libera todas.
          const candidates = tracks.filter((t: any) => !recentIds.has(t.id));
          const pool = candidates.length > 0 ? candidates : tracks;

          const pickedIdx = stableTrackIndex(`${item.id}:${ai.title}`, pool.length);
          chosenTrackId = pool[pickedIdx].id;
          chosenTrackUrl = pool[pickedIdx].file_url;
          console.log(`[audio-pick-local] "${ai.title.slice(0,40)}" -> ${pool[pickedIdx].name} (pool=${pool.length}/${tracks.length}, recent=${recentIds.size})`);
        }
      }
    } catch (e) {
      console.error("audio pick failed", e);
    }

    // A notícia fica textual e editorialmente pronta, mas a mídia permanece
    // bloqueada por editorial_ready=false até o worker do VPS terminar a arte.
    // O publish-scheduler já exige essa flag e nunca publica o arquivo parcial.
    const { data: processedRow, error: updErr } = await supabase.from("news_items").update({
      status: "processed",
      rewritten_title: ai.title,
      rewritten_summary: ai.summary,
      caption: finalCaption,
      reel_caption: reelCaptionFinal,
      hashtags: safeHashtags,
      original_image_url: safePhotoUrl,
      generated_image_url: null,
      generated_cover_url: null,
      generated_reel_cover_url: null,
      generated_video_url: null,
      editorial_ready: false,
      image_style: usedFallback ? "template" : image_style,
      chosen_audio_track_id: chosenTrackId,
      chosen_audio_url: chosenTrackUrl,
      error_message: usedFallback ? "Sem créditos de IA: processado com fallback gratuito." : null,
    }).eq("id", item.id).eq("user_id", userId).eq("status", "processing").select("id").maybeSingle();

    if (updErr) {
      console.error(`[process-news] update to processed failed for ${item.id}:`, updErr);
      throw new Error(`Failed to update news status to processed: ${updErr.message}`);
    }
    if (!processedRow) {
      throw new Error("Processamento perdeu o claim antes de concluir; resultado descartado com segurança.");
    }

    await supabase.from("activity_logs").insert({
      user_id: userId,
      action: "process_news",
      entity_type: "news_item",
      entity_id: item.id,
      details: {
        style: image_style,
        fallback: usedFallback,
        render_queued: true,
        media_type: intendedMediaType,
      },
    });
    return { status: "processed" as const };
  } catch (e) {
    // Backoff exponencial: tentativa 1 -> +5min, 2 -> +15min, 3 -> +60min.
    // Após 3 tentativas, fica como "failed" definitivo (sem next_retry_at).
    const prevAttempts = (item as any).retry_count ?? 0;
    const nextAttempt = prevAttempts + 1;
    const backoffMin = nextAttempt === 1 ? 5 : nextAttempt === 2 ? 15 : nextAttempt === 3 ? 60 : null;
    const nextRetryAt = backoffMin ? new Date(Date.now() + backoffMin * 60_000).toISOString() : null;
    const failureMessage = processingErrorMessage(e);
    const { error: failureUpdateError } = await supabase.from("news_items").update({
      status: "failed",
      error_message: failureMessage,
      retry_count: nextAttempt,
      next_retry_at: nextRetryAt,
    }).eq("id", item.id).eq("user_id", userId).eq("status", "processing");
    if (failureUpdateError) {
      console.error("[process-news] failed to persist processing failure", failureUpdateError.message);
    }
    // Persiste o estado antes de registrar o erro: em encerramentos do runtime a
    // notícia não permanece indefinidamente em processing.
    console.error("processing error", failureMessage);
    return { status: "failed" as const, error: failureMessage };
  }
}

Deno.serve(async (req) => {
  const requestId = req.headers.get("x-request-id")?.trim().slice(0, 100) || crypto.randomUUID();
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: { ...corsHeaders, "x-request-id": requestId } });
  }
  try {
    const auth = req.headers.get("Authorization") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    // Fix segurança: verificar secret ANTES de ler o body
    const internalSecretEnv = Deno.env.get("INTERNAL_CRON_SECRET");
    const providedSecret = req.headers.get("x-internal-secret");
    const isInternal = !!internalSecretEnv && providedSecret === internalSecretEnv;
    const body = await req.json();
    const { news_item_id, image_style = "template", media_type = "" } = body;
    let userId: string;
    let accessClient;
    if (isInternal) {
      if (!body?.user_id) {
        return jsonResponse({ error: "user_id required for internal calls", request_id: requestId }, 400, requestId);
      }
      userId = body.user_id;
      accessClient = adminClient;
    } else {
      if (!auth) return jsonResponse({ error: "unauthorized", request_id: requestId }, 401, requestId);
      accessClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
      const { data: { user } } = await accessClient.auth.getUser();
      if (!user) return jsonResponse({ error: "unauthorized", request_id: requestId }, 401, requestId);
      userId = user.id;
      const { data: approved } = await adminClient.rpc("is_approved", { _uid: userId });
      if (approved === false) return jsonResponse({ error: "account_not_approved", request_id: requestId }, 403, requestId);
    }

    // A leitura com o cliente autenticado valida o vínculo antes de promover o
    // restante do trabalho para o cliente interno, necessário no background.
    const { data: item, error } = await accessClient.from("news_items").select("*").eq("id", news_item_id).eq("user_id", userId).maybeSingle();
    if (error || !item) return jsonResponse({ error: "news item not found", request_id: requestId }, 404, requestId);

    const decision = decideNewsClaim(item.status, item.updated_at);
    if (decision === "already_processing") {
      return jsonResponse({ ok: false, already_processing: true, request_id: requestId }, 200, requestId);
    }
    if (decision === "ignore") {
      return jsonResponse({ ok: true, duplicate_ignored: true, request_id: requestId }, 200, requestId);
    }

    // Claim atômico. Falhas podem ser retomadas; processing só é recuperado
    // após a janela de abandono, mantendo a proteção contra consumo duplicado.
    let claimQuery = adminClient
      .from("news_items")
      .update({ status: "processing", error_message: null, next_retry_at: null })
      .eq("id", item.id)
      .eq("user_id", userId);
    claimQuery = decision === "reclaim_stale"
      ? claimQuery.eq("status", "processing").lt("updated_at", new Date(Date.now() - STALE_NEWS_PROCESSING_MS).toISOString())
      : claimQuery.in("status", ["pending", "failed"]);
    const { data: claimed, error: claimError } = await claimQuery
      .select("*")
      .maybeSingle();
    if (claimError) {
      return jsonResponse({ error: `claim_failed: ${claimError.message}`, request_id: requestId }, 500, requestId);
    }
    if (!claimed) {
      return jsonResponse({ ok: false, already_processing: true, request_id: requestId }, 200, requestId);
    }

    // Executa em background para não estourar o limite de CPU do runtime.
    // O catch de doProcessing persiste "failed" antes de qualquer log, então
    // um shutdown não deixa a notícia presa em processing (retry-failed-news
    // recupera via janela de abandono). A UI faz polling do estado final.
    const task = doProcessing(adminClient, claimed, userId, image_style, media_type)
      .catch((err) => console.error("background processing error", err));
    // deno-lint-ignore no-explicit-any
    const runtime = (globalThis as any).EdgeRuntime;
    if (runtime && typeof runtime.waitUntil === "function") {
      runtime.waitUntil(task);
    }
    return jsonResponse({ ok: true, status: "processing", claimed: true, request_id: requestId }, 202, requestId);
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "unknown";
    return jsonResponse({ error: processingErrorMessage(msg), request_id: requestId }, 500, requestId);
  }
});
