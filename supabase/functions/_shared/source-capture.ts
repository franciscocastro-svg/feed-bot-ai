export type SourceKind = "rss" | "site" | "url" | "person" | "topic" | "google_news";

export type SourceLike = {
  id?: string;
  name?: string;
  url?: string | null;
  niche?: string | null;
  source_kind?: SourceKind | null;
  query?: string | null;
  include_terms?: string[] | null;
  exclude_terms?: string[] | null;
  country?: string | null;
  language?: string | null;
  source_config?: Record<string, unknown> | null;
};

export type ParsedSourceItem = {
  title: string;
  link: string;
  description?: string;
  pubDate?: string;
  image?: string | null;
  sourceType?: "rss" | "atom" | "html";
  _htmlListing?: boolean;
  _score?: number;
};

export type SourceDiagnostics = {
  parse_type: "rss" | "atom" | "html" | "none";
  items_found: number;
  items_after_freshness: number;
  items_after_relevance: number;
  items_duplicates: number;
  items_without_image: number;
  items_created: number;
  filtered_old: number;
  filtered_low_score: number;
  filtered_excluded_terms: number;
  filtered_missing_required_terms: number;
  warnings: string[];
};

export function createDiagnostics(parseType: SourceDiagnostics["parse_type"] = "none"): SourceDiagnostics {
  return {
    parse_type: parseType,
    items_found: 0,
    items_after_freshness: 0,
    items_after_relevance: 0,
    items_duplicates: 0,
    items_without_image: 0,
    items_created: 0,
    filtered_old: 0,
    filtered_low_score: 0,
    filtered_excluded_terms: 0,
    filtered_missing_required_terms: 0,
    warnings: [],
  };
}

export function isPrivateHostname(hostname: string): boolean {
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

export function assertSafeHttpUrl(raw: string): string {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("URL precisa usar http ou https");
  if (isPrivateHostname(url.hostname)) throw new Error("URL privada/local não permitida");
  url.username = "";
  url.password = "";
  return url.toString();
}

export function decodeEntities(s: string): string {
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

export function stripHtml(html: string): string {
  return decodeEntities(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function timeoutSignal(timeoutMs: number): AbortSignal {
  if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(timeoutMs);
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

export async function fetchTextSmart(url: string, timeoutMs = 15000): Promise<{ text: string; finalUrl: string; contentType: string }> {
  const safeUrl = assertSafeHttpUrl(url);
  const res = await fetch(safeUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; FluxFeed/1.0)",
      "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.7",
    },
    redirect: "follow",
    signal: timeoutSignal(timeoutMs),
  });
  if (!res.ok) throw new Error(`Fonte respondeu HTTP ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") || "";
  let charset = (contentType.match(/charset=([^;]+)/i)?.[1] || "").trim().toLowerCase();
  if (!charset) {
    const head = new TextDecoder("ascii").decode(buf.slice(0, 300));
    const m = head.match(/encoding=["']([^"']+)["']/i);
    if (m) charset = m[1].toLowerCase();
  }
  if (!charset) charset = "utf-8";
  if (charset === "iso-8859-1" || charset === "latin1" || charset === "iso8859-1") charset = "windows-1252";
  try {
    return { text: new TextDecoder(charset, { fatal: false }).decode(buf), finalUrl: res.url || safeUrl, contentType };
  } catch {
    return { text: new TextDecoder("utf-8", { fatal: false }).decode(buf), finalUrl: res.url || safeUrl, contentType };
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getTagRaw(block: string, tag: string): string {
  const escaped = escapeRegExp(tag);
  const m = block.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, "i"));
  if (!m) return "";
  return decodeEntities(decodeEntities(m[1].replace(/<!\[CDATA\[|\]\]>/g, "")));
}

function getTagText(block: string, tag: string): string {
  return stripHtml(getTagRaw(block, tag));
}

function firstTagText(block: string, tags: string[]): string {
  for (const tag of tags) {
    const value = getTagText(block, tag);
    if (value) return value;
  }
  return "";
}

function firstTagRaw(block: string, tags: string[]): string {
  for (const tag of tags) {
    const value = getTagRaw(block, tag);
    if (value) return value;
  }
  return "";
}

function extractMediaImage(block: string, htmlHints: string[]): string | null {
  const patterns = [
    /<enclosure[^>]*url=["']([^"']+)["'][^>]*(?:type=["']image\/[^"']+["'])?[^>]*>/i,
    /<media:content[^>]*url=["']([^"']+)["']/i,
    /<media:thumbnail[^>]*url=["']([^"']+)["']/i,
    /<itunes:image[^>]*href=["']([^"']+)["']/i,
  ];
  for (const pattern of patterns) {
    const m = block.match(pattern);
    if (m?.[1]) return decodeEntities(m[1]);
  }
  for (const hint of htmlHints) {
    const img = hint.match(/<img[^>]*src=["']([^"']+)["']/i);
    if (img?.[1]) return decodeEntities(img[1]);
  }
  return null;
}

export function parseRssItems(xml: string): ParsedSourceItem[] {
  const items: ParsedSourceItem[] = [];
  const matches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const block of matches) {
    const title = firstTagText(block, ["title"]);
    const link = firstTagText(block, ["link"]) || firstTagText(block, ["guid"]);
    const description = firstTagText(block, ["description", "content:encoded", "summary"]);
    const rawDescription = firstTagRaw(block, ["description", "content:encoded"]);
    const pubDate = firstTagText(block, ["pubDate", "dc:date", "published", "updated"]);
    const image = extractMediaImage(block, [rawDescription]);
    if (title && link) items.push({ title, link, description, pubDate, image, sourceType: "rss" });
  }
  return items;
}

export function parseAtomItems(xml: string): ParsedSourceItem[] {
  const items: ParsedSourceItem[] = [];
  const matches = xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  for (const block of matches) {
    const title = firstTagText(block, ["title"]);
    const hrefLink =
      block.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?>/i)?.[1] ||
      block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i)?.[1] ||
      "";
    const link = decodeEntities(hrefLink) || firstTagText(block, ["id"]);
    const rawContent = firstTagRaw(block, ["content", "summary"]);
    const description = stripHtml(rawContent);
    const pubDate = firstTagText(block, ["published", "updated", "dc:date"]);
    const image = extractMediaImage(block, [rawContent]);
    if (title && link) items.push({ title, link, description, pubDate, image, sourceType: "atom" });
  }
  return items;
}

function toAbsoluteUrl(raw: string, baseUrl: string): string | null {
  try {
    const decoded = decodeEntities(raw).replace(/\\u0026/g, "&").trim();
    const url = new URL(decoded, baseUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.hash = "";
    return assertSafeHttpUrl(url.toString());
  } catch {
    return null;
  }
}

function rootishHost(hostname: string): string {
  const parts = hostname.toLowerCase().replace(/^www\./, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  const last3 = parts.slice(-3).join(".");
  if (/\.(com|net|org|gov|edu)\.br$/.test(last3)) return last3;
  return parts.slice(-2).join(".");
}

function samePublisher(candidate: string, baseUrl: string): boolean {
  try {
    const a = new URL(candidate);
    const b = new URL(baseUrl);
    return rootishHost(a.hostname) === rootishHost(b.hostname);
  } catch {
    return false;
  }
}

function parseBrazilianDate(text: string): string | undefined {
  const m = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s*(?:as|às|-|,)?\s*(\d{1,2})[:h](\d{2}))?/i);
  if (!m) return undefined;
  const [, d, mo, y, h = "0", min = "0"] = m;
  const iso = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}T${h.padStart(2, "0")}:${min.padStart(2, "0")}:00-03:00`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function sanitizeListingTitle(text: string): string {
  return decodeEntities(String(text || ""))
    .replace(/\s+-\s+UOL$/i, "")
    .replace(/\s+\d{1,2}\/\d{1,2}\/\d{4}(?:\s*(?:as|às|-|,)?\s*\d{1,2}[:h]\d{2})?\s*$/i, "")
    .replace(/\s+\d{1,2}[:h]\d{2}\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function looksLikeArticleUrl(url: string, baseUrl: string): boolean {
  try {
    const u = new URL(url);
    const base = new URL(baseUrl);
    const path = u.pathname.toLowerCase();
    if (u.toString() === base.toString()) return false;
    if (path === "/" || path === base.pathname.toLowerCase()) return false;
    if (/(login|assine|checkout|newsletter|politica-de-privacidade|termos|publicidade|minha-conta|rss|feed|xml|tag|autor)/i.test(path)) return false;
    if (/\.(css|js|json|xml|png|jpe?g|webp|gif|svg|pdf|mp4|mp3|zip)$/i.test(path)) return false;
    if (/\d{4}\/\d{2}\/\d{2}|\/noticias?\/|\/news\/|\/materias?\/|\/posts?\/|\.html?$|\.shtml$|\/\d+\//i.test(path)) return true;
    const baseFirstSegment = base.pathname.split("/").filter(Boolean)[0];
    return !!baseFirstSegment && path.includes(`/${baseFirstSegment}/`) && path.split("/").filter(Boolean).length >= 3;
  } catch {
    return false;
  }
}

export function parseHtmlListing(html: string, pageUrl: string): ParsedSourceItem[] {
  const items: ParsedSourceItem[] = [];
  const seen = new Set<string>();
  const anchorRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;

  while ((match = anchorRe.exec(html)) !== null) {
    const link = toAbsoluteUrl(match[1], pageUrl);
    if (!link || seen.has(link)) continue;
    if (!samePublisher(link, pageUrl)) continue;
    if (!looksLikeArticleUrl(link, pageUrl)) continue;

    const nearby = html.slice(Math.max(0, match.index - 900), Math.min(html.length, anchorRe.lastIndex + 1200));
    const title = sanitizeListingTitle(stripHtml(match[2]));
    if (title.length < 18 || title.length > 180) continue;
    if (/(assine|login|menu|newsletter|publicidade|compartilhe|veja também|mais lidas)/i.test(title)) continue;

    const pubDate = parseBrazilianDate(nearby);
    seen.add(link);
    items.push({ title, link, description: title, pubDate, image: null, sourceType: "html", _htmlListing: true });
  }

  return items;
}

export function parseSourceItems(raw: string, sourceUrl: string): { items: ParsedSourceItem[]; parseType: SourceDiagnostics["parse_type"] } {
  const rssItems = parseRssItems(raw);
  if (rssItems.length > 0) return { items: rssItems, parseType: "rss" };
  const atomItems = parseAtomItems(raw);
  if (atomItems.length > 0) return { items: atomItems, parseType: "atom" };
  const htmlItems = parseHtmlListing(raw, sourceUrl);
  if (htmlItems.length > 0) return { items: htmlItems, parseType: "html" };
  return { items: [], parseType: "none" };
}

export function discoverFeedCandidates(html: string, pageUrl: string): string[] {
  const candidates = new Set<string>();
  const alternateRe = /<link\b[^>]*(?:type=["']application\/(?:rss|atom)\+xml["'][^>]*href=["']([^"']+)["']|href=["']([^"']+)["'][^>]*type=["']application\/(?:rss|atom)\+xml["'])[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = alternateRe.exec(html)) !== null) {
    const absolute = toAbsoluteUrl(match[1] || match[2], pageUrl);
    if (absolute) candidates.add(absolute);
  }
  try {
    const origin = new URL(pageUrl).origin;
    ["/feed/", "/feed", "/rss", "/rss.xml", "/atom.xml", "/index.xml"].forEach((path) => {
      const absolute = toAbsoluteUrl(path, origin);
      if (absolute) candidates.add(absolute);
    });
  } catch {
    // ignore
  }
  return Array.from(candidates).slice(0, 10);
}

export function normalizeTerms(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(String).map((x) => x.trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(/[,\n;]/).map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

export function inferSourceKind(source: SourceLike): SourceKind {
  if (source.source_kind) return source.source_kind;
  const niche = String(source.niche || "");
  const url = String(source.url || "");
  if (/^Pessoa:/i.test(niche)) return "person";
  if (/^Tema:/i.test(niche)) return "topic";
  if (/^URL:/i.test(niche)) return "url";
  if (/news\.google\.com\/rss\/search/i.test(url)) return "google_news";
  if (/^RSS:/i.test(niche)) return "rss";
  return "rss";
}

export function extractLegacyQuery(source: SourceLike): string {
  const explicit = String(source.query || "").trim();
  if (explicit) return explicit;
  const niche = String(source.niche || "");
  const cleaned = niche.replace(/^(Pessoa|Tema|URL|RSS):\s*/i, "").split("|")[0].trim();
  if (cleaned) return cleaned;
  return "";
}

function quoteSearchTerm(term: string, force = false): string {
  const clean = term.trim();
  if (!clean) return "";
  if (/^".+"$/.test(clean)) return clean;
  return force || /\s/.test(clean) ? `"${clean}"` : clean;
}

export function buildGoogleNewsSearchUrl(query: string, country = "BR", language = "pt-BR"): string {
  const hl = language || "pt-BR";
  const gl = (country || "BR").toUpperCase();
  const ceidLang = gl === "BR" ? "pt-419" : hl.split("-")[0] || "en";
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query.trim())}&hl=${encodeURIComponent(hl)}&gl=${encodeURIComponent(gl)}&ceid=${encodeURIComponent(`${gl}:${ceidLang}`)}`;
}

export function buildSearchQuery(source: SourceLike): string {
  const kind = inferSourceKind(source);
  const base = extractLegacyQuery(source);
  const includeTerms = normalizeTerms(source.include_terms);
  const excludeTerms = normalizeTerms(source.exclude_terms);
  const pieces: string[] = [];
  if (base) pieces.push(kind === "person" ? quoteSearchTerm(base, true) : base);
  includeTerms.forEach((term) => pieces.push(quoteSearchTerm(term)));
  excludeTerms.forEach((term) => pieces.push(`-${quoteSearchTerm(term)}`));
  return pieces.join(" ").replace(/\s+/g, " ").trim();
}

export function buildSourceFetchUrl(source: SourceLike): string {
  const kind = inferSourceKind(source);
  if (kind === "person" || kind === "topic" || kind === "google_news") {
    const query = buildSearchQuery(source);
    if (!query) throw new Error("Fonte precisa de uma busca");
    return buildGoogleNewsSearchUrl(query, source.country || "BR", source.language || "pt-BR");
  }
  const url = String(source.url || "").trim();
  if (!url) throw new Error("Fonte precisa de uma URL");
  return assertSafeHttpUrl(url);
}

type RelevanceProfile = { hot: string[]; noise: string[]; minScore: number; maxAgeH: number };

const PROFILES: Record<string, RelevanceProfile> = {
  geral: {
    hot: ["urgente", "exclusivo", "ao vivo", "breaking", "revela", "anuncia"],
    noise: [],
    minScore: 0,
    maxAgeH: 24,
  },
  financas: {
    hot: ["bitcoin", "btc", "ethereum", "eth", "cripto", "bolsa", "ibovespa", "dolar", "dólar", "selic", "mercado", "fed", "banco central", "alta", "queda"],
    noise: ["horoscopo", "horóscopo", "celebridade", "fofoca", "bbb", "novela"],
    minScore: 3,
    maxAgeH: 12,
  },
  fofoca: {
    hot: ["famoso", "famosa", "celebridade", "influencer", "fofoca", "polêmica", "polemica", "viral", "flagra", "romance", "namoro", "separação", "separacao", "bbb", "reality", "novela"],
    noise: ["bitcoin", "selic", "ibovespa", "banco central"],
    minScore: 1,
    maxAgeH: 24,
  },
  esportes: {
    hot: ["futebol", "campeonato", "copa", "brasileirão", "brasileirao", "libertadores", "gol", "jogo", "vitória", "vitoria", "derrota", "contratação", "contratacao"],
    noise: ["selic", "ibovespa", "novela"],
    minScore: 1,
    maxAgeH: 24,
  },
  tecnologia: {
    hot: ["tecnologia", "inteligencia artificial", "inteligência artificial", "software", "aplicativo", "startup", "google", "apple", "microsoft", "meta", "openai", "android", "iphone"],
    noise: ["novela", "reality", "horóscopo", "horoscopo"],
    minScore: 1,
    maxAgeH: 24,
  },
  politica: {
    hot: ["governo", "congresso", "senado", "camara", "câmara", "presidente", "ministro", "eleição", "eleicao", "política", "politica", "stf", "planalto"],
    noise: ["novela", "reality", "horóscopo", "horoscopo"],
    minScore: 1,
    maxAgeH: 24,
  },
  saude: {
    hot: ["saúde", "saude", "medicina", "hospital", "doença", "doenca", "tratamento", "vacina", "pesquisa", "anvisa", "sus", "nutrição", "nutricao"],
    noise: ["novela", "reality", "ibovespa"],
    minScore: 1,
    maxAgeH: 48,
  },
};

function normalizedText(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function getProfile(source: SourceLike): RelevanceProfile {
  const text = normalizedText(`${source.niche || ""} ${source.name || ""} ${extractLegacyQuery(source)}`);
  if (/(fofoca|celebr|entreten|famosos|tv|novela|reality)/.test(text)) return PROFILES.fofoca;
  if (/(finan|econom|mercado|invest|cripto|bolsa)/.test(text)) return PROFILES.financas;
  if (/(esporte|futebol|copa|campeonato|atleta)/.test(text)) return PROFILES.esportes;
  if (/(tecnolog|inova|startup|software|inteligencia artificial|\bia\b)/.test(text)) return PROFILES.tecnologia;
  if (/(politica|governo|eleicao)/.test(text)) return PROFILES.politica;
  if (/(saude|medicina|bem-estar|nutri)/.test(text)) return PROFILES.saude;
  return PROFILES.geral;
}

function isSearchSource(source: SourceLike): boolean {
  const kind = inferSourceKind(source);
  return kind === "person" || kind === "topic" || kind === "google_news";
}

function freshnessWindowHours(source: SourceLike, profile: RelevanceProfile): number {
  const configured = Number(source.source_config?.max_age_hours);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return isSearchSource(source) ? Math.max(profile.maxAgeH, 168) : profile.maxAgeH;
}

function relevanceScore(item: ParsedSourceItem, profile: RelevanceProfile): number {
  const text = normalizedText(`${item.title} ${item.description || ""}`);
  let score = 0;
  for (const k of profile.hot) if (text.includes(normalizedText(k))) score += 2;
  for (const k of profile.noise) if (text.includes(normalizedText(k))) score -= 5;
  if (/\d+%|\$\s?\d|r\$\s?\d|\d+\s?(mil|milh|bilh|trilh)/i.test(text)) score += 2;
  if (item.title.length >= 30 && item.title.length <= 120) score += 1;
  if (item.pubDate) {
    const ageH = (Date.now() - new Date(item.pubDate).getTime()) / 3600000;
    if (ageH < 2) score += 5;
    else if (ageH < 6) score += 3;
    else if (ageH < 12) score += 1;
    else if (ageH > 24) score -= 3;
  } else {
    score += 1;
  }
  return score;
}

export function filterItemsForSource(
  items: ParsedSourceItem[],
  source: SourceLike,
  parseType: SourceDiagnostics["parse_type"],
  limit = 5,
): { items: ParsedSourceItem[]; diagnostics: SourceDiagnostics } {
  const diagnostics = createDiagnostics(parseType);
  const profile = getProfile(source);
  const includeTerms = normalizeTerms(source.include_terms).map(normalizedText);
  const excludeTerms = normalizeTerms(source.exclude_terms).map(normalizedText);
  const searchSource = isSearchSource(source);
  const maxAgeH = freshnessWindowHours(source, profile);
  const minScore = searchSource ? Math.min(profile.minScore, 0) : profile.minScore;
  diagnostics.items_found = items.length;

  const fresh = items.filter((item) => {
    if (!item.pubDate) return true;
    const ageH = (Date.now() - new Date(item.pubDate).getTime()) / 3600000;
    const keep = Number.isNaN(ageH) || ageH <= maxAgeH;
    if (!keep) diagnostics.filtered_old++;
    return keep;
  });
  diagnostics.items_after_freshness = fresh.length;

  const relevant: ParsedSourceItem[] = [];
  for (const item of fresh) {
    const text = normalizedText(`${item.title} ${item.description || ""}`);
    if (excludeTerms.some((term) => term && text.includes(term))) {
      diagnostics.filtered_excluded_terms++;
      continue;
    }
    const matchesFocusTerm = includeTerms.some((term) => term && text.includes(term));
    if (!searchSource && includeTerms.length > 0 && !matchesFocusTerm) {
      diagnostics.filtered_missing_required_terms++;
      continue;
    }
    const score = relevanceScore(item, profile) + (matchesFocusTerm ? 3 : 0);
    if (score < minScore) {
      diagnostics.filtered_low_score++;
      continue;
    }
    relevant.push({ ...item, _score: score });
  }

  const sorted = relevant.sort((a, b) => (b._score || 0) - (a._score || 0)).slice(0, limit);
  diagnostics.items_after_relevance = sorted.length;
  if (items.length === 0) diagnostics.warnings.push("Nenhum item encontrado no feed ou na página.");
  if (items.length > 0 && sorted.length === 0) {
    if (diagnostics.items_after_freshness === 0) {
      diagnostics.warnings.push(`A fonte respondeu, mas os itens estavam fora da janela de data (${Math.round(maxAgeH / 24)} dias).`);
    } else if (diagnostics.filtered_missing_required_terms > 0) {
      diagnostics.warnings.push("A fonte respondeu, mas os itens não continham os termos obrigatórios.");
    } else if (diagnostics.filtered_excluded_terms > 0) {
      diagnostics.warnings.push("A fonte respondeu, mas os itens foram bloqueados pelos termos proibidos.");
    } else {
      diagnostics.warnings.push("A fonte respondeu, mas todos os itens foram filtrados por relevância.");
    }
  }
  return { items: sorted, diagnostics };
}

export function isLikelyLogo(url: string): boolean {
  const u = url.toLowerCase();
  if (/(logo|brand|sprite|icon|favicon|placeholder|default|avatar|share|social|watermark|selo|header|nav|footer)/i.test(u)) return true;
  if (/news\.google\.com|ssl\.gstatic\.com\/news|gstatic\.com\/images\/branding/i.test(u)) return true;
  if (/\.svg(\?|$)/i.test(u)) return true;
  const m = u.match(/[?&](?:w|width|h|height)=(\d+)/);
  if (m && parseInt(m[1], 10) < 300) return true;
  return false;
}

export function isGoogleNewsUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "news.google.com";
  } catch {
    return false;
  }
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

export function decodeGoogleNewsArticleUrl(rawUrl: string): string | null {
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

function extractAllCandidates(html: string): string[] {
  const out: string[] = [];
  const push = (u?: string | null) => {
    if (u && typeof u === "string" && !out.includes(u)) out.push(u);
  };
  const pushImageValue = (value: unknown) => {
    if (!value) return;
    if (typeof value === "string") return push(value);
    if (Array.isArray(value)) return value.forEach(pushImageValue);
    if (typeof value === "object") {
      const obj = value as Record<string, unknown>;
      push(String(obj.url || ""));
      push(String(obj.contentUrl || ""));
      push(String(obj.thumbnailUrl || ""));
      push(String(obj["@id"] || ""));
    }
  };
  const pushSrcset = (srcset?: string | null) => {
    if (!srcset) return;
    for (const part of srcset.split(",")) push(part.trim().split(/\s+/)[0]);
  };

  const jsonldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let jm: RegExpExecArray | null;
  while ((jm = jsonldRe.exec(html)) !== null) {
    try {
      const data = JSON.parse(jm[1].trim());
      const nodes = Array.isArray(data) ? data : ((data["@graph"] || [data]) as unknown[]);
      for (const node of nodes) {
        const n = node as Record<string, unknown>;
        pushImageValue(n?.image);
        pushImageValue(n?.thumbnailUrl);
        pushImageValue(n?.primaryImageOfPage);
      }
    } catch {
      // ignore malformed JSON-LD
    }
  }

  const articleMatch = html.match(/<article[\s\S]*?<\/article>/i);
  const articleHtml = articleMatch ? articleMatch[0] : html;
  const figRe = /<figure[\s\S]*?<img[^>]+(?:src|data-src|data-original|data-lazy-src|data-original-src|data-img-src)=["']([^"']+)["']/gi;
  let fm: RegExpExecArray | null;
  while ((fm = figRe.exec(articleHtml)) !== null) push(fm[1]);

  const ogPatterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/gi,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/gi,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/gi,
  ];
  for (const pattern of ogPatterns) {
    let om: RegExpExecArray | null;
    while ((om = pattern.exec(html)) !== null) push(om[1]);
  }

  const srcsetRe = /<(?:img|source)[^>]+(?:srcset|data-srcset)=["']([^"']+)["']/gi;
  let sm: RegExpExecArray | null;
  while ((sm = srcsetRe.exec(articleHtml)) !== null) pushSrcset(sm[1]);

  const imgRe = /<img[^>]+(?:src|data-src|data-original|data-lazy-src|data-original-src|data-img-src)=["']([^"']+\.(?:jpe?g|png|webp)[^"']*)["']/gi;
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
    } catch {
      // ignore unsafe candidate
    }
  }
  return null;
}

async function fetchArticleHtml(pageUrl: string): Promise<{ html: string; finalUrl: string } | null> {
  const page = await fetchTextSmart(pageUrl, 15000);
  return { html: page.text, finalUrl: page.finalUrl };
}

export async function findArticleImage(pageUrl: string): Promise<string | null> {
  try {
    const decodedArticleUrl = decodeGoogleNewsArticleUrl(pageUrl);
    let page = await fetchArticleHtml(decodedArticleUrl || pageUrl);
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
      .map((u) => (u.startsWith("//") ? "https:" + u : u.startsWith("/") ? origin + u : u))
      .filter((u) => /^https?:\/\//i.test(u))
      .filter((u) => {
        try {
          assertSafeHttpUrl(u);
          return true;
        } catch {
          return false;
        }
      })
      .filter((u) => !isLikelyLogo(u));
    return candidates[0] || null;
  } catch {
    return null;
  }
}

export async function resolveArticleUrl(pageUrl: string): Promise<string> {
  try {
    if (!isGoogleNewsUrl(pageUrl)) return assertSafeHttpUrl(pageUrl);
    const decodedArticleUrl = decodeGoogleNewsArticleUrl(pageUrl);
    if (decodedArticleUrl) return decodedArticleUrl;
    const page = await fetchArticleHtml(pageUrl);
    if (!page) return assertSafeHttpUrl(pageUrl);
    const publisherUrl = extractGoogleNewsPublisherUrl(page.html);
    return publisherUrl || assertSafeHttpUrl(page.finalUrl || pageUrl);
  } catch {
    return pageUrl;
  }
}

export function canonicalizeArticleUrl(raw: string): string {
  try {
    const url = new URL(assertSafeHttpUrl(raw));
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    const removable = [
      "fbclid",
      "gclid",
      "dclid",
      "msclkid",
      "igshid",
      "mc_cid",
      "mc_eid",
      "ref",
      "ref_src",
      "cmpid",
    ];
    for (const key of Array.from(url.searchParams.keys())) {
      if (/^utm_/i.test(key) || removable.includes(key.toLowerCase())) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return raw;
  }
}

export function buildPreviewItems(items: ParsedSourceItem[]) {
  return items.map((item) => ({
    title: item.title,
    url: item.link,
    description: item.description || null,
    published_at: item.pubDate || null,
    image: item.image || null,
    score: item._score || 0,
    source_type: item.sourceType || null,
  }));
}

export async function previewSource(source: SourceLike, limit = 5) {
  const url = buildSourceFetchUrl(source);
  const raw = await fetchTextSmart(url);
  const parsed = parseSourceItems(raw.text, raw.finalUrl || url);
  const filtered = filterItemsForSource(parsed.items, { ...source, url }, parsed.parseType, limit);
  const feedCandidates = parsed.parseType === "html" || parsed.parseType === "none"
    ? discoverFeedCandidates(raw.text, raw.finalUrl || url)
    : [];

  if (filtered.items.length === 0 && feedCandidates.length > 0) {
    for (const candidate of feedCandidates.slice(0, 5)) {
      try {
        const candidateRaw = await fetchTextSmart(candidate);
        const candidateParsed = parseSourceItems(candidateRaw.text, candidateRaw.finalUrl || candidate);
        if (candidateParsed.parseType === "html" || candidateParsed.items.length === 0) continue;
        const candidateFiltered = filterItemsForSource(
          candidateParsed.items,
          { ...source, url: candidate },
          candidateParsed.parseType,
          limit,
        );
        if (candidateFiltered.items.length === 0) continue;
        candidateFiltered.diagnostics.warnings.push("Usei automaticamente um feed RSS encontrado na página informada.");
        return {
          valid: true,
          url: candidate,
          final_url: candidateRaw.finalUrl,
          parse_type: candidateParsed.parseType,
          items_count: candidateParsed.items.length,
          sample_items: buildPreviewItems(candidateFiltered.items),
          feed_candidates: feedCandidates,
          diagnostics: candidateFiltered.diagnostics,
        };
      } catch {
        // keep trying the next discovered feed candidate
      }
    }
  }

  const diagnostics = filtered.diagnostics;
  if (feedCandidates.length > 0) diagnostics.warnings.push("Esta página possui feeds RSS candidatos que podem ser mais estáveis.");
  return {
    valid: filtered.items.length > 0,
    url,
    final_url: raw.finalUrl,
    parse_type: parsed.parseType,
    items_count: parsed.items.length,
    sample_items: buildPreviewItems(filtered.items),
    feed_candidates: feedCandidates,
    diagnostics,
  };
}
