const DEFAULT_GRAPH_VERSION = "v21.0";
const PROFILE_CACHE_TTL_MS = 10 * 60 * 1000;
const profileCache = new Map();

function cleanText(value, limit = 160) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function cleanHandle(value) {
  return cleanText(value, 80).replace(/^@+/, "");
}

export function trustedInstagramProfileImageUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    const trusted = host === "instagram.com"
      || host.endsWith(".instagram.com")
      || host.endsWith(".cdninstagram.com")
      || host.endsWith(".fbcdn.net");
    return trusted ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizeVerified(value) {
  return value === true || value === "true";
}

async function fetchJson(fetchImpl, url) {
  const signal = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(12_000)
    : undefined;
  const response = await fetchImpl(url, signal ? { signal } : {});
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`Meta profile request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return payload && typeof payload === "object" ? payload : {};
}

function graphCandidates(account, graphVersion) {
  const id = encodeURIComponent(cleanText(account?.ig_user_id, 100));
  if (!id) return [];
  const version = cleanText(graphVersion, 20) || DEFAULT_GRAPH_VERSION;
  return account?.page_id
    ? [`https://graph.facebook.com/${version}/${id}`]
    : [
        `https://graph.instagram.com/${version}/${id}`,
        `https://graph.facebook.com/${version}/${id}`,
      ];
}

async function fetchCoreProfile(fetchImpl, bases, accessToken) {
  let lastError = null;
  for (const base of bases) {
    try {
      const url = new URL(base);
      url.searchParams.set("fields", "id,username,name,profile_picture_url");
      url.searchParams.set("access_token", accessToken);
      return { base, profile: await fetchJson(fetchImpl, url) };
    } catch (error) {
      lastError = error;
      try {
        const coreUrl = new URL(base);
        coreUrl.searchParams.set("fields", "id,username");
        coreUrl.searchParams.set("access_token", accessToken);
        const profile = await fetchJson(fetchImpl, coreUrl);
        for (const field of ["name", "profile_picture_url"]) {
          try {
            const optionalUrl = new URL(base);
            optionalUrl.searchParams.set("fields", field);
            optionalUrl.searchParams.set("access_token", accessToken);
            Object.assign(profile, await fetchJson(fetchImpl, optionalUrl));
          } catch {
            // Campo opcional indisponível nesta modalidade/permissão da Meta.
          }
        }
        return { base, profile };
      } catch (fallbackError) {
        lastError = fallbackError;
      }
    }
  }
  if (lastError) throw lastError;
  return null;
}

async function fetchVerifiedStatus(fetchImpl, base, accessToken) {
  for (const field of ["is_verified_user", "is_verified"]) {
    try {
      const url = new URL(base);
      url.searchParams.set("fields", field);
      url.searchParams.set("access_token", accessToken);
      const payload = await fetchJson(fetchImpl, url);
      if (Object.prototype.hasOwnProperty.call(payload, field)) {
        return normalizeVerified(payload[field]);
      }
    } catch {
      // Nem todas as modalidades/permissões da API expõem o selo público.
    }
  }
  return false;
}

export async function resolveInstagramEditorialIdentity({
  supabase,
  accountId,
  userId,
  fetchImpl = globalThis.fetch,
  graphVersion = process.env.META_GRAPH_API_VERSION || DEFAULT_GRAPH_VERSION,
  now = Date.now(),
} = {}) {
  if (!supabase || !accountId || !userId) {
    throw new Error("Conta Instagram inválida para identidade editorial");
  }

  const cacheKey = `${userId}:${accountId}`;
  const cached = profileCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return { ...cached.value };

  const { data: account, error: accountError } = await supabase
    .from("instagram_accounts")
    .select("user_id,username,ig_user_id,page_id")
    .eq("id", accountId)
    .maybeSingle();
  if (accountError) throw accountError;
  if (!account || account.user_id !== userId) {
    throw new Error("Conta Instagram não pertence ao usuário do corte");
  }

  const fallbackHandle = cleanHandle(account.username);
  const fallback = {
    name: fallbackHandle || "Instagram",
    handle: fallbackHandle,
    logoUrl: null,
    verified: false,
    source: "selected_account",
  };

  try {
    const { data: secret, error: secretError } = await supabase.rpc("get_instagram_account_secret", {
      _account_id: accountId,
    });
    const accessToken = typeof secret === "string" ? secret.trim() : "";
    if (secretError || !accessToken || typeof fetchImpl !== "function") return fallback;

    const core = await fetchCoreProfile(fetchImpl, graphCandidates(account, graphVersion), accessToken);
    if (!core) return fallback;
    const remoteHandle = cleanHandle(core.profile.username);
    // A resposta precisa pertencer à conta selecionada; nunca aceite identidade de outro @.
    if (remoteHandle && fallbackHandle && remoteHandle.toLowerCase() !== fallbackHandle.toLowerCase()) {
      return fallback;
    }
    const verified = await fetchVerifiedStatus(fetchImpl, core.base, accessToken);
    const value = {
      name: cleanText(core.profile.name, 100) || remoteHandle || fallback.name,
      handle: remoteHandle || fallback.handle,
      logoUrl: trustedInstagramProfileImageUrl(core.profile.profile_picture_url),
      verified,
      source: "meta_profile",
    };
    profileCache.set(cacheKey, { value, expiresAt: now + PROFILE_CACHE_TTL_MS });
    return { ...value };
  } catch {
    return fallback;
  }
}

export function clearInstagramEditorialIdentityCache() {
  profileCache.clear();
}
