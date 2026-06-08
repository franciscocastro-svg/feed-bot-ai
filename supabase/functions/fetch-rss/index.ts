// Fetches RSS feeds for the authenticated user and stores new news_items
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

async function fetchXmlSmart(url: string): Promise<string> {
  const safeUrl = assertSafeHttpUrl(url);
  const res = await fetch(safeUrl, { headers: { "User-Agent": "NewsFlow/1.0" }, signal: AbortSignal.timeout(15000) });
  const buf = new Uint8Array(await res.arrayBuffer());
  // tenta detectar charset via header HTTP
  const ct = res.headers.get("content-type") || "";
  let charset = (ct.match(/charset=([^;]+)/i)?.[1] || "").trim().toLowerCase();
  if (!charset) {
    // sniff dos primeiros bytes (ASCII) para achar declaração XML
    const head = new TextDecoder("ascii").decode(buf.slice(0, 200));
    const m = head.match(/encoding=["']([^"']+)["']/i);
    if (m) charset = m[1].toLowerCase();
  }
  if (!charset) charset = "utf-8";
  // normaliza nomes
  if (charset === "iso-8859-1" || charset === "latin1" || charset === "iso8859-1") charset = "windows-1252";
  try {
    return new TextDecoder(charset, { fatal: false }).decode(buf);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(buf);
  }
}

function parseRss(xml: string) {
  const items: any[] = [];
  const re = /<item[\s\S]*?<\/item>/g;
  const matches = xml.match(re) || [];
  for (const block of matches) {
    const getRaw = (tag: string) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
      if (!m) return "";
      return decodeEntities(decodeEntities(m[1].replace(/<!\[CDATA\[|\]\]>/g, "")));
    };
    const get = (tag: string) => {
      const raw = getRaw(tag);
      // decodifica entidades 2x (alguns feeds fazem double-encoding)
      return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    };
    const title = get("title");
    const link = get("link");
    const description = get("description");
    const rawDescription = getRaw("description");
    const pubDate = get("pubDate") || get("dc:date");
    let image = "";
    const enc = block.match(/<enclosure[^>]*url=["']([^"']+)["']/i);
    if (enc) image = enc[1];
    else {
      const mt = block.match(/<media:content[^>]*url=["']([^"']+)["']/i);
      if (mt) image = mt[1];
      else {
        const thumb = block.match(/<media:thumbnail[^>]*url=["']([^"']+)["']/i);
        if (thumb) image = thumb[1];
        else {
          const img = rawDescription.match(/<img[^>]*src=["']([^"']+)["']/i);
          if (img) image = img[1];
        }
      }
    }
    // tenta também content:encoded
    if (!image) {
      const ce = block.match(/<content:encoded[^>]*>([\s\S]*?)<\/content:encoded>/i);
      if (ce) {
        const img = ce[1].match(/<img[^>]*src=["']([^"']+)["']/i);
        if (img) image = img[1];
      }
    }
    if (title && link) items.push({ title, link, description, pubDate, image });
  }
  return items;
}

function isLikelyLogo(url: string): boolean {
  const u = url.toLowerCase();
  if (/(logo|brand|sprite|icon|favicon|placeholder|default|avatar|share|social|watermark|selo|header|nav|footer)/i.test(u)) return true;
  if (/news\.google\.com|ssl\.gstatic\.com\/news|gstatic\.com\/images\/branding/i.test(u)) return true;
  if (/\.svg(\?|$)/i.test(u)) return true;
  const m = u.match(/[?&](?:w|width|h|height)=(\d+)/);
  if (m && parseInt(m[1]) < 300) return true;
  return false;
}

function isGoogleNewsUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "news.google.com";
  } catch {
    return false;
  }
}

function extractAllCandidates(html: string): string[] {
  const out: string[] = [];
  const push = (u?: string | null) => { if (u && typeof u === "string" && !out.includes(u)) out.push(u); };

  // 1) JSON-LD (NewsArticle/Article) — geralmente tem a imagem real
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
    } catch { /* malformed */ }
  }

  // 2) <figure> dentro de <article>
  const articleMatch = html.match(/<article[\s\S]*?<\/article>/i);
  const articleHtml = articleMatch ? articleMatch[0] : html;
  const figRe = /<figure[\s\S]*?<img[^>]+(?:src|data-src|data-original)=["']([^"']+)["']/gi;
  let fm: RegExpExecArray | null;
  while ((fm = figRe.exec(articleHtml)) !== null) push(fm[1]);

  // 3) og:image / twitter:image
  const ogPatterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/gi,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/gi,
  ];
  for (const p of ogPatterns) {
    let om: RegExpExecArray | null;
    while ((om = p.exec(html)) !== null) push(om[1]);
  }

  // 4) qualquer <img> grande no artigo
  const imgRe = /<img[^>]+(?:src|data-src|data-original)=["']([^"']+\.(?:jpe?g|png|webp)[^"']*)["']/gi;
  let im: RegExpExecArray | null;
  while ((im = imgRe.exec(articleHtml)) !== null) push(im[1]);

  return out;
}

function extractGoogleNewsPublisherUrl(html: string): string | null {
  const decoded = decodeEntities(html);
  const patterns = [
    /<a[^>]+href=["'](https?:\/\/(?!news\.google\.com)[^"']+)["'][^>]*>/i,
    /"(https?:\/\/(?!news\.google\.com)[^"]+)"/i,
    /'(https?:\/\/(?!news\.google\.com)[^']+)'/i,
  ];
  for (const pattern of patterns) {
    const m = decoded.match(pattern);
    if (!m?.[1]) continue;
    try {
      const safe = assertSafeHttpUrl(m[1]);
      if (!/google\./i.test(new URL(safe).hostname)) return safe;
    } catch { /* ignore unsafe candidate */ }
  }
  return null;
}

async function fetchArticleHtml(pageUrl: string): Promise<{ html: string; finalUrl: string } | null> {
  const safePageUrl = assertSafeHttpUrl(pageUrl);
  const r = await fetch(safePageUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; NewsFlow/1.0)" },
    redirect: "follow",
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) return null;
  return { html: await r.text(), finalUrl: r.url || safePageUrl };
}

async function findArticleImage(pageUrl: string): Promise<string | null> {
  try {
    let page = await fetchArticleHtml(pageUrl);
    if (!page) return null;

    if (/^https?:\/\/news\.google\.com\//i.test(page.finalUrl)) {
      const publisherUrl = extractGoogleNewsPublisherUrl(page.html);
      if (publisherUrl) {
        const publisherPage = await fetchArticleHtml(publisherUrl);
        if (publisherPage) page = publisherPage;
      }
    }

    const origin = new URL(page.finalUrl).origin;
    const candidates = extractAllCandidates(page.html)
      .map(u => u.startsWith("//") ? "https:" + u : u.startsWith("/") ? origin + u : u)
      .filter(u => /^https?:\/\//i.test(u))
      .filter(u => {
        try { assertSafeHttpUrl(u); return true; } catch { return false; }
      })
      .filter(u => !isLikelyLogo(u));
    return candidates[0] || null;
  } catch { return null; }
}

async function resolveArticleUrl(pageUrl: string): Promise<string> {
  try {
    if (!isGoogleNewsUrl(pageUrl)) return assertSafeHttpUrl(pageUrl);
    const page = await fetchArticleHtml(pageUrl);
    if (!page) return assertSafeHttpUrl(pageUrl);
    const publisherUrl = extractGoogleNewsPublisherUrl(page.html);
    return publisherUrl || assertSafeHttpUrl(page.finalUrl || pageUrl);
  } catch {
    return pageUrl;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const body = await req.json().catch(() => ({} as any));
    const force = !!body?.force;
    const sourceId: string | null = body?.source_id || null;
    const validateUrl: string | null = body?.validate_url || null;
    let userId: string | null = body?.user_id || null;

    // Modo validação de URL: testa se a URL retorna feed RSS válido (sem persistir nada)
    if (validateUrl) {
      try {
        const xml = await fetchXmlSmart(validateUrl);
        const items = parseRss(xml);
        if (items.length === 0) {
          return new Response(JSON.stringify({ valid: false, error: "Nenhum item encontrado no feed" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
        return new Response(JSON.stringify({ valid: true, items_count: items.length, sample_title: items[0]?.title || null }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e) {
        return new Response(JSON.stringify({ valid: false, error: e instanceof Error ? e.message : "Falha ao buscar feed" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
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
    }

    let sourcesQuery = supabase.from("news_sources").select("*").eq("active", true).eq("user_id", userId);
    if (sourceId) sourcesQuery = sourcesQuery.eq("id", sourceId);
    const { data: allSources } = await sourcesQuery;
    const now = Date.now();
    const sources = (allSources || []).filter((s: any) => {
      if (force) return true;
      if (!s.last_fetched_at) return true;
      const elapsedMin = (now - new Date(s.last_fetched_at).getTime()) / 60000;
      return elapsedMin >= (s.fetch_interval_minutes || 60);
    });

    // Perfis de scoring por nicho
    const PROFILES: Record<string, { hot: string[]; noise: string[]; minScore: number; maxAgeH: number }> = {
      financas: {
        hot: ["bitcoin","btc","ethereum","eth","cripto","crypto","blockchain","binance","coinbase",
          "bolsa","ibovespa","dólar","dolar","inflação","selic","copom","pib","mercado","ação","ações",
          "fed","powell","trump","biden","lula","banco central","tesouro","investimento",
          "bilhão","bilhões","milhão","milhões","trilhão","recorde","alta","queda","disparou","dispara","despenca",
          "exclusivo","urgente","breaking","ao vivo"],
        noise: ["horóscopo","celebridade","fofoca","bbb","novela","reality"],
        minScore: 3, maxAgeH: 12,
      },
      fofoca: {
        hot: ["virginia","zé felipe","neymar","biancardi","anitta","bbb","reality","famoso","famosa",
          "celebridade","fofoca","polêmica","viralizou","viral","exclusivo","flagra","flagrado","flagrada",
          "romance","affair","namoro","casamento","separação","divórcio","traição","beijo","look","barraco",
          "treta","desabafa","desabafou","revela","revelou","chocou","chocante","luto","morre","morreu",
          "harry","meghan","realeza","novela","sbt","globo","record","big brother","fazenda"],
        noise: ["bitcoin","selic","copom","ibovespa","fed","powell","pib","banco central"],
        minScore: 1, maxAgeH: 24,
      },
    };
    function getProfile(niche?: string | null) {
      const n = (niche || "").toLowerCase();
      if (/(fofoca|celebr|entreten|famosos|tv|novela|reality)/.test(n)) return PROFILES.fofoca;
      return PROFILES.financas;
    }
    function relevanceScore(title: string, desc: string, pubDate: string | undefined, profile: typeof PROFILES.financas): number {
      const text = `${title} ${desc}`.toLowerCase();
      let score = 0;
      for (const k of profile.hot) if (text.includes(k)) score += 2;
      for (const k of profile.noise) if (text.includes(k)) score -= 5;
      if (/\d+%|\$\s?\d|r\$\s?\d|\d+\s?(mil|milh|bilh|trilh)/i.test(text)) score += 2;
      if (title.length >= 30 && title.length <= 110) score += 1;
      if (pubDate) {
        const ageH = (Date.now() - new Date(pubDate).getTime()) / 3600000;
        if (ageH < 2) score += 5;
        else if (ageH < 6) score += 3;
        else if (ageH < 12) score += 1;
        else if (ageH > 24) score -= 3;
      } else {
        // Sem pubDate: assume "recente" pra não descartar (muitos feeds de fofoca não enviam pubDate)
        score += 1;
      }
      return score;
    }
    const PER_SOURCE_LIMIT = 5;

    let totalNew = 0;
    for (const s of (sources || [])) {
      try {
        // Busca IGs vinculados a esta fonte
        const { data: links } = await supabase
          .from("news_source_instagram_accounts")
          .select("instagram_account_id")
          .eq("source_id", s.id);
        const linkedIgIds: (string | null)[] = (links || []).map((l: any) => l.instagram_account_id);
        // Se a fonte não tem IG vinculado (legado), insere 1 cópia com NULL (comportamento antigo)
        const targetIgs: (string | null)[] = linkedIgIds.length > 0 ? linkedIgIds : [null];

        const profile = getProfile(s.niche);
        const xml = await fetchXmlSmart(s.url);
        let items: any[] = parseRss(xml)
          .filter((it: any) => {
            if (!it.pubDate) return true; // aceita sem pubDate
            const ageH = (Date.now() - new Date(it.pubDate).getTime()) / 3600000;
            return ageH <= profile.maxAgeH;
          })
          .map((it: any) => ({ ...it, _score: relevanceScore(it.title, it.description || "", it.pubDate, profile) }))
          .filter((it: any) => it._score >= profile.minScore)
          .sort((a: any, b: any) => b._score - a._score)
          .slice(0, PER_SOURCE_LIMIT);
        for (const it of items) {
          // dedupe por URL — verifica para CADA IG separadamente
          let img = it.image as string | null;
          const articleUrl = await resolveArticleUrl(it.link);
          const articleImg = isGoogleNewsUrl(it.link) ? await findArticleImage(it.link) : null;
          if (articleImg && !isLikelyLogo(articleImg)) {
            img = articleImg;
          } else {
            if (img && isLikelyLogo(img)) img = null;
            if (!img) img = await findArticleImage(it.link);
          }

          for (const igId of targetIgs) {
            // dedupe: mesma URL + mesmo IG
            const findDuplicate = async (url: string) => {
              const dupQuery = supabase.from("news_items").select("id, original_image_url, original_url").eq("user_id", userId).eq("original_url", url);
              return igId
                ? await dupQuery.eq("instagram_account_id", igId).maybeSingle()
                : await dupQuery.is("instagram_account_id", null).maybeSingle();
            };

            let { data: dupUrl } = await findDuplicate(articleUrl);
            if (!dupUrl && articleUrl !== it.link) {
              const fallbackDup = await findDuplicate(it.link);
              dupUrl = fallbackDup.data;
            }
            if (dupUrl) {
              const updates: Record<string, string> = {};
              if (!dupUrl.original_image_url && img) updates.original_image_url = img;
              if (articleUrl !== it.link && dupUrl.original_url === it.link) updates.original_url = articleUrl;
              if (Object.keys(updates).length > 0) {
                await supabase.from("news_items").update(updates).eq("id", dupUrl.id);
              }
              continue;
            }

            const { error } = await supabase.from("news_items").insert({
              user_id: userId, source_id: s.id, source_name: s.name,
              instagram_account_id: igId,
              original_title: it.title, original_content: it.description,
              original_url: articleUrl, original_image_url: img || null,
              published_at: it.pubDate ? new Date(it.pubDate).toISOString() : null,
              niche: s.niche, status: "pending",
            });
            if (!error) totalNew++;
          }
        }
        await supabase.from("news_sources").update({ last_fetched_at: new Date().toISOString() }).eq("id", s.id);
      } catch (e) {
        console.error("source error", s.url, e);
      }
    }
    await supabase.from("activity_logs").insert({ user_id: userId, action: "fetch_rss", details: { fetched: totalNew, sources: sources?.length || 0 } });
    return new Response(JSON.stringify({ fetched: totalNew }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
