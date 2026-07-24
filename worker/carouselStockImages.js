import fs from "node:fs";
import path from "node:path";

export const PIXABAY_LICENSE_URL = "https://pixabay.com/service/license-summary/";
export const STOCK_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

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

export function buildPixabaySearchUrl(query, apiKey) {
  const url = new URL("https://pixabay.com/api/");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("q", query);
  url.searchParams.set("image_type", "photo");
  url.searchParams.set("orientation", "vertical");
  url.searchParams.set("safesearch", "true");
  url.searchParams.set("order", "popular");
  url.searchParams.set("per_page", "10");
  return url;
}

function selectEligibleHit(hits, excludedIds) {
  return hits.find((hit) => {
    const id = Number(hit?.id);
    const width = Number(hit?.imageWidth || hit?.webformatWidth || 0);
    const height = Number(hit?.imageHeight || hit?.webformatHeight || 0);
    return Number.isInteger(id)
      && !excludedIds.has(id)
      && width >= 1000
      && height >= 1000
      && Boolean(hit?.largeImageURL || hit?.webformatURL)
      && Boolean(hit?.pageURL);
  }) || null;
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

function cachedResult(cache, key, now) {
  const entry = cache[key];
  if (!entry || now - Number(entry.saved_at || 0) > STOCK_CACHE_TTL_MS) return null;
  return entry.result || null;
}

export async function resolveCarouselStockImage({
  query,
  excludedIds = new Set(),
  apiKey = process.env.PIXABAY_API_KEY,
  provider = process.env.CAROUSEL_IMAGE_PROVIDER || "pixabay",
  cacheFile = path.join(process.cwd(), "worker", "temp", "carousel-stock-cache.json"),
  fetchImpl = fetch,
  now = Date.now(),
} = {}) {
  const normalizedQuery = normalizeStockImageQuery(query);
  if (provider !== "pixabay" || !apiKey || !normalizedQuery) return null;

  const cache = safeReadCache(cacheFile);
  const cacheKey = `pixabay:${normalizedQuery.toLocaleLowerCase("en-US")}`;
  const cached = cachedResult(cache, cacheKey, now);
  if (cached && !excludedIds.has(Number(cached.audit?.asset_id))) return cached;

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
  const hit = selectEligibleHit(Array.isArray(payload?.hits) ? payload.hits : [], excludedIds);
  if (!hit) return null;

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
    },
  };
  cache[cacheKey] = { saved_at: now, result };
  safeWriteCache(cacheFile, cache);
  return result;
}
