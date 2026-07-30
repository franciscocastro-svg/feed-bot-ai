import fs from "node:fs";
import path from "node:path";

export const PIXABAY_LICENSE_URL = "https://pixabay.com/service/license-summary/";
export const STOCK_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const STOCK_CACHE_VERSION = "v2";
export const MIN_STOCK_RELEVANCE_SCORE = 10;

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

function isEligibleHit(hit, excludedIds) {
  const id = Number(hit?.id);
  const width = Number(hit?.imageWidth || hit?.webformatWidth || 0);
  const height = Number(hit?.imageHeight || hit?.webformatHeight || 0);
  return Number.isInteger(id)
    && !excludedIds.has(id)
    && width >= 1000
    && height >= 1000
    && Boolean(hit?.largeImageURL || hit?.webformatURL)
    && Boolean(hit?.pageURL);
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

function selectRelevantHit(hits, excludedIds, query) {
  const ranked = hits
    .filter((hit) => isEligibleHit(hit, excludedIds))
    .map((hit) => ({ hit, ...scorePixabayHit(hit, query) }))
    .filter((candidate) => candidate.score >= MIN_STOCK_RELEVANCE_SCORE)
    .sort((left, right) => right.score - left.score);
  return ranked[0] || null;
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

export async function resolveCarouselStockImage({
  query,
  queries = [],
  excludedIds = new Set(),
  apiKey = process.env.PIXABAY_API_KEY,
  provider = process.env.CAROUSEL_IMAGE_PROVIDER || "pixabay",
  cacheFile = path.join(process.cwd(), "worker", "temp", "carousel-stock-cache.json"),
  fetchImpl = fetch,
  now = Date.now(),
} = {}) {
  const queryCandidates = normalizeStockImageQueries(query, queries);
  if (provider !== "pixabay" || !apiKey || !queryCandidates.length) return null;

  const cache = safeReadCache(cacheFile);
  for (const normalizedQuery of queryCandidates) {
    const cacheKey = `pixabay:${STOCK_CACHE_VERSION}:${normalizedQuery.toLocaleLowerCase("en-US")}`;
    const cached = cachedEntry(cache, cacheKey, now);
    if (cached.found) {
      if (cached.result && !excludedIds.has(Number(cached.result.audit?.asset_id))) {
        return cached.result;
      }
      continue;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    let response;
    try {
      response = await fetchImpl(buildPixabaySearchUrl(normalizedQuery, apiKey), {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      throw new Error(`Pixabay indisponível para o carrossel (HTTP ${response.status}).`);
    }

    const payload = await response.json();
    const selected = selectRelevantHit(
      Array.isArray(payload?.hits) ? payload.hits : [],
      excludedIds,
      normalizedQuery,
    );
    if (!selected) {
      cache[cacheKey] = { saved_at: now, result: null };
      safeWriteCache(cacheFile, cache);
      continue;
    }

    const hit = selected.hit;
    const result = {
      downloadUrl: String(hit.largeImageURL || hit.webformatURL),
      audit: {
        provider: "pixabay",
        asset_id: Number(hit.id),
        page_url: String(hit.pageURL),
        contributor: String(hit.user || "").trim() || null,
        query: normalizedQuery,
        license_url: PIXABAY_LICENSE_URL,
        selected_at: new Date(now).toISOString(),
        relevance_score: selected.score,
        matched_terms: selected.matchedTerms,
        cache_version: STOCK_CACHE_VERSION,
      },
    };
    cache[cacheKey] = { saved_at: now, result };
    safeWriteCache(cacheFile, cache);
    return result;
  }
  return null;
}
