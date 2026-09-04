import fs from "node:fs";
import path from "node:path";

export const PIXABAY_LICENSE_URL = "https://pixabay.com/service/license-summary/";
export const STOCK_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
// v3: passou a bloquear domínios de rede social e a validar o download.
export const STOCK_CACHE_VERSION = "v3";
export const MIN_STOCK_RELEVANCE_SCORE = 10;

// Domínios que quase nunca entregam a imagem para o servidor (login, hotlink
// bloqueado, expiração de assinatura) — não adianta escolher e falhar depois.
export const BLOCKED_IMAGE_HOSTS = [
  "instagram.com", "cdninstagram.com", "fbcdn.net", "facebook.com",
  "tiktok.com", "tiktokcdn.com", "pinterest.com", "pinimg.com",
  "youtube.com", "youtu.be", "ytimg.com", "x.com", "twitter.com", "twimg.com",
];

export function isBlockedImageUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  let host = "";
  try {
    host = new URL(raw).hostname.toLocaleLowerCase("en-US");
  } catch {
    return false;
  }
  return BLOCKED_IMAGE_HOSTS.some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

const MAX_QUERY_CANDIDATES = 3;
const QUERY_STOP_WORDS = new Set([
  "a", "an", "and", "at", "by", "for", "from", "in", "into", "of", "on", "or",
  "photo", "photograph", "scene", "the", "to", "with",
]);
const ABSTRACT_VISUAL_TERMS = new Set([
  "abstract", "background", "business", "concept", "discipline", "entrepreneurship",
  "evolution", "faith", "future", "growth", "innovation", "motivation", "motivational",
  "strategy", "success", "technology",
]);
const GENERIC_STOCK_TERMS = new Set([
  "coffee", "computer", "cup", "desk", "keyboard", "laptop", "office", "workspace",
]);

function normalizedToken(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]/g, "");
}

function tokenize(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("en-US")
    .split(/[^a-z0-9]+/)
    .map(normalizedToken)
    .filter(Boolean);
}

function tokenStem(token) {
  if (token.length > 5 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith("s")) return token.slice(0, -1);
  return token;
}

function tokensAreRelated(left, right) {
  if (left === right) return true;
  const leftStem = tokenStem(left);
  const rightStem = tokenStem(right);
  if (leftStem === rightStem) return true;
  return leftStem.length >= 5
    && rightStem.length >= 5
    && (leftStem.startsWith(rightStem) || rightStem.startsWith(leftStem));
}

function meaningfulQueryTokens(query) {
  return Array.from(new Set(tokenize(query)))
    .filter((token) => !QUERY_STOP_WORDS.has(token) && !ABSTRACT_VISUAL_TERMS.has(token));
}

function hitVisualTokens(hit) {
  return Array.from(new Set([
    ...tokenize(hit?.tags),
    ...tokenize(hit?.pageURL),
  ]));
}

export function normalizeStockImageQuery(value) {
  const raw = String(value || "").normalize("NFKC").trim();
  if (!raw || raw.includes("@") || /^https?:/i.test(raw)) return null;
  const query = raw
    .replace(/[^\p{L}\p{N}\s,-]/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  if (!query) return null;
  return query;
}

export function normalizeStockImageQueries(query, queries = []) {
  const candidates = [query, ...(Array.isArray(queries) ? queries : [])];
  const seen = new Set();
  const normalized = [];
  for (const candidate of candidates) {
    const value = normalizeStockImageQuery(candidate);
    const key = value?.toLocaleLowerCase("en-US");
    if (!value || !key || seen.has(key)) continue;
    seen.add(key);
    normalized.push(value);
    if (normalized.length === MAX_QUERY_CANDIDATES) break;
  }
  return normalized;
}

export function buildPixabaySearchUrl(query, apiKey) {
  const url = new URL("https://pixabay.com/api/");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("q", query);
  url.searchParams.set("image_type", "photo");
  url.searchParams.set("orientation", "vertical");
  url.searchParams.set("safesearch", "true");
  url.searchParams.set("order", "popular");
  url.searchParams.set("per_page", "30");
  return url;
}

export const OPENVERSE_SEARCH_URL = "https://api.openverse.org/v1/images/";
export const GOOGLE_CSE_SEARCH_URL = "https://www.googleapis.com/customsearch/v1";
export const BING_IMAGE_SEARCH_URL = "https://api.bing.microsoft.com/v7.0/images/search";
export const SERPAPI_SEARCH_URL = "https://serpapi.com/search.json";
const WEB_PROVIDERS = new Set(["openverse", "google", "bing", "serpapi"]);
const MIN_WEB_IMAGE_WIDTH = 800;
const MIN_WEB_IMAGE_HEIGHT = 600;
const MIN_PIXABAY_DIMENSION = 1000;
const THUMBNAIL_URL_PATTERN = /(thumb|thumbnail|_tn\b|=w\d{2,3}|small|preview)/i;

// Palavras que não descrevem nada visual e atrapalham a busca por foto real.
const GENERIC_NEWS_TERMS = new Set([
  "noticia", "noticias", "news", "atualizacao", "atualizacoes", "update", "imagem",
  "imagens", "foto", "fotos", "brasil", "brasileiro", "brasileira", "hoje", "ontem",
  "agora", "ultima", "ultimas", "urgente", "veja", "confira", "saiba", "sobre",
  "apos", "durante", "entenda", "reportagem", "materia", "video", "assista",
]);

export function resolveProviderChain(value) {
  const raw = String(value || "").trim();
  const list = (raw || "serpapi,pixabay,openverse")
    .split(/[,\s]+/)
    .map((entry) => entry.trim().toLocaleLowerCase("en-US"))
    .filter((entry) => entry === "pixabay" || WEB_PROVIDERS.has(entry));
  return Array.from(new Set(list));
}

export function stableAssetId(value) {
  const text = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash | 0);
}

function isEligibleHit(hit, excludedIds, limits = {}) {
  const {
    minWidth = MIN_PIXABAY_DIMENSION,
    minHeight = MIN_PIXABAY_DIMENSION,
    allowUnknownDimensions = false,
  } = limits;
  const id = Number(hit?.id);
  const width = Number(hit?.imageWidth || hit?.webformatWidth || 0);
  const height = Number(hit?.imageHeight || hit?.webformatHeight || 0);
  const hasDimensions = width > 0 && height > 0;
  const dimensionsOk = hasDimensions
    ? (width >= minWidth && height >= minHeight)
    : allowUnknownDimensions;
  const downloadUrl = hit?.largeImageURL || hit?.webformatURL;
  return Number.isInteger(id)
    && !excludedIds.has(id)
    && dimensionsOk
    && Boolean(downloadUrl)
    && Boolean(hit?.pageURL)
    && !isBlockedImageUrl(downloadUrl)
    && !isBlockedImageUrl(hit?.pageURL);
}


export function scorePixabayHit(hit, query) {
  const queryTokens = meaningfulQueryTokens(query);
  const hitTokens = hitVisualTokens(hit);
  if (!queryTokens.length || !hitTokens.length) {
    return { score: Number.NEGATIVE_INFINITY, matchedTerms: [] };
  }

  const matchedTerms = queryTokens.filter((queryToken) =>
    hitTokens.some((hitToken) => tokensAreRelated(queryToken, hitToken))
  );
  if (!matchedTerms.length) {
    return { score: Number.NEGATIVE_INFINITY, matchedTerms: [] };
  }

  const requestedTokens = new Set(tokenize(query));
  const unrelatedGenericTerms = hitTokens.filter((token) =>
    GENERIC_STOCK_TERMS.has(token) && !requestedTokens.has(token)
  );
  const width = Number(hit?.imageWidth || hit?.webformatWidth || 0);
  const height = Number(hit?.imageHeight || hit?.webformatHeight || 0);
  const portraitBonus = height >= width ? 2 : 0;
  const score = matchedTerms.length * 12 + portraitBonus - unrelatedGenericTerms.length * 8;
  return { score, matchedTerms };
}

function rankRelevantHits(hits, excludedIds, query, limits) {
  return hits
    .filter((hit) => isEligibleHit(hit, excludedIds, limits))
    .map((hit) => ({ hit, ...scorePixabayHit(hit, query) }))
    .filter((candidate) => candidate.score >= MIN_STOCK_RELEVANCE_SCORE)
    .sort((left, right) => right.score - left.score);
}

function selectRelevantHit(hits, excludedIds, query, limits) {
  return rankRelevantHits(hits, excludedIds, query, limits)[0] || null;
}

/**
 * Confirma que a imagem escolhida realmente pode ser baixada.
 * Fail-open: só rejeita quando o servidor responde explicitamente com erro
 * ou com um conteúdo que não é imagem.
 */
async function canDownloadImage(fetchImpl, url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetchImpl(url, { method: "HEAD", signal: controller.signal });
    if (!response || typeof response.status !== "number") return true;
    if (response.status === 405 || response.status === 501) return true;
    if (!response.ok) return false;
    const type = response.headers?.get?.("content-type");
    if (type && !/^image\//i.test(type)) return false;
    return true;
  } catch {
    return true;
  } finally {
    clearTimeout(timeout);
  }
}

const WEB_IMAGE_LIMITS = {
  minWidth: MIN_WEB_IMAGE_WIDTH,
  minHeight: MIN_WEB_IMAGE_HEIGHT,
  allowUnknownDimensions: false,
};

const SERPAPI_LIMITS = {
  minWidth: MIN_WEB_IMAGE_WIDTH,
  minHeight: MIN_WEB_IMAGE_HEIGHT,
  allowUnknownDimensions: true,
};

/**
 * Monta uma consulta visual específica a partir da manchete e do resumo,
 * priorizando nomes próprios (pessoas, lugares, clubes, empresas, eventos)
 * e descartando palavras genéricas de noticiário.
 */
export function buildNewsImageQuery(headline, summary = "", maxWords = 6) {
  const rawHeadline = String(headline || "").replace(/\s+/g, " ").trim();
  const rawSummary = String(summary || "").replace(/\s+/g, " ").trim();
  const source = `${rawHeadline} ${rawSummary}`.trim();
  if (!source) return null;

  const words = source
    .replace(/["'“”‘’(){}\[\]]/g, " ")
    .split(/[\s,;:!?.\-–—/]+/)
    .filter(Boolean);

  const seen = new Set();
  const proper = [];
  const common = [];
  for (const word of words) {
    const plain = word.replace(/[^\p{L}\p{N}]/gu, "");
    if (plain.length < 3) continue;
    const key = normalizedToken(plain);
    if (!key || seen.has(key) || GENERIC_NEWS_TERMS.has(key) || QUERY_STOP_WORDS.has(key)) continue;
    seen.add(key);
    const isProper = /^\p{Lu}/u.test(plain);
    (isProper ? proper : common).push(plain);
  }

  const picked = [...proper, ...common].slice(0, Math.max(2, maxWords));
  if (!picked.length) return null;
  return normalizeStockImageQuery(picked.join(" "));
}

export function buildSerpapiImageSearchUrl(query, apiKey, { hl = "pt-br", gl = "br" } = {}) {
  const url = new URL(SERPAPI_SEARCH_URL);
  url.searchParams.set("engine", "google_images");
  url.searchParams.set("q", query);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("safe", "active");
  url.searchParams.set("hl", hl);
  url.searchParams.set("gl", gl);
  return url;
}

export function normalizeSerpapiHits(payload) {
  const results = Array.isArray(payload?.images_results) ? payload.images_results : [];
  return results.map((entry) => {
    // Evita thumbnails sempre que existir a URL original de maior resolução.
    const original = entry?.original || entry?.image || null;
    const thumbnail = entry?.thumbnail || null;
    const chosen = original && !THUMBNAIL_URL_PATTERN.test(String(original))
      ? original
      : (original || thumbnail);
    return {
      id: stableAssetId(chosen || entry?.link),
      tags: [entry?.title, entry?.source, entry?.snippet, entry?.link].filter(Boolean).join(" "),
      pageURL: entry?.link || entry?.source_logo || chosen,
      largeImageURL: chosen,
      imageWidth: Number(entry?.original_width || 0),
      imageHeight: Number(entry?.original_height || 0),
      user: entry?.source || null,
      licenseUrl: null,
    };
  }).filter((hit) => Boolean(hit.largeImageURL));
}

export function buildOpenverseSearchUrl(query) {
  const url = new URL(OPENVERSE_SEARCH_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("page_size", "30");
  url.searchParams.set("mature", "false");
  url.searchParams.set("license_type", "all-cc");
  return url;
}

export function buildGoogleImageSearchUrl(query, apiKey, cx, rights) {
  const url = new URL(GOOGLE_CSE_SEARCH_URL);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("cx", cx);
  url.searchParams.set("q", query);
  url.searchParams.set("searchType", "image");
  url.searchParams.set("imgSize", "large");
  url.searchParams.set("safe", "active");
  url.searchParams.set("num", "10");
  if (rights) url.searchParams.set("rights", rights);
  return url;
}

export function buildBingImageSearchUrl(query, license) {
  const url = new URL(BING_IMAGE_SEARCH_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("count", "30");
  url.searchParams.set("safeSearch", "Strict");
  url.searchParams.set("size", "Large");
  if (license) url.searchParams.set("license", license);
  return url;
}

export function normalizeOpenverseHits(payload) {
  const results = Array.isArray(payload?.results) ? payload.results : [];
  return results.map((entry) => ({
    id: stableAssetId(entry?.id || entry?.url),
    tags: [entry?.title, ...(Array.isArray(entry?.tags) ? entry.tags.map((tag) => tag?.name) : [])]
      .filter(Boolean).join(" "),
    pageURL: entry?.foreign_landing_url || entry?.url,
    largeImageURL: entry?.url,
    imageWidth: Number(entry?.width || 0),
    imageHeight: Number(entry?.height || 0),
    user: entry?.creator || null,
    licenseUrl: entry?.license_url
      || (entry?.license ? `https://creativecommons.org/licenses/${entry.license}/${entry.license_version || "4.0"}/` : null),
  }));
}

export function normalizeGoogleHits(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.map((entry) => ({
    id: stableAssetId(entry?.link),
    tags: [entry?.title, entry?.snippet, entry?.image?.contextLink].filter(Boolean).join(" "),
    pageURL: entry?.image?.contextLink || entry?.link,
    largeImageURL: entry?.link,
    imageWidth: Number(entry?.image?.width || 0),
    imageHeight: Number(entry?.image?.height || 0),
    user: entry?.displayLink || null,
    licenseUrl: null,
  }));
}

export function normalizeBingHits(payload) {
  const values = Array.isArray(payload?.value) ? payload.value : [];
  return values.map((entry) => ({
    id: stableAssetId(entry?.contentUrl),
    tags: [entry?.name, entry?.hostPageDisplayUrl].filter(Boolean).join(" "),
    pageURL: entry?.hostPageUrl || entry?.contentUrl,
    largeImageURL: entry?.contentUrl,
    imageWidth: Number(entry?.width || 0),
    imageHeight: Number(entry?.height || 0),
    user: entry?.hostPageDisplayUrl || null,
    licenseUrl: entry?.licenseUrl || null,
  }));
}

async function fetchJson(fetchImpl, url, headers, providerLabel) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  let response;
  try {
    response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json", ...headers },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    throw new Error(`${providerLabel} indisponível para o carrossel (HTTP ${response.status}).`);
  }
  return response.json();
}


function safeReadCache(cacheFile) {
  try {
    const parsed = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function safeWriteCache(cacheFile, cache) {
  try {
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true, mode: 0o700 });
    const tempFile = `${cacheFile}.${process.pid}.tmp`;
    fs.writeFileSync(tempFile, `${JSON.stringify(cache)}\n`, { mode: 0o600 });
    fs.renameSync(tempFile, cacheFile);
  } catch (error) {
    console.warn(`[carousel-stock] cache local indisponível: ${error?.message || error}`);
  }
}

function cachedEntry(cache, key, now) {
  const entry = cache[key];
  if (!entry || now - Number(entry.saved_at || 0) > STOCK_CACHE_TTL_MS) {
    return { found: false, result: null };
  }
  return { found: true, result: entry.result || null };
}

async function searchProvider({ providerName, query, fetchImpl, env }) {
  if (providerName === "pixabay") {
    const apiKey = env.pixabayKey;
    if (!apiKey) return null;
    const payload = await fetchJson(fetchImpl, buildPixabaySearchUrl(query, apiKey), {}, "Pixabay");
    return {
      hits: Array.isArray(payload?.hits) ? payload.hits : [],
      limits: { minWidth: MIN_PIXABAY_DIMENSION, minHeight: MIN_PIXABAY_DIMENSION },
      defaultLicenseUrl: PIXABAY_LICENSE_URL,
    };
  }
  if (providerName === "serpapi") {
    if (!env.serpapiKey) return null;
    const payload = await fetchJson(
      fetchImpl,
      buildSerpapiImageSearchUrl(query, env.serpapiKey),
      {},
      "Google Imagens (SerpApi)",
    );
    return {
      hits: normalizeSerpapiHits(payload),
      limits: SERPAPI_LIMITS,
      defaultLicenseUrl: null,
    };
  }
  if (providerName === "openverse") {
    const payload = await fetchJson(fetchImpl, buildOpenverseSearchUrl(query), {}, "Openverse");
    return {
      hits: normalizeOpenverseHits(payload),
      limits: WEB_IMAGE_LIMITS,
      defaultLicenseUrl: null,
    };
  }
  if (providerName === "google") {
    if (!env.googleKey || !env.googleCx) return null;
    const url = buildGoogleImageSearchUrl(query, env.googleKey, env.googleCx, env.googleRights);
    const payload = await fetchJson(fetchImpl, url, {}, "Google Imagens");
    return {
      hits: normalizeGoogleHits(payload),
      limits: WEB_IMAGE_LIMITS,
      defaultLicenseUrl: null,
    };
  }
  if (providerName === "bing") {
    if (!env.bingKey) return null;
    const payload = await fetchJson(
      fetchImpl,
      buildBingImageSearchUrl(query, env.bingLicense),
      { "Ocp-Apim-Subscription-Key": env.bingKey },
      "Bing Imagens",
    );
    return {
      hits: normalizeBingHits(payload),
      limits: WEB_IMAGE_LIMITS,
      defaultLicenseUrl: null,
    };
  }
  return null;
}

function logImageSearchSelection(result, { cached = false } = {}) {
  const audit = result?.audit;
  if (!audit) return;
  // Nunca registrar chave de API: apenas provedor, consulta e imagem escolhida.
  console.log(
    `[image-search] provider=${audit.provider} query="${audit.query}" source="${audit.page_url}" `
    + `image="${result.downloadUrl}" score=${audit.relevance_score ?? "n/a"}${cached ? " cache=hit" : ""}`,
  );
}

export async function resolveCarouselStockImage({
  query,
  queries = [],
  excludedIds = new Set(),
  apiKey = process.env.PIXABAY_API_KEY,
  provider = process.env.CAROUSEL_IMAGE_PROVIDER || "pixabay",
  serpapiKey = process.env.SERPAPI_API_KEY,
  providers = process.env.CAROUSEL_IMAGE_PROVIDERS || "",
  googleApiKey = process.env.GOOGLE_IMAGE_API_KEY,
  googleCx = process.env.GOOGLE_IMAGE_CX,
  googleRights = process.env.GOOGLE_IMAGE_RIGHTS ?? "cc_publicdomain|cc_attribute|cc_sharealike",
  bingApiKey = process.env.BING_IMAGE_API_KEY,
  bingLicense = process.env.BING_IMAGE_LICENSE ?? "ShareCommercially",
  cacheFile = path.join(process.cwd(), "worker", "temp", "carousel-stock-cache.json"),
  fetchImpl = fetch,
  validateDownload = process.env.CAROUSEL_VALIDATE_IMAGE_DOWNLOAD === "1",
  now = Date.now(),
} = {}) {
  const queryCandidates = normalizeStockImageQueries(query, queries);
  if (!queryCandidates.length) return null;

  const chain = providers
    ? resolveProviderChain(providers)
    : resolveProviderChain(provider);
  if (!chain.length) return null;

  const env = {
    pixabayKey: apiKey,
    serpapiKey,
    googleKey: googleApiKey,
    googleCx,
    googleRights,
    bingKey: bingApiKey,
    bingLicense,
  };

  const cache = safeReadCache(cacheFile);
  let firstError = null;

  for (const providerName of chain) {
    for (const normalizedQuery of queryCandidates) {
      const cacheKey = `${providerName}:${STOCK_CACHE_VERSION}:${normalizedQuery.toLocaleLowerCase("en-US")}`;
      const cached = cachedEntry(cache, cacheKey, now);
      if (cached.found) {
        if (cached.result && !excludedIds.has(Number(cached.result.audit?.asset_id))) {
          logImageSearchSelection(cached.result, { cached: true });
          return cached.result;
        }
        continue;
      }

      let search;
      try {
        search = await searchProvider({ providerName, query: normalizedQuery, fetchImpl, env });
      } catch (error) {
        firstError = firstError || error;
        break;
      }
      if (!search) break;

      const ranked = rankRelevantHits(
        search.hits,
        excludedIds,
        normalizedQuery,
        search.limits,
      );
      if (!ranked.length) {
        cache[cacheKey] = { saved_at: now, result: null };
        safeWriteCache(cacheFile, cache);
        continue;
      }

      let result = null;
      // Testa os melhores candidatos em ordem: se a imagem não baixa, cai para o próximo.
      for (const selected of ranked.slice(0, 5)) {
        const hit = selected.hit;
        const downloadUrl = String(hit.largeImageURL || hit.webformatURL);
        if (validateDownload && !(await canDownloadImage(fetchImpl, downloadUrl))) {
          console.warn(`[image-search] descartada (download falhou) provider=${providerName} query="${normalizedQuery}"`);
          continue;
        }
        result = {
          downloadUrl,
          audit: {
            provider: providerName,
            asset_id: Number(hit.id),
            page_url: String(hit.pageURL),
            contributor: String(hit.user || "").trim() || null,
            query: normalizedQuery,
            license_url: hit.licenseUrl || search.defaultLicenseUrl || null,
            selected_at: new Date(now).toISOString(),
            relevance_score: selected.score,
            matched_terms: selected.matchedTerms,
            cache_version: STOCK_CACHE_VERSION,
          },
        };
        break;
      }
      if (!result) {
        cache[cacheKey] = { saved_at: now, result: null };
        safeWriteCache(cacheFile, cache);
        continue;
      }
      cache[cacheKey] = { saved_at: now, result };
      safeWriteCache(cacheFile, cache);
      logImageSearchSelection(result);
      return result;
    }
  }

  if (firstError && chain.length === 1) throw firstError;
  return null;
}

