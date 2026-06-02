// Processes a news item: AI rewrites + image generation, then uploads to storage
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Resvg, initWasm } from "https://esm.sh/@resvg/resvg-wasm@2.6.2";

let wasmReady: Promise<void> | null = null;
async function ensureWasm() {
  if (!wasmReady) {
    wasmReady = fetch("https://esm.sh/@resvg/resvg-wasm@2.6.2/index_bg.wasm")
      .then((r) => r.arrayBuffer())
      .then((b) => initWasm(b));
  }
  await wasmReady;
}

let fontBuffers: Uint8Array[] | null = null;
async function loadFonts(): Promise<Uint8Array[]> {
  if (fontBuffers) return fontBuffers;
  // Fontsource via jsDelivr — leve (~80KB cada), confiável, com CORS
  const urls = [
    "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.16/files/inter-latin-900-normal.woff",
    "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.16/files/inter-latin-400-normal.woff",
  ];
  const buffers: Uint8Array[] = [];
  for (const u of urls) {
    try {
      const r = await fetch(u);
      if (r.ok) {
        const buf = new Uint8Array(await r.arrayBuffer());
        buffers.push(buf);
        console.log(`font loaded ${u} (${buf.length} bytes)`);
      } else {
        console.error(`font ${u} status ${r.status}`);
      }
    } catch (e) { console.error("font load failed", u, e); }
  }
  fontBuffers = buffers;
  return buffers;
}

async function svgToPng(svg: string): Promise<Uint8Array> {
  await ensureWasm();
  const fonts = await loadFonts();
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1080 },
    font: {
      fontBuffers: fonts,
      defaultFontFamily: "Inter",
      loadSystemFonts: false,
    },
  });
  return resvg.render().asPng();
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

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

async function fetchArticleBody(url: string): Promise<string> {
  try {
    const r = await fetch(url, {
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
      const text = decodeHtmlEntities(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
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
      body = jsonLdBody.replace(/\s+/g, " ").trim();
    }

    // Limite generoso pra IA absorver bastante material (~15k chars)
    return body.slice(0, 15000);
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
        v: 1, // bump pra invalidar cache global se o prompt mudar
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
    const ok = (parsed?.caption?.length || 0) >= 1500 && (parsed?.reel_caption?.length || 0) >= 600;
    if (ok) await setCachedRewrite(cacheKey, item.original_url, parsed);
  }
  return parsed;
}

async function rewriteWithAIRaw(item: any, tone: string, srcOpts: { lang?: string; translate?: boolean; cultural?: boolean } = {}, attempt = 1): Promise<any> {
  const key = Deno.env.get("LOVABLE_API_KEY")!;
  const minChars = 1800;
  const extraPush = attempt > 1
    ? `\n\nATENÇÃO: Sua última resposta foi CURTA DEMAIS. Desta vez, escreva uma legenda MUITO MAIS LONGA — no MÍNIMO ${minChars} caracteres e ENTRE 22 E 32 LINHAS. Expanda cada bloco com mais detalhes, exemplos, números, contexto histórico, comparações e impacto prático. Não economize palavras.`
    : "";
  const res = await fetch(AI_URL, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "google/gemini-2.5-pro", messages: [{ role: "system", content: `Você é um redator JORNALÍSTICO viral para Instagram em PT-BR, especialista em legendas LONGAS e DENSAS de informação. Tom: ${tone}.\n\nREGRAS ABSOLUTAS:\n- Reescreva sempre — JAMAIS copie do texto base.\n- NÃO mencione fontes, NÃO inclua links, NÃO use "veja a notícia completa", "acompanhe as atualizações", "leia mais".\n- ESTENDA o assunto MUITO além do texto base: traga seu próprio conhecimento sobre o tema, contexto histórico, números, dados, comparações com casos parecidos, exemplos do cotidiano, impactos práticos, opiniões fundamentadas, curiosidades, bastidores.\n- Conte uma micro-reportagem envolvente como se estivesse explicando em detalhes para um amigo curioso.\n- Linguagem simples, frases curtas, emojis estratégicos, parágrafos separados por QUEBRAS DUPLAS de linha.\n- HASHTAGS: 15 estratégicas em pirâmide (5 específicas do tema + 5 de nicho + 5 amplas). NUNCA aleatórias, NUNCA palavras quebradas do título, SEMPRE relevantes ao assunto real da notícia.\n- A legenda do FEED deve ser LONGA, RICA e DETALHADA — no MÍNIMO 1800 caracteres e ENTRE 22 E 32 LINHAS. NÃO entregue legenda curta de jeito nenhum.\n- A legenda do REEL (reel_caption) também deve ser RICA — no MÍNIMO 700 caracteres e ENTRE 10 E 16 LINHAS, com fatos, contexto, impacto e pergunta de engajamento. NUNCA entregue reel_caption de 3-5 linhas.${srcOpts.translate ? `\n\n🌍 IDIOMA DA FONTE: ${LANG_NAMES[srcOpts.lang || "auto"] || "auto-detectar"}. TRADUZA o conteúdo para PORTUGUÊS BRASILEIRO antes de reescrever. Todos os campos (title, subtitle, hook, summary, caption, reel_caption, hashtags) DEVEM ser em PT-BR natural e fluente — JAMAIS em outro idioma.` : ""}${srcOpts.cultural ? `\n\n🇧🇷 ADAPTAÇÃO CULTURAL BRASILEIRA: converta moedas estrangeiras para REAL com cotação atual aproximada (ex: "$100 mi" vira "cerca de R$ 500 milhões"), explique referências locais desconhecidas (ex: políticos, leis, eventos estrangeiros), use exemplos brasileiros equivalentes quando possível, e adapte gírias/expressões para o jeito brasileiro de falar.` : ""}${extraPush}` }, { role: "user", content: `Assunto base (ponto de partida — EXPANDA muito com seu próprio conhecimento):\nTítulo: ${item.original_title}\nResumo RSS: ${item.original_content || ""}${item._article_body ? `\n\n===== CORPO COMPLETO DO ARTIGO ORIGINAL (${item._article_body.length} caracteres) =====\n${item._article_body}\n===== FIM DO ARTIGO =====\n\n⚠️ REGRA OBRIGATÓRIA DE APROVEITAMENTO: Você DEVE usar PELO MENOS 50% das informações relevantes do artigo acima na legenda do feed (caption). Isso inclui: TODOS os nomes próprios citados, TODAS as datas, TODOS os números/valores/percentuais, TODOS os locais, TODAS as declarações importantes, contexto histórico mencionado, causas e consequências apresentadas. NÃO RESUMA superficialmente — DETALHE os fatos. Se o artigo tem 4000 caracteres de informação útil, sua legenda do feed deve carregar o equivalente a uns 2000+ caracteres dessa informação, reescrita com suas palavras e expandida com contexto adicional. JAMAIS copie frases literais, mas TODOS os fatos concretos do artigo devem aparecer reescritos.` : ""}\n\nGere um JSON com legenda LONGA, DENSA e RICA em informação útil sobre o tema${srcOpts.translate ? ", TRADUZIDO E ESCRITO 100% EM PORTUGUÊS BRASILEIRO" : ""}.` }], max_tokens: 16000, tools: [{ type: "function", function: { name: "out", description: "Resultado", parameters: { type: "object", properties: { title: { type: "string", description: "Título viral curto, máx 60 chars" }, subtitle: { type: "string", description: "Subtítulo de 1 linha" }, hook: { type: "string", description: "Gancho de 1-3 palavras MAIÚSCULAS para badge no topo do Reel: URGENTE, BOMBOU, EXCLUSIVO, ATENÇÃO, FIQUE LIGADO, CHOCOU, etc." }, summary: { type: "string", description: "Resumo de 2-3 frases" }, caption: { type: "string", description: "Legenda Feed JORNALÍSTICA, MUITO LONGA, DENSA, RICA em informação. OBRIGATÓRIO no MÍNIMO 1800 caracteres e ENTRE 22 e 32 LINHAS (parágrafos curtos separados por quebra dupla \\n\\n). Estrutura: 1) gancho impactante com emoji (1-2 linhas), 2) abertura envolvente do que aconteceu (3-4 linhas), 3) detalhamento dos fatos com NOMES, DATAS, LOCAIS, NÚMEROS específicos (5-7 linhas), 4) contexto histórico, antecedentes ou casos parecidos (4-5 linhas), 5) por que isso importa e impacto prático REAL no dia a dia (4-5 linhas), 6) exemplo concreto, analogia, bastidor ou curiosidade (3-4 linhas), 7) desdobramentos possíveis e cenários futuros (3-4 linhas), 8) pergunta de engajamento direta (1 linha). Use emojis ao longo do texto, frases curtas e linguagem simples. NÃO cite fontes, NÃO use 'veja mais' / 'acompanhe' / 'link na bio'. NUNCA entregar legenda curta — se entregar menos de 1800 caracteres a resposta será REJEITADA." }, reel_caption: { type: "string", description: "Legenda do Reel RICA em informação — OBRIGATÓRIO no MÍNIMO 700 caracteres e ENTRE 10 e 16 LINHAS (parágrafos curtos separados por \\n\\n). Estrutura: 1) gancho impactante com emoji (1 linha), 2) o que aconteceu de forma direta (2-3 linhas com NOMES, DATAS, LOCAIS, NÚMEROS), 3) detalhes / contexto importante (2-3 linhas), 4) por que isso importa / impacto prático (2-3 linhas), 5) curiosidade, bastidor ou desdobramento (1-2 linhas), 6) pergunta de engajamento direta (1 linha). Use emojis ao longo, frases curtas, linguagem simples. NÃO usar 'link na bio' / 'veja mais' / 'acompanhe'. Sem hashtags (vão separadas). NUNCA entregar legenda curta — menos de 600 caracteres será REJEITADO." }, hashtags: { type: "array", items: { type: "string" }, description: "EXATAMENTE 15 hashtags estratégicas em PIRÂMIDE de alcance, TODAS relevantes ao TEMA específico da notícia (não use palavras aleatórias do título). SEM #, sem espaços, sem acentos, minúsculas, em português. Estrutura OBRIGATÓRIA: (a) 5 hashtags ESPECÍFICAS do assunto/personagens/marcas/eventos citados — ex: nomes próprios, times, produtos, cidades; (b) 5 hashtags de NICHO médio relacionadas ao tema — ex: para futebol use brasileirao, futebolbrasileiro, copadobrasil; para fofoca use famosos, celebridades, tvefamosos; para política use politicabrasil, congresso, brasilia; (c) 5 hashtags AMPLAS de descoberta brasileiras de ALTO volume relevantes ao nicho — ex: noticias, brasil, urgente, viral, instagood. PROIBIDO: hashtags genéricas sem relação (ex: amor, vida, foto), palavras quebradas, hashtags em inglês exceto as universais (instagood, viral, news), repetições, palavras com menos de 4 letras." } }, required: ["title", "subtitle", "hook", "summary", "caption", "reel_caption", "hashtags"], additionalProperties: false } } }], tool_choice: { type: "function", function: { name: "out" } } }) });
  if (!res.ok) throw new Error(`AI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  const parsed = JSON.parse(args);
  const captionShort = (parsed?.caption?.length || 0) < 1500;
  const reelShort = (parsed?.reel_caption?.length || 0) < 600;
  if ((captionShort || reelShort) && attempt < 2) {
    console.log(`legendas curtas (caption=${parsed?.caption?.length}, reel=${parsed?.reel_caption?.length}), tentando novamente...`);
    return await rewriteWithAIRaw(item, tone, srcOpts, attempt + 1);
  }
  return parsed;
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

function fallbackRewrite(item: any) {
  const title = String(item.original_title || "Notícia importante").trim().slice(0, 90);
  const raw = String(item.original_content || item.original_title || "").replace(/\s+/g, " ").trim();
  const summary = raw ? raw.slice(0, 220) + (raw.length > 220 ? "..." : "") : title;
  const words = Array.from(new Set(cleanWords(`${item.original_title || ""} ${item.original_content || ""}`))).slice(0, 8);
  const hashtags = Array.from(new Set([...(words.length ? words : ["noticias", "atualidade"]), "noticias", "brasil"])).slice(0, 10);
  return {
    title,
    subtitle: summary.slice(0, 110),
    hook: "URGENTE",
    summary,
    caption: `${title}\n\n${summary}\n\nSalve este post para ler depois. 💾`,
    reel_caption: `${title}\n\n${summary.slice(0, 140)}\n\nO que você acha? 👇`,
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
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/g, "'")
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

function escapeXml(s: string) {
  const decoded = decodeHtmlEntities(s || "");
  return decoded.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars) {
      if (cur) lines.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}

async function tryFetchImage(url: string): Promise<{ buf: Uint8Array; ct: string } | null> {
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Referer": new URL(url).origin + "/",
      },
    });
    if (!r.ok) return null;
    const ct = r.headers.get("content-type") || "image/jpeg";
    if (!ct.startsWith("image/")) return null;
    return { buf: new Uint8Array(await r.arrayBuffer()), ct };
  } catch { return null; }
}

async function fetchAsDataUrl(url: string): Promise<string | null> {
  // Decodifica HTML entities da URL (&amp; -> &, etc.) — RSS frequentemente entrega URL escapada
  const cleanUrl = url
    .replace(/&amp;/gi, "&")
    .replace(/&#38;/g, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .trim();
  // 1) tenta direto
  let res = await tryFetchImage(cleanUrl);
  // 2) fallback via proxy weserv.nl (resolve 403/hotlink-block)
  if (!res) {
    const proxied = `https://images.weserv.nl/?url=${encodeURIComponent(cleanUrl.replace(/^https?:\/\//, ""))}&w=1080&output=jpg`;
    res = await tryFetchImage(proxied);
  }
  if (!res) return null;
  let bin = "";
  for (let i = 0; i < res.buf.length; i++) bin += String.fromCharCode(res.buf[i]);
  return `data:${res.ct};base64,${btoa(bin)}`;
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
    const r = await fetch(pageUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return null;
    const html = await r.text();
    const origin = new URL(pageUrl).origin;
    const candidates: string[] = [];
    const push = (u?: string | null) => { if (u && typeof u === "string" && !candidates.includes(u)) candidates.push(u); };

    // JSON-LD primeiro
    const jsonldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let jm: RegExpExecArray | null;
    while ((jm = jsonldRe.exec(html)) !== null) {
      try {
        const data = JSON.parse(jm[1].trim());
        const nodes = Array.isArray(data) ? data : (data["@graph"] || [data]);
        for (const n of nodes) {
          const img = n?.image;
          if (typeof img === "string") push(img);
          else if (Array.isArray(img)) img.forEach((x: any) => push(typeof x === "string" ? x : x?.url));
          else if (img?.url) push(img.url);
        }
      } catch {}
    }

    // figure dentro do article
    const articleMatch = html.match(/<article[\s\S]*?<\/article>/i);
    const articleHtml = articleMatch ? articleMatch[0] : html;
    const figRe = /<figure[\s\S]*?<img[^>]+(?:src|data-src|data-original)=["']([^"']+)["']/gi;
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
    const imgRe = /<img[^>]+(?:src|data-src|data-original)=["']([^"']+\.(?:jpe?g|png|webp)[^"']*)["']/gi;
    let im: RegExpExecArray | null;
    while ((im = imgRe.exec(articleHtml)) !== null) push(im[1]);

    const filtered = candidates
      .map(u => u.startsWith("//") ? "https:" + u : u.startsWith("/") ? origin + u : u)
      .filter(u => /^https?:\/\//i.test(u))
      .filter(u => !isLikelyLogo(u));
    return filtered[0] || null;
  } catch { return null; }
}

// Default Minimal Editorial template (used when user has no custom template)
function templateSvg(opts: {
  title: string;
  subtitle: string;
  source: string;
  brandName: string;
  brandHandle: string;
  logoDataUrl: string | null;
  photoDataUrl: string | null;
}) {
  const { title, subtitle, brandName, brandHandle, logoDataUrl, photoDataUrl } = opts;
  const handle = (brandHandle || brandName || "").replace(/^@/, "");
  const avatarCX = 70, avatarCY = 80, avatarR = 36;
  const handleX = avatarCX + avatarR + 22;
  const dividerY = 140;
  const upTitle = (title || "").toUpperCase();
  const titleLines = wrapText(upTitle, 24).slice(0, 4);
  const titleLineHeight = 60;
  const titleStartY = 210;
  const titleTspans = titleLines.map((l, i) => `<tspan x="60" y="${titleStartY + i * titleLineHeight}">${escapeXml(l)}</tspan>`).join("");
  const teaserLines = wrapText(subtitle || "", 60).slice(0, 2);
  const teaserStartY = titleStartY + titleLines.length * titleLineHeight + 16;
  const teaserLineHeight = 32;
  const teaserTspans = teaserLines.map((l, i) => `<tspan x="60" y="${teaserStartY + i * teaserLineHeight}">${escapeXml(l)}</tspan>`).join("");
  const headerHeight = 528;
  const photoY = headerHeight;
  const photoH = 1080 - photoY;
  const badgeW = 360, badgeH = 60;
  const badgeX = 1080 - badgeW - 60;
  const badgeY = photoY - badgeH / 2;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs>
    <clipPath id="logoClip"><circle cx="${avatarCX}" cy="${avatarCY}" r="${avatarR}"/></clipPath>
    <linearGradient id="fallbackBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1E1B4B"/>
      <stop offset="0.5" stop-color="#7C3AED"/>
      <stop offset="1" stop-color="#FFD400"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="${headerHeight}" fill="#FFFFFF"/>
  <circle cx="${avatarCX}" cy="${avatarCY}" r="${avatarR + 2}" fill="#F4F4F5"/>
  ${logoDataUrl
    ? `<image href="${logoDataUrl}" x="${avatarCX - avatarR}" y="${avatarCY - avatarR}" width="${avatarR * 2}" height="${avatarR * 2}" clip-path="url(#logoClip)" preserveAspectRatio="xMidYMid slice"/>`
    : `<text x="${avatarCX}" y="${avatarCY + 10}" font-family="Inter, sans-serif" font-size="26" font-weight="900" fill="#000" text-anchor="middle">${escapeXml(brandName.slice(0, 2).toUpperCase())}</text>`}
  <text x="${handleX}" y="${avatarCY + 10}" font-family="Inter, monospace" font-size="22" font-weight="800" fill="#000" letter-spacing="2">@${escapeXml(handle.toUpperCase())}</text>
  <circle cx="1020" cy="${avatarCY}" r="9" fill="#DC2626"/>
  <rect x="60" y="${dividerY}" width="960" height="1.5" fill="#000"/>
  <text font-family="Inter, Arial, sans-serif" font-size="56" font-weight="900" fill="#000" letter-spacing="-2">${titleTspans}</text>
  <text font-family="Inter, Arial, sans-serif" font-size="24" font-weight="500" fill="#52525B">${teaserTspans}</text>
  ${photoDataUrl
    ? `<image href="${photoDataUrl}" x="0" y="${photoY}" width="1080" height="${photoH}" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect x="0" y="${photoY}" width="1080" height="${photoH}" fill="url(#fallbackBg)"/>
       <text x="540" y="${photoY + photoH/2 - 20}" font-family="Inter, Arial, sans-serif" font-size="64" font-weight="900" fill="#FFF" text-anchor="middle" letter-spacing="-1">@${escapeXml(handle.toUpperCase())}</text>
       <text x="540" y="${photoY + photoH/2 + 40}" font-family="Inter, monospace" font-size="22" font-weight="700" fill="#FFD400" text-anchor="middle" letter-spacing="4">SIGA PARA MAIS NOTÍCIAS</text>`}
  <rect x="${badgeX}" y="${badgeY}" width="${badgeW}" height="${badgeH}" fill="#FFD400" stroke="#000" stroke-width="1.5"/>
  <text x="${badgeX + badgeW / 2}" y="${badgeY + 40}" font-family="Inter, monospace" font-size="22" font-weight="900" fill="#000" text-anchor="middle" letter-spacing="3">LEIA A LEGENDA →</text>
</svg>`;
}

// Custom template renderer: user-uploaded background OR preset, with config overlay
function customTemplateSvg(opts: {
  title: string;
  subtitle: string;
  brandHandle: string;
  brandName: string;
  bgDataUrl: string | null;
  presetKey: string | null;
  config: any;
  photoDataUrl?: string | null;
  height?: number;
}) {
  const { title, subtitle, brandHandle, brandName, bgDataUrl, presetKey, config: c, photoDataUrl } = opts;
  const height = opts.height || 1080;
  const handle = (brandHandle || brandName || "").replace(/^@/, "");
  const base = height === 1080 ? {
    titleY: 180, titleSize: 56, titleColor: "#FFFFFF", titleMaxChars: 26,
    subtitleY: 440, subtitleSize: 24, subtitleColor: "#FFFFFF",
    showHandle: true, handleY: 90, handleColor: "#FFFFFF",
    showBadge: true, badgeText: "LEIA A LEGENDA →", badgeBg: "#FFD400", badgeColor: "#000000", badgeY: 990,
    overlayOpacity: 0.35,
    showPhoto: true, photoX: 0, photoY: 528, photoW: 1080, photoH: 552,
  } : {
    titleY: 1040, titleSize: 74, titleColor: "#FFFFFF", titleMaxChars: 22,
    subtitleY: 1380, subtitleSize: 32, subtitleColor: "#FFFFFF",
    showHandle: true, handleY: 130, handleColor: "#FFFFFF",
    showBadge: true, badgeText: "LEIA A LEGENDA →", badgeBg: "#FFD400", badgeColor: "#000000", badgeY: 1540,
    overlayOpacity: 0.45,
    showPhoto: true, photoX: 0, photoY: 0, photoW: 1080, photoH: 1920,
  };
  const mergedCfg = {
    ...base,
    ...(c || {}),
  };
  const legacyLayout =
    mergedCfg.titleY === 540 &&
    mergedCfg.subtitleY === 800 &&
    mergedCfg.badgeY === 980 &&
    mergedCfg.photoX === 90 &&
    mergedCfg.photoY === 600 &&
    mergedCfg.photoW === 420 &&
    mergedCfg.photoH === 280;
  const cfg = legacyLayout
    ? { ...mergedCfg, titleY: base.titleY, titleSize: base.titleSize, titleMaxChars: base.titleMaxChars, subtitleY: base.subtitleY, subtitleSize: base.subtitleSize, handleY: base.handleY, badgeY: base.badgeY, photoX: base.photoX, photoY: base.photoY, photoW: base.photoW, photoH: base.photoH, overlayOpacity: base.overlayOpacity }
    : mergedCfg;

  const titleLines = wrapText((title || "").toUpperCase(), cfg.titleMaxChars).slice(0, 5);
  const titleLH = Math.round(cfg.titleSize * 1.05);
  const titleTspans = titleLines.map((l, i) => `<tspan x="60" y="${cfg.titleY + i * titleLH}">${escapeXml(l)}</tspan>`).join("");
  const subLines = wrapText(subtitle || "", Math.floor(cfg.titleMaxChars * 2.2)).slice(0, 2);
  const subLH = Math.round(cfg.subtitleSize * 1.3);
  const subTspans = subLines.map((l, i) => `<tspan x="60" y="${cfg.subtitleY + i * subLH}">${escapeXml(l)}</tspan>`).join("");

  const badgeW = Math.max(280, cfg.badgeText.length * 18 + 40);
  const badgeH = 60;
  const badgeX = 1080 - badgeW - 60;

  // Preset backgrounds (apenas quando não há background customizado)
  let presetBg = "";
  if (!bgDataUrl) {
    if (presetKey === "bold_stripe") {
      presetBg = `<rect width="1080" height="${height}" fill="#FFFFFF"/><rect width="1080" height="240" fill="#FFD400"/>`;
    } else if (presetKey === "breaking_news") {
      presetBg = `<rect width="1080" height="${height}" fill="#0A0A0A"/><rect width="1080" height="200" fill="#DC2626"/>`;
    } else {
      presetBg = `<rect width="1080" height="${height}" fill="#FFFFFF"/><rect y="${Math.min(640, height - 440)}" width="1080" height="440" fill="#18181B"/>`;
    }
  }

  // Para presets sem background, usa overlay; para template custom, sem overlay (preserva arte)
  const overlay = bgDataUrl ? "" : `<rect width="1080" height="${height}" fill="rgba(0,0,0,${cfg.overlayOpacity})"/>`;

  // Foto da notícia encaixada na "caixa de foto" do template
  const photoBlock = (cfg.showPhoto && photoDataUrl)
    ? `<image href="${photoDataUrl}" x="${cfg.photoX}" y="${cfg.photoY}" width="${cfg.photoW}" height="${cfg.photoH}" preserveAspectRatio="xMidYMid slice"/>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="${height}" viewBox="0 0 1080 ${height}">
  ${bgDataUrl
    ? `<image href="${bgDataUrl}" x="0" y="0" width="1080" height="${height}" preserveAspectRatio="xMidYMid slice"/>`
    : presetBg}
  ${photoBlock}
  ${overlay}
  ${cfg.showHandle ? `<text x="60" y="${cfg.handleY}" font-family="Inter, monospace" font-size="22" font-weight="800" fill="${cfg.handleColor}" letter-spacing="2">@${escapeXml(handle.toUpperCase())}</text>` : ""}
  <text font-family="Inter, Arial, sans-serif" font-size="${cfg.titleSize}" font-weight="900" fill="${cfg.titleColor}" letter-spacing="-2">${titleTspans}</text>
  <text font-family="Inter, Arial, sans-serif" font-size="${cfg.subtitleSize}" font-weight="500" fill="${cfg.subtitleColor}">${subTspans}</text>
  ${cfg.showBadge ? `<rect x="${badgeX}" y="${cfg.badgeY}" width="${badgeW}" height="${badgeH}" fill="${cfg.badgeBg}"/>
  <text x="${badgeX + badgeW / 2}" y="${cfg.badgeY + 40}" font-family="Inter, monospace" font-size="22" font-weight="900" fill="${cfg.badgeColor}" text-anchor="middle" letter-spacing="3">${escapeXml(cfg.badgeText)}</text>` : ""}
</svg>`;
}

// Vertical Reel cover 1080x1920 with hook + CTA "SIGA @handle"
function reelCoverSvg(opts: {
  title: string;
  hook: string;
  brandName: string;
  brandHandle: string;
  logoDataUrl: string | null;
  photoDataUrl: string | null;
}) {
  const { title, hook, brandName, brandHandle, logoDataUrl, photoDataUrl } = opts;
  const titleLines = wrapText(title, 22).slice(0, 5);
  const lh = 88;
  const titleBlockH = titleLines.length * lh;
  const titleStartY = 1100;
  const titleTspans = titleLines.map((l, i) => `<tspan x="60" y="${titleStartY + i * lh}">${escapeXml(l)}</tspan>`).join("");
  const handle = (brandHandle || brandName || "").replace(/^@/, "");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs>
    <clipPath id="logoClip2"><circle cx="100" cy="100" r="50"/></clipPath>
    <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#000" stop-opacity="0"/>
      <stop offset="0.55" stop-color="#000" stop-opacity="0.85"/>
      <stop offset="1" stop-color="#000" stop-opacity="1"/>
    </linearGradient>
  </defs>
  ${photoDataUrl
    ? `<image href="${photoDataUrl}" x="0" y="0" width="1080" height="1920" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect width="1080" height="1920" fill="#0A0A0A"/>`
  }
  <!-- dark gradient overlay for legibility -->
  <rect width="1080" height="1920" fill="url(#grad)"/>

  <!-- HOOK badge top (URGENTE / FIQUE LIGADO) -->
  <rect x="60" y="80" width="auto" height="78" rx="14" fill="#FF1744"/>
  <rect x="60" y="80" width="${Math.min(900, 60 + hook.length * 28)}" height="78" rx="14" fill="#FF1744"/>
  <text x="${60 + Math.min(900, 60 + hook.length * 28)/2 - 30}" y="135" font-family="Inter, Arial, sans-serif" font-size="44" font-weight="900" fill="#FFF" text-anchor="middle">🚨 ${escapeXml(hook)}</text>

  <!-- brand mark top right -->
  <circle cx="1000" cy="100" r="52" fill="#FFD400"/>
  ${logoDataUrl
    ? `<image href="${logoDataUrl}" x="950" y="50" width="100" height="100" clip-path="url(#logoClip2)" preserveAspectRatio="xMidYMid slice"/>`
    : `<text x="1000" y="115" font-family="Inter, sans-serif" font-size="32" font-weight="900" fill="#000" text-anchor="middle">${escapeXml(brandName.slice(0,2).toUpperCase())}</text>`
  }

  <!-- title block (bottom area) -->
  <text font-family="Inter, Arial, sans-serif" font-size="78" font-weight="900" fill="#FFF" letter-spacing="-2">${titleTspans}</text>

  <!-- CTA SIGA -->
  <rect x="60" y="${titleStartY + titleBlockH + 30}" width="960" height="100" rx="50" fill="#FFD400"/>
  <text x="540" y="${titleStartY + titleBlockH + 95}" font-family="Inter, Arial, sans-serif" font-size="44" font-weight="900" fill="#000" text-anchor="middle">👉 SIGA @${escapeXml(handle)} PARA MAIS</text>

  <!-- swipe hint -->
  <text x="540" y="${titleStartY + titleBlockH + 180}" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="600" fill="#FFF" text-anchor="middle" opacity="0.85">⬇ Veja a legenda completa</text>
</svg>`;
}

async function svgToPngSize(svg: string, width: number): Promise<Uint8Array> {
  await ensureWasm();
  const fonts = await loadFonts();
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: { fontBuffers: fonts, defaultFontFamily: "Inter", loadSystemFonts: false },
  });
  return resvg.render().asPng();
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

function templateIdForFormat(settings: any, format: string) {
  if (format === "story" || format === "stories") {
    return settings?.default_story_template_id || settings?.default_template_id || null;
  }
  if (format === "reel" || format === "reels") {
    return settings?.default_reel_template_id || settings?.default_template_id || null;
  }
  return settings?.default_feed_template_id || settings?.default_template_id || null;
}

async function loadTemplate(supabase: any, userId: string, templateId: string | null, format: string) {
  if (!templateId) return null;
  const normalized = format === "story" ? "stories" : format === "reel" ? "reels" : "feed";
  const { data: tpl } = await supabase
    .from("post_templates")
    .select("*")
    .eq("id", templateId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!tpl) return null;
  return (tpl.format || "feed") === normalized ? tpl : null;
}

async function doProcessing(supabase: any, item: any, userId: string, image_style: string, requestedMediaType = "") {
  try {
    // Prefer per-account overrides if this news_item is bound to an IG account
    let settings: any = null;
    if (item.instagram_account_id) {
      const { data: eff } = await supabase.rpc("get_effective_account_settings", { _account_id: item.instagram_account_id });
      if (eff) settings = eff;
    }
    if (!settings) {
      const { data: us } = await supabase
        .from("user_settings")
        .select("ai_tone, brand_name, brand_handle, brand_logo_url, default_media_type, default_template_id, default_feed_template_id, default_story_template_id, default_reel_template_id")
        .eq("user_id", userId)
        .maybeSingle();
      settings = us;
    }
    const intendedMediaType = requestedMediaType || settings?.default_media_type || "feed";
    const activeFeedTemplate = await loadTemplate(supabase, userId, templateIdForFormat(settings, "feed"), "feed");
    const activeVerticalTemplate = await loadTemplate(supabase, userId, templateIdForFormat(settings, intendedMediaType), intendedMediaType);
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

    // ── 1. Foto crua da notícia (raw photo — fallback e fundo do template) ────
    let rawPhotoBytes: Uint8Array | null = null;
    let rawPhotoDataUrl: string | null = null;

    if (image_style === "ai" && !usedFallback) {
      try {
        rawPhotoBytes = await generateAIImage(`${ai.title}. ${ai.subtitle}`);
      } catch (e) {
        if (!isAiCreditError(e)) throw e;
        usedFallback = true;
      }
    }

    let photoUrl = item.original_image_url as string | null;
    if (!photoUrl && item.original_url) {
      photoUrl = await findOgImage(item.original_url);
      if (photoUrl) await supabase.from("news_items").update({ original_image_url: photoUrl }).eq("id", item.id);
    }

    if (!rawPhotoBytes && photoUrl) {
      const cleanUrl = photoUrl.replace(/&amp;/gi, "&").replace(/&#38;/g, "&").trim();
      const proxied = `https://images.weserv.nl/?url=${encodeURIComponent(cleanUrl.replace(/^https?:\/\//, ""))}&w=1080&h=1080&fit=cover&output=jpg&q=85`;
      const r = await fetch(proxied);
      if (r.ok) rawPhotoBytes = new Uint8Array(await r.arrayBuffer());
    }

    if (!rawPhotoBytes) {
      // Placeholder escuro caso não haja foto alguma
      const ph = `https://images.weserv.nl/?url=via.placeholder.com/1080x1080/0a0a0a/ffffff.jpg&w=1080&h=1080&output=jpg`;
      const r = await fetch(ph);
      if (r.ok) rawPhotoBytes = new Uint8Array(await r.arrayBuffer());
      else throw new Error("Sem foto disponível para esta notícia");
    }

    // Converte rawPhotoBytes para data-URL (para incorporar no SVG)
    if (rawPhotoBytes) {
      let bin = "";
      for (let i = 0; i < rawPhotoBytes.length; i++) bin += String.fromCharCode(rawPhotoBytes[i]);
      rawPhotoDataUrl = `data:image/jpeg;base64,${btoa(bin)}`;
    }

    // Upload da foto crua (gerada por IA ou baixada da notícia)
    const rawExt = image_style === "ai" && !usedFallback ? "png" : "jpg";
    const rawCt  = image_style === "ai" && !usedFallback ? "image/png" : "image/jpeg";
    const rawPath = `${userId}/${item.id}_raw.${rawExt}`;
    const { error: rawErr } = await supabase.storage.from("post-images").upload(rawPath, rawPhotoBytes!, { contentType: rawCt, upsert: true });
    if (rawErr) throw rawErr;
    const { data: rawPub } = supabase.storage.from("post-images").getPublicUrl(rawPath);

    // ── 2. Logo da marca (para o template) ────────────────────────────────────
    let logoDataUrl: string | null = null;
    if (settings?.brand_logo_url) {
      try {
        const lr = await fetch(settings.brand_logo_url);
        if (lr.ok) {
          const lbuf = new Uint8Array(await lr.arrayBuffer());
          const lct = lr.headers.get("content-type") || "image/png";
          let lb = "";
          for (let i = 0; i < lbuf.length; i++) lb += String.fromCharCode(lbuf[i]);
          logoDataUrl = `data:${lct};base64,${btoa(lb)}`;
        }
      } catch (e) { console.warn("[logo-fetch]", e); }
    }

    // ── 3. Arte editorial do Feed (1080×1080 PNG com template overlay) ────────
    let editorialBytes: Uint8Array | null = null;
    let generatedCoverUrl: string | null = null;
    let editorialReady = false;

    try {
      let feedSvg: string;
      const brandName  = settings?.brand_name  || "";
      const brandHandle = settings?.brand_handle || brandName;

      if (activeFeedTemplate && (activeFeedTemplate.background_url || activeFeedTemplate.preset_key)) {
        // Template customizado: busca background se houver URL
        let bgDataUrl: string | null = null;
        if (activeFeedTemplate.background_url) {
          bgDataUrl = await fetchAsDataUrl(activeFeedTemplate.background_url);
        }
        feedSvg = customTemplateSvg({
          title: ai.title,
          subtitle: ai.subtitle,
          brandHandle,
          brandName,
          bgDataUrl,
          presetKey: activeFeedTemplate.preset_key ?? null,
          config: activeFeedTemplate.config ?? {},
          photoDataUrl: rawPhotoDataUrl,
          height: 1080,
        });
      } else {
        // Template padrão (Minimal Editorial)
        feedSvg = templateSvg({
          title: ai.title,
          subtitle: ai.subtitle,
          source: "",
          brandName,
          brandHandle,
          logoDataUrl,
          photoDataUrl: rawPhotoDataUrl,
        });
      }

      editorialBytes = await svgToPng(feedSvg);
      const editPath = `${userId}/${item.id}_editorial.png`;
      const { error: editErr } = await supabase.storage
        .from("post-images")
        .upload(editPath, editorialBytes, { contentType: "image/png", upsert: true });
      if (!editErr) {
        const { data: editPub } = supabase.storage.from("post-images").getPublicUrl(editPath);
        generatedCoverUrl = editPub.publicUrl;
        editorialReady = true;
        console.log(`[editorial] Feed art gerada: ${editPath}`);
      } else {
        console.warn("[editorial] Upload falhou:", editErr);
      }
    } catch (e) {
      // Falha na composição não é fatal — o scheduler usará a foto crua como fallback
      console.warn("[editorial] Geração falhou (não fatal):", e instanceof Error ? e.message : e);
    }

    // ── 4. Capa do Reel (1080×1920 PNG) ─────────────────────────────────────
    let reelCoverUrl: string | null = null;
    try {
      let rcSvg: string;
      if (activeVerticalTemplate && (activeVerticalTemplate.background_url || activeVerticalTemplate.preset_key)) {
        let bgDataUrl: string | null = null;
        if (activeVerticalTemplate.background_url) {
          bgDataUrl = await fetchAsDataUrl(activeVerticalTemplate.background_url);
        }
        rcSvg = customTemplateSvg({
          title: ai.title,
          subtitle: ai.subtitle,
          brandHandle: settings?.brand_handle || settings?.brand_name || "",
          brandName: settings?.brand_name || "",
          bgDataUrl,
          presetKey: activeVerticalTemplate.preset_key ?? null,
          config: activeVerticalTemplate.config ?? {},
          photoDataUrl: rawPhotoDataUrl,
          height: 1920,
        });
      } else {
        rcSvg = reelCoverSvg({
          title: ai.title,
          hook: ai.hook || "URGENTE",
          brandName: settings?.brand_name || "",
          brandHandle: settings?.brand_handle || settings?.brand_name || "",
          logoDataUrl,
          photoDataUrl: rawPhotoDataUrl,
        });
      }
      const rcBytes = await svgToPngSize(rcSvg, 1080);
      const rcPath = `${userId}/${item.id}_reel_cover.png`;
      const { error: rcErr } = await supabase.storage
        .from("post-images")
        .upload(rcPath, rcBytes, { contentType: "image/png", upsert: true });
      if (!rcErr) {
        const { data: rcPub } = supabase.storage.from("post-images").getPublicUrl(rcPath);
        reelCoverUrl = rcPub.publicUrl;
        console.log(`[editorial] Reel cover gerada: ${rcPath}`);
      } else {
        console.warn("[editorial] Reel cover upload falhou:", rcErr);
      }
    } catch (e) {
      console.warn("[editorial] Reel cover falhou (não fatal):", e instanceof Error ? e.message : e);
    }

    // pub.publicUrl agora aponta para a foto crua (compatibilidade)
    const pub = rawPub;

    const handle = (settings?.brand_handle || settings?.brand_name || "").replace(/^@/, "");
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

    const hashtagsLine = ai.hashtags.map((h: string) => `#${h.replace(/^#/, "")}`).join(" ");
    const reelHashtagsLine = ai.hashtags.slice(0, 5).map((h: string) => `#${h.replace(/^#/, "")}`).join(" ");
    const finalCaption = [
      ai.caption,
      "💬 Comente sua opinião\n💾 Salve para ler depois\n🔁 Compartilhe com quem precisa ver",
      followCta,
      hashtagsLine,
    ].filter(Boolean).join("\n\n");
    const reelCaptionFinal = [
      (ai.reel_caption || ai.caption.split("\n\n").slice(0, 3).join("\n\n")),
      followCta,
      reelHashtagsLine,
    ].filter(Boolean).join("\n\n");

    // Escolha automática de trilha sonora pela IA (com base no nome do arquivo + tom da notícia)
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

          const list = pool.map((t: any, i: number) => `${i + 1}. ${t.name}`).join("\n");
          const avoidLine = candidates.length > 0 && recentIds.size > 0
            ? `\n\nIMPORTANTE: as últimas trilhas usadas foram excluídas da lista — escolha qualquer uma das disponíveis abaixo (NÃO repita as últimas).`
            : "";
          const pickRes = await fetch(AI_URL, {
            method: "POST",
            headers: { Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash-lite",
              messages: [
                { role: "system", content: "Você escolhe a trilha sonora ideal para um Reel de notícia, baseando-se SÓ no NOME do arquivo (que descreve o tom/emoção: tenso, feliz, urgente, dramático, esportivo, polêmico, etc.) e no conteúdo da notícia. Varie as escolhas para o feed não ficar repetitivo. Responda apenas com o NÚMERO da trilha escolhida." },
                { role: "user", content: `Notícia:\nTítulo: ${ai.title}\nResumo: ${ai.summary}\nGancho: ${ai.hook}\n\nTrilhas disponíveis:\n${list}${avoidLine}\n\nResponda apenas com o número da trilha que melhor combina com o tom emocional da notícia.` },
              ],
              max_tokens: 10,
            }),
          });
          let pickedIdx = -1;
          if (pickRes.ok) {
            const pd = await pickRes.json();
            const txt = pd.choices?.[0]?.message?.content || "";
            const num = parseInt((txt.match(/\d+/) || ["0"])[0]);
            if (Number.isFinite(num) && num >= 1 && num <= pool.length) {
              pickedIdx = num - 1;
            }
          }
          // Fallback: sorteio aleatório entre as candidatas (não a primeira fixa)
          if (pickedIdx < 0) {
            pickedIdx = Math.floor(Math.random() * pool.length);
          }
          chosenTrackId = pool[pickedIdx].id;
          chosenTrackUrl = pool[pickedIdx].file_url;
          console.log(`[audio-pick] "${ai.title.slice(0,40)}" -> ${pool[pickedIdx].name} (pool=${pool.length}/${tracks.length}, recent=${recentIds.size})`);
        }
      }
    } catch (e) {
      console.error("audio pick failed", e);
    }

    // editorial_ready agora é definido aqui no backend quando a arte for
    // gerada com sucesso. Se a composição SVG/WASM falhar, o campo fica false
    // e o scheduler ainda aplica o fallback dos 15 min (foto crua).
    // Isso elimina o "gargalo do canvas" descrito na análise de arquitetura:
    // o autopiloto não precisa mais que um navegador esteja aberto.
    await supabase.from("news_items").update({
      status: "processed",
      rewritten_title: ai.title,
      rewritten_summary: ai.summary,
      caption: finalCaption,
      reel_caption: reelCaptionFinal,
      hashtags: ai.hashtags,
      generated_image_url: pub.publicUrl,          // foto crua da notícia
      generated_cover_url: generatedCoverUrl       // arte editorial Feed (PNG composto)
        ?? reelCoverUrl                            // fallback: capa do Reel
        ?? pub.publicUrl,                          // último fallback: foto crua
      generated_reel_cover_url: reelCoverUrl ?? null,
      editorial_ready: editorialReady,             // true quando arte foi gerada com sucesso
      image_style: usedFallback ? "template" : image_style,
      chosen_audio_track_id: chosenTrackId,
      chosen_audio_url: chosenTrackUrl,
      error_message: usedFallback ? "Sem créditos de IA: processado com fallback gratuito." : null,
    }).eq("id", item.id);

    await supabase.from("activity_logs").insert({ user_id: userId, action: "process_news", entity_type: "news_item", entity_id: item.id, details: { style: image_style, fallback: usedFallback } });
  } catch (e) {
    console.error("background processing error", e);
    // Backoff exponencial: tentativa 1 -> +5min, 2 -> +15min, 3 -> +60min.
    // Após 3 tentativas, fica como "failed" definitivo (sem next_retry_at).
    const prevAttempts = (item as any).retry_count ?? 0;
    const nextAttempt = prevAttempts + 1;
    const backoffMin = nextAttempt === 1 ? 5 : nextAttempt === 2 ? 15 : nextAttempt === 3 ? 60 : null;
    const nextRetryAt = backoffMin ? new Date(Date.now() + backoffMin * 60_000).toISOString() : null;
    await supabase.from("news_items").update({
      status: "failed",
      error_message: e instanceof Error ? e.message : String(e),
      retry_count: nextAttempt,
      next_retry_at: nextRetryAt,
    }).eq("id", item.id);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    // Fix segurança: verificar secret ANTES de ler o body
    const internalSecretEnv = Deno.env.get("INTERNAL_CRON_SECRET");
    const providedSecret = req.headers.get("x-internal-secret");
    const isInternal = !!internalSecretEnv && providedSecret === internalSecretEnv;
    const body = await req.json();
    const { news_item_id, image_style = "template", media_type = "" } = body;
    let userId: string;
    let supabase;
    if (isInternal) {
      if (!body?.user_id) {
        return new Response(JSON.stringify({ error: "user_id required for internal calls" }), { status: 400, headers: corsHeaders });
      }
      userId = body.user_id;
      supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    } else {
      if (!auth) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });
      supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });
      userId = user.id;
    }

    const { data: item, error } = await supabase.from("news_items").select("*").eq("id", news_item_id).eq("user_id", userId).maybeSingle();
    if (error || !item) return new Response(JSON.stringify({ error: "news item not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    await supabase.from("news_items").update({ status: "processing", error_message: null }).eq("id", item.id);

    // Processa em background — libera o worker imediatamente para evitar CPU Time exceeded
    // @ts-ignore EdgeRuntime existe no Supabase Edge Functions
    EdgeRuntime.waitUntil(doProcessing(supabase, item, userId, image_style, media_type));

    return new Response(JSON.stringify({ ok: true, queued: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "unknown";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
