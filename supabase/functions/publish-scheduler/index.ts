// Publishes scheduled posts that are due, via the Meta Graph API.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_MIN_MINUTES_BETWEEN_POSTS = 10;
const SAFE_MIN_MINUTES_BETWEEN_POSTS = 10;
// Quando a Meta devolve "too many actions" (code 9 / subcode 2207042),
// pausamos a conta por esse período para evitar piorar o bloqueio.
const RATE_LIMIT_COOLDOWN_MINUTES = 240;
const APP_RATE_LIMIT_COOLDOWN_MINUTES = 60;
const STALE_POSTING_MINUTES = 15;
const DEFAULT_USAGE_PAUSE_THRESHOLD = 80; // %
const GRAPH_VERSION = "v21.0";
const AWAITING_CONTAINER_TTL_MINUTES = 120;
const ACTIVE_QUEUE_STATUSES = ["scheduled", "posting", "awaiting_container"];

function isManagedReelVideoUrl(url?: string | null, userId?: string | null, itemId?: string | null) {
  if (!url || !userId || !itemId) return false;
  const clean = String(url).split("?")[0];
  let decoded = clean;
  try { decoded = decodeURIComponent(clean); } catch { /* keep raw url */ }
  const expectedPath = `${userId}/${itemId}.mp4`;
  return decoded.includes(`/post-images/${expectedPath}`) || decoded.endsWith(`/${expectedPath}`);
}

// =============================================================
// Captura headers de quota da Meta Graph API.
// X-App-Usage: { call_count, total_time, total_cputime } (0-100 cada)
// X-Business-Use-Case-Usage: { "<ig_user_id>": [{ type: "instagram_content_publish",
//    call_count, total_time, total_cputime, estimated_time_to_regain_access (min) }] }
// Persiste o snapshot em meta_api_usage para o dashboard e para o auto-freio.
// =============================================================
type MetaUsageSnapshot = {
  appCallCount: number; appTotalTime: number; appTotalCpuTime: number;
  bucCallCount: number; bucTotalTime: number; bucTotalCpuTime: number;
  bucEstimatedTimeToRegainAccess: number;
  maxPercent: number;
  rawApp: any; rawBuc: any;
};

function parseMetaUsageHeaders(res: Response, igUserId?: string | null): MetaUsageSnapshot | null {
  const appRaw = res.headers.get("x-app-usage");
  const bucRaw = res.headers.get("x-business-use-case-usage");
  if (!appRaw && !bucRaw) return null;
  let app: any = null, buc: any = null;
  try { app = appRaw ? JSON.parse(appRaw) : null; } catch { /* ignore */ }
  try { buc = bucRaw ? JSON.parse(bucRaw) : null; } catch { /* ignore */ }
  // Facebook Graph: { call_count, total_time, total_cputime }
  // Instagram Graph (graph.instagram.com): { call_volume, cpu_time, total_time }
  const appCallCount = Number(app?.call_count ?? app?.call_volume ?? 0);
  const appTotalTime = Number(app?.total_time ?? 0);
  const appTotalCpuTime = Number(app?.total_cputime ?? app?.cpu_time ?? 0);
  // Para BUC, encontramos a entrada referente ao igUserId (ou pegamos a 1ª).
  let bucEntry: any = null;
  if (buc && typeof buc === "object") {
    const list = (igUserId && Array.isArray(buc[igUserId])) ? buc[igUserId] : null;
    const fallback = list || (Object.values(buc).flat() as any[]);
    // Prioriza entradas de instagram_content_publish; senão o pior caso.
    const publish = (fallback || []).find((e: any) => /instagram_content_publish/i.test(e?.type || ""));
    bucEntry = publish || (fallback || []).reduce((acc: any, e: any) =>
      !acc || (e?.call_count ?? 0) > (acc?.call_count ?? 0) ? e : acc, null);
  }
  const bucCallCount = Number(bucEntry?.call_count ?? 0);
  const bucTotalTime = Number(bucEntry?.total_time ?? 0);
  const bucTotalCpuTime = Number(bucEntry?.total_cputime ?? 0);
  const bucEstimated = Number(bucEntry?.estimated_time_to_regain_access ?? 0);
  const maxPercent = Math.max(
    appCallCount, appTotalTime, appTotalCpuTime,
    bucCallCount, bucTotalTime, bucTotalCpuTime,
  );
  return {
    appCallCount, appTotalTime, appTotalCpuTime,
    bucCallCount, bucTotalTime, bucTotalCpuTime,
    bucEstimatedTimeToRegainAccess: bucEstimated,
    maxPercent,
    rawApp: app, rawBuc: buc,
  };
}

async function persistMetaUsage(
  supabase: any, userId: string, accountId: string | null | undefined,
  igUserId: string | null | undefined, res: Response,
) {
  if (!accountId) return null;
  const snap = parseMetaUsageHeaders(res, igUserId || null);
  if (!snap) return null;
  await supabase.from("meta_api_usage").insert({
    user_id: userId,
    instagram_account_id: accountId,
    app_call_count: snap.appCallCount,
    app_total_time: snap.appTotalTime,
    app_total_cputime: snap.appTotalCpuTime,
    buc_call_count: snap.bucCallCount,
    buc_total_time: snap.bucTotalTime,
    buc_total_cputime: snap.bucTotalCpuTime,
    buc_estimated_time_to_regain_access: snap.bucEstimatedTimeToRegainAccess,
    max_usage_percent: snap.maxPercent,
    raw_app_usage: snap.rawApp,
    raw_buc_usage: snap.rawBuc,
  });
  return snap;
}

function isRateLimitError(data: any) {
  const code = data?.error?.code;
  const sub = data?.error?.error_subcode;
  const msg = data?.error?.message || "";
  // Apenas o limite REAL por conta IG (9/2207042). O 4/2207051 é enganoso —
  // costuma significar "não consegui baixar a URL da imagem".
  return code === 9 || sub === 2207042 || /too many actions/i.test(msg);
}

// Erros transitórios do servidor da Meta. NÃO marcar como failed:
// reagendar com backoff (5min → 15min → 45min) e desistir só após N tentativas.
// 2207082 / 2207001: "Media upload has failed" — instabilidade da Meta.
// 1: "An unknown error occurred" / 2: "Service temporarily unavailable".
// Também: erros de rede (fetch failed, ECONN, timeout).
const MAX_TRANSIENT_RETRIES = 4;
function isTransientMediaError(message: string): boolean {
  return /2207082|2207001|media upload has failed|temporarily unavailable|service.*unavail|an unknown error|please try again|fetch failed|network error|timeout|demorou|processar (o vídeo|a mídia)|ETIMEDOUT|ECONNRESET|EAI_AGAIN/i.test(message);
}

function isAppRateLimitMessage(message: string): boolean {
  return /application request limit reached|código 4\b|\/2207051/i.test(message);
}

// Quando recebemos 4/2207051 num post de Feed, a Meta às vezes JÁ publicou
// a mídia antes de devolver o erro. Verificamos os últimos posts da conta
// procurando o caption exato — se achar, é um falso negativo: marcamos como
// posted em vez de reagendar (evita duplicação).
async function findRecentlyPublishedMediaId(
  igUserId: string,
  accessToken: string,
  caption: string,
): Promise<string | null> {
  try {
    const graph = graphHost(accessToken);
    const url = `${graph}/${GRAPH_VERSION}/${igUserId}/media?fields=id,caption,timestamp&limit=10&access_token=${encodeURIComponent(accessToken)}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const d = await r.json();
    const items = (d?.data || []) as Array<{ id: string; caption?: string; timestamp?: string }>;
    if (!items.length) return null;
    // janela de 10 minutos: o post precisa ser muito recente
    const cutoff = Date.now() - 10 * 60_000;
    const norm = (s: string) => (s || "").trim().slice(0, 120);
    const target = norm(caption);
    if (!target) return null;
    for (const it of items) {
      const ts = it.timestamp ? new Date(it.timestamp).getTime() : 0;
      if (ts < cutoff) continue;
      if (norm(it.caption || "") === target) return it.id;
    }
    return null;
  } catch (e) {
    console.error("findRecentlyPublishedMediaId error", e);
    return null;
  }
}
function transientBackoffMinutes(attempt: number): number {
  // attempt 1 → 3min, 2 → 10min, 3 → 25min, 4 → 60min
  return [3, 10, 25, 60][Math.min(attempt - 1, 3)] ?? 60;
}

function nextSpacedSlot(desiredMs: number, takenTimes: number[], minGapMs: number) {
  let slot = desiredMs;
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 500) {
    changed = false;
    for (const taken of takenTimes) {
      if (Math.abs(slot - taken) < minGapMs) {
        slot = taken + minGapMs;
        changed = true;
      }
    }
  }
  return slot;
}

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
const toBRT = (d: Date) => new Date(d.getTime() - BRT_OFFSET_MS);
const fromBRT = (d: Date) => new Date(d.getTime() + BRT_OFFSET_MS);

function normalizedHours(value: unknown): number[] {
  return Array.isArray(value)
    ? Array.from(new Set(value.map(Number).filter((h) => Number.isFinite(h) && h >= 0 && h <= 23))).sort((a, b) => a - b)
    : [];
}

function isAllowedHour(date: Date, allowedHours: number[]) {
  return !allowedHours.length || allowedHours.includes(toBRT(date).getUTCHours());
}

function nextAllowedSpacedSlot(desiredMs: number, takenTimes: number[], minGapMs: number, allowedHours: number[]) {
  let slot = desiredMs;
  for (let guard = 0; guard < 1000; guard++) {
    const candBRT = toBRT(new Date(slot));
    const hour = candBRT.getUTCHours();
    if (allowedHours.length && !allowedHours.includes(hour)) {
      const nextHour = allowedHours.find((h) => h > hour) ?? allowedHours[0];
      const nextBRT = new Date(candBRT);
      if (nextHour > hour) nextBRT.setUTCHours(nextHour, 0, 0, 0);
      else { nextBRT.setUTCDate(nextBRT.getUTCDate() + 1); nextBRT.setUTCHours(nextHour, 0, 0, 0); }
      slot = fromBRT(nextBRT).getTime();
      continue;
    }
    const spaced = nextSpacedSlot(slot, takenTimes, minGapMs);
    if (spaced === slot) return slot;
    slot = spaced;
  }
  return slot;
}

function getInstagramErrorMessage(prefix: string, data: any) {
  const rawMessage = data?.error?.message || "Erro desconhecido do Instagram";
  const errorType = data?.error?.type;
  const code = data?.error?.code;
  const subcode = data?.error?.error_subcode;
  const isExpiredToken =
    code === 190 ||
    /session has expired|access token.*expired|validating access token/i.test(rawMessage);

  if (isExpiredToken) {
    return "TOKEN_EXPIRED: Token do Instagram expirou. Atualize o Access Token em Contas Instagram e clique em Verificar token antes de publicar novamente.";
  }

  return `${prefix}: ${rawMessage}${code ? ` (código ${code}${subcode ? `/${subcode}` : ""})` : ""}`;
}

class ContainerStillProcessingError extends Error {
  creationId: string;

  constructor(creationId: string) {
    super("Instagram está processando o vídeo (contas novas podem levar 5-30 min). Aguardando...");
    this.name = "ContainerStillProcessingError";
    this.creationId = creationId;
  }
}

async function waitForContainer(creationId: string, accessToken: string, maxTries = 100, usageCtx?: { supabase: any; userId: string; accountId: string; igUserId: string }) {
  // Espera o container terminar de processar (vídeo ou imagem)
  // 100 tentativas × 3s = 5 min — Reels podem demorar bastante em horário de pico
  const graph = graphHost(accessToken);
  for (let i = 0; i < maxTries; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const r = await fetch(`${graph}/${GRAPH_VERSION}/${creationId}?fields=status_code,status&access_token=${accessToken}`);
    if (usageCtx) await persistMetaUsage(usageCtx.supabase, usageCtx.userId, usageCtx.accountId, usageCtx.igUserId, r);
    const d = await r.json();
    if (d.status_code === "FINISHED") return;
    if (d.status_code === "ERROR" || d.status_code === "EXPIRED") {
      const reason = d.status || d.error?.message || "Instagram rejeitou a mídia (formato/duração/proporção inválidos)";
      throw new Error(`Erro ao processar mídia: ${reason}${d.status_code === "EXPIRED" ? " (container expirou)" : ""}`);
    }
  }
  throw new ContainerStillProcessingError(creationId);
}

type UsageCtx = { supabase: any; userId: string; accountId: string; igUserId: string };

async function getContainerStatus(creationId: string, accessToken: string, usageCtx?: UsageCtx) {
  const graph = graphHost(accessToken);
  const r = await fetch(`${graph}/${GRAPH_VERSION}/${creationId}?fields=status_code,status&access_token=${accessToken}`);
  if (usageCtx) await persistMetaUsage(usageCtx.supabase, usageCtx.userId, usageCtx.accountId, usageCtx.igUserId, r);
  const data = await r.json();
  if (!r.ok) throw new Error(getInstagramErrorMessage("Erro ao consultar container do Instagram", data));
  return data;
}

function graphHost(accessToken: string) {
  return /^IG/i.test(accessToken.trim()) ? "https://graph.instagram.com" : "https://graph.facebook.com";
}

async function publishContainer(igUserId: string, creationId: string, accessToken: string, usageCtx?: UsageCtx) {
  // Retry quando a Meta ainda diz "Media ID is not available" (9007) — container acabou de ficar pronto
  let lastErr: any = null;
  const graph = graphHost(accessToken);
  for (let attempt = 0; attempt < 5; attempt++) {
    const pubRes = await fetch(`${graph}/${GRAPH_VERSION}/${igUserId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: creationId, access_token: accessToken }),
    });
    if (usageCtx) await persistMetaUsage(usageCtx.supabase, usageCtx.userId, usageCtx.accountId, usageCtx.igUserId, pubRes);
    const pubData = await pubRes.json();
    if (pubRes.ok) return pubData.id as string;
    const sub = pubData?.error?.error_subcode;
    const msg = pubData?.error?.message || "";
    const transient = sub === 2207027 || /Media ID is not available|not available/i.test(msg);
    lastErr = pubData;
    if (!transient) throw new Error(getInstagramErrorMessage("Erro ao publicar no Instagram", pubData));
    // espera progressiva: 4s, 8s, 12s, 16s, 20s
    await new Promise((r) => setTimeout(r, 4000 * (attempt + 1)));
  }
  throw new Error(getInstagramErrorMessage("Erro ao publicar no Instagram", lastErr));
}

async function publishToInstagram(
  igUserId: string,
  accessToken: string,
  mediaUrl: string,
  caption: string,
  mediaType: "feed" | "reel" | "story",
  isVideo: boolean,
  usageCtx?: UsageCtx,
) {
  // Limpa query strings (?t=cache-buster, etc) — a Meta às vezes recusa essas
  // URLs e devolve "Application request limit reached (4/2207051)" — mensagem
  // enganosa. Como o Storage do Supabase ignora a query, removê-la é seguro.
  const cleanUrl = (u: string) => {
    try { const x = new URL(u); x.search = ""; return x.toString(); } catch { return u; }
  };
  const finalMediaUrl = cleanUrl(mediaUrl);

  // 1. create container
  const createBody: Record<string, unknown> = { access_token: accessToken };
  if (mediaType !== "story") createBody.caption = caption;

  if (mediaType === "reel") {
    createBody.media_type = "REELS";
    createBody.video_url = finalMediaUrl;
    createBody.share_to_feed = true;
  } else if (mediaType === "story") {
    createBody.media_type = "STORIES";
    if (isVideo) createBody.video_url = finalMediaUrl;
    else createBody.image_url = finalMediaUrl;
  } else {
    createBody.image_url = finalMediaUrl;
  }
  const graph = graphHost(accessToken);
  const createRes = await fetch(`${graph}/${GRAPH_VERSION}/${igUserId}/media`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(createBody),
  });
  if (usageCtx) await persistMetaUsage(usageCtx.supabase, usageCtx.userId, usageCtx.accountId, usageCtx.igUserId, createRes);
  const createData = await createRes.json();
  if (!createRes.ok) throw new Error(getInstagramErrorMessage("Erro ao criar mídia no Instagram", createData));
  const creationId = createData.id;

  if (mediaType === "reel" || (mediaType === "story" && isVideo)) {
    await waitForContainer(creationId, accessToken, 40, usageCtx);
  } else {
    await waitForContainer(creationId, accessToken, 10, usageCtx).catch(() => {});
  }

  return await publishContainer(igUserId, creationId, accessToken, usageCtx);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const body = await req.json().catch(() => ({} as any));
    let userId: string | undefined = body?.user_id;
    const targetPostId = typeof body?.scheduled_post_id === "string" ? body.scheduled_post_id : undefined;
    let supabase;
    if (userId) {
      const internalSecret = Deno.env.get("INTERNAL_CRON_SECRET");
      const provided = req.headers.get("x-internal-secret");
      if (!internalSecret || provided !== internalSecret) {
        return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });
      }
      // chamada interna (autopilot/cron) — usa service role
      supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    } else {
      if (!auth) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });
      supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });
      userId = user.id;
    }


    // Posts per day limit + intervalo mínimo entre posts (configurável)
    const { data: settings } = await supabase.from("user_settings")
      .select("max_posts_per_day, min_post_interval_minutes, preferred_post_hours, meta_usage_pause_threshold")
      .eq("user_id", userId).maybeSingle();
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const { count: postedToday } = await supabase.from("scheduled_posts").select("id", { count: "exact", head: true })
      .eq("user_id", userId).eq("status", "posted").gte("posted_at", startOfDay.toISOString());

    const dailyCap = settings?.max_posts_per_day ?? 5;
    const isUnlimited = dailyCap < 0;
    const remaining = isUnlimited ? Infinity : Math.max(0, dailyCap - (postedToday || 0));
    const hasDailyCapacity = isUnlimited || remaining > 0;

    const minIntervalMin = Math.max(
      SAFE_MIN_MINUTES_BETWEEN_POSTS,
      settings?.min_post_interval_minutes ?? DEFAULT_MIN_MINUTES_BETWEEN_POSTS,
    );
    const globalAllowedHours = normalizedHours(settings?.preferred_post_hours);
    const { data: channelRows } = await supabase.from("channel_settings")
      .select("channel, min_interval_minutes, allowed_hours")
      .eq("user_id", userId);
    const channelConfig = new Map<string, { minIntervalMin: number; allowedHours: number[] }>();
    for (const row of (channelRows || []) as any[]) {
      const hours = normalizedHours(row.allowed_hours);
      channelConfig.set(row.channel, {
        minIntervalMin: Math.max(minIntervalMin, Number(row.min_interval_minutes) || minIntervalMin),
        allowedHours: hours.length ? hours : globalAllowedHours,
      });
    }
    const getPostConfig = (post: any) => {
      const mediaType = post?.media_type === "story" ? "story" : post?.media_type === "reel" ? "reel" : "feed";
      return channelConfig.get(mediaType) || { minIntervalMin, allowedHours: globalAllowedHours };
    };

    let processed = 0;

    // Busca os candidatos. Ordenamos pelo agendamento e processamos um por vez,
    // mas validamos o intervalo mínimo POR CONTA do Instagram.
    // Recupera automaticamente apenas timeouts transitórios de mídia.
    // Não reativa falhas de "Application request limit" sozinho, porque isso
    // mantém o app batendo na Meta durante o bloqueio temporário.
    await supabase.from("scheduled_posts").update({
      status: "scheduled",
      scheduled_for: new Date().toISOString(),
      retry_count: 0,
      error_message: "Reenfileirado automaticamente após falha transitória do Instagram.",
    })
      .eq("user_id", userId)
      .eq("status", "failed")
      .ilike("error_message", "%demorou%processar%vídeo%");

    await supabase.from("scheduled_posts").update({
      status: "scheduled",
      scheduled_for: new Date(Date.now() + 2 * 60_000).toISOString(),
      error_message: "Recuperado de envio travado. Tentando novamente com trava por conta.",
    })
      .eq("user_id", userId)
      .eq("status", "posting")
      .lt("updated_at", new Date(Date.now() - STALE_POSTING_MINUTES * 60_000).toISOString());

    const { data: activeScheduled } = await supabase.from("scheduled_posts")
      .select("id, scheduled_for, news_items(published_at)")
      .eq("user_id", userId)
      .eq("status", "scheduled");
    const expiringIds = (activeScheduled || [])
      .filter((row: any) => row.news_items?.published_at)
      .filter((row: any) => new Date(row.scheduled_for).getTime() >= new Date(row.news_items.published_at).getTime() + 12 * 3600 * 1000)
      .map((row: any) => row.id);
    if (expiringIds.length) {
      await supabase.from("scheduled_posts").update({
        status: "cancelled",
        error_message: "Notícia expirada antes da próxima tentativa. Cancelada para liberar a fila.",
      }).in("id", expiringIds);
    }

    let awaitingChecked = 0;
    let awaitingRecovered = 0;
    let awaitingQuery = supabase.from("scheduled_posts")
      .select("*, news_items(*), instagram_accounts(*)")
      .eq("user_id", userId)
      .eq("status", "awaiting_container")
      .not("ig_creation_id", "is", null);

    if (targetPostId) {
      awaitingQuery = awaitingQuery.eq("id", targetPostId).limit(1);
    } else {
      awaitingQuery = awaitingQuery
        .order("container_last_checked_at", { ascending: true, nullsFirst: true })
        .order("updated_at", { ascending: true })
        .limit(10);
    }

    const { data: awaitingContainers } = await awaitingQuery;
    for (const p of (awaitingContainers || []) as any[]) {
      if (processed > 0) break;
      awaitingChecked++;

      const acc = p.instagram_accounts;
      const news = p.news_items;
      const nowIso = new Date().toISOString();
      const createdAt = new Date(p.container_created_at || p.updated_at || p.created_at).getTime();
      const containerAgeMs = Date.now() - (Number.isFinite(createdAt) ? createdAt : Date.now());
      const isExpiredWaiting = containerAgeMs >= AWAITING_CONTAINER_TTL_MINUTES * 60_000;
      const postCfg = getPostConfig(p);

      if (!acc || !acc.ig_user_id || !acc.access_token) {
        await supabase.from("scheduled_posts").update({
          status: "failed",
          error_message: "Conta Instagram sem credenciais para consultar o container.",
          container_last_checked_at: nowIso,
        }).eq("id", p.id);
        continue;
      }

      if (acc.token_expires_at && new Date(acc.token_expires_at).getTime() <= Date.now()) {
        await supabase.from("instagram_accounts").update({
          active: false,
          verification_status: "invalid",
          token_expires_at: nowIso,
          last_verified_at: nowIso,
        }).eq("id", acc.id);
        await supabase.from("scheduled_posts").update({
          status: "scheduled",
          scheduled_for: new Date(Date.now() + 60 * 60_000).toISOString(),
          error_message: "Token do Instagram expirou. Atualize o token antes de publicar.",
          container_last_checked_at: nowIso,
        }).eq("id", p.id);
        continue;
      }

      let containerStatus: any;
      try {
        containerStatus = await getContainerStatus(
          p.ig_creation_id,
          acc.access_token,
          { supabase, userId: userId!, accountId: acc.id, igUserId: acc.ig_user_id },
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Erro ao consultar container do Instagram";
        await supabase.from("scheduled_posts").update({
          container_last_checked_at: nowIso,
          error_message: `${msg}. Nova verificação no próximo ciclo.`,
        }).eq("id", p.id);
        continue;
      }

      const statusCode = String(containerStatus?.status_code || "").toUpperCase();
      if (statusCode === "FINISHED") {
        if (!isAllowedHour(new Date(), postCfg.allowedHours)) {
          await supabase.from("scheduled_posts").update({
            container_last_checked_at: nowIso,
            error_message: `Container pronto. Aguardando horário permitido do canal (${postCfg.allowedHours.join(", ")}h).`,
          }).eq("id", p.id);
          continue;
        }

        const { data: latestPosted } = await supabase.from("scheduled_posts")
          .select("posted_at")
          .eq("user_id", userId)
          .eq("status", "posted")
          .eq("instagram_account_id", acc.id)
          .neq("id", p.id)
          .not("posted_at", "is", null)
          .order("posted_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const latestPostedAt = latestPosted?.posted_at ? new Date(latestPosted.posted_at).getTime() : 0;
        const minGapMs = postCfg.minIntervalMin * 60_000;
        if (latestPostedAt && Date.now() - latestPostedAt < minGapMs) {
          const nextAt = new Date(latestPostedAt + minGapMs).toISOString();
          await supabase.from("scheduled_posts").update({
            container_last_checked_at: nowIso,
            error_message: `Container pronto. Aguardando intervalo mínimo de ${postCfg.minIntervalMin} min entre posts (${new Date(nextAt).toLocaleString("pt-BR")}).`,
          }).eq("id", p.id);
          continue;
        }

        try {
          const usageCtx = { supabase, userId: userId!, accountId: acc.id, igUserId: acc.ig_user_id };
          const mediaId = await publishContainer(acc.ig_user_id, p.ig_creation_id, acc.access_token, usageCtx);
          await supabase.from("scheduled_posts").update({
            status: "posted",
            posted_at: nowIso,
            ig_media_id: mediaId,
            error_message: null,
            container_last_checked_at: nowIso,
          }).eq("id", p.id);
          if (news?.id) await supabase.from("news_items").update({ status: "posted" }).eq("id", news.id);
          await supabase.from("activity_logs").insert({
            user_id: userId,
            action: "publish_awaiting_container",
            entity_type: "scheduled_post",
            entity_id: p.id,
            details: { media_id: mediaId, creation_id: p.ig_creation_id },
          });
          processed++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Erro ao publicar container pronto";
          await supabase.from("scheduled_posts").update({
            container_last_checked_at: nowIso,
            error_message: `${msg}. Container pronto será tentado novamente no próximo ciclo.`,
          }).eq("id", p.id);
        }
        continue;
      }

      if (statusCode === "ERROR" || statusCode === "EXPIRED") {
        const reason = containerStatus?.status || "Instagram rejeitou ou expirou o container.";
        await supabase.from("scheduled_posts").update({
          status: "failed",
          error_message: `Container do Instagram ${statusCode.toLowerCase()}: ${reason}`,
          container_last_checked_at: nowIso,
        }).eq("id", p.id);
        if (news?.id) await supabase.from("news_items").update({ status: "failed", error_message: `Container do Instagram ${statusCode.toLowerCase()}` }).eq("id", news.id);
        continue;
      }

      if (isExpiredWaiting && p.media_type === "reel" && (news?.generated_cover_url || news?.generated_image_url)) {
        const nextSlot = nextAllowedSpacedSlot(
          Date.now() + 60_000,
          [],
          postCfg.minIntervalMin * 60_000,
          postCfg.allowedHours,
        );
        await supabase.from("scheduled_posts").update({
          status: "scheduled",
          media_type: "feed",
          scheduled_for: new Date(nextSlot).toISOString(),
          ig_creation_id: null,
          retry_count: 0,
          error_message: "Reel ficou preso no processamento do Instagram por mais de 2h. Reenfileirado como Feed com a capa para liberar a fila.",
          container_last_checked_at: nowIso,
        }).eq("id", p.id);
        await supabase.from("activity_logs").insert({
          user_id: userId,
          action: "awaiting_container_fallback_to_feed",
          entity_type: "scheduled_post",
          entity_id: p.id,
          details: { creation_id: p.ig_creation_id, status_code: statusCode || null, age_minutes: Math.round(containerAgeMs / 60_000) },
        });
        awaitingRecovered++;
        continue;
      }

      if (isExpiredWaiting) {
        await supabase.from("scheduled_posts").update({
          status: "failed",
          error_message: "Instagram não finalizou o container em até 2h e não há capa/foto para fallback.",
          container_last_checked_at: nowIso,
        }).eq("id", p.id);
        if (news?.id) await supabase.from("news_items").update({ status: "failed", error_message: "Container do Instagram não finalizou em até 2h." }).eq("id", news.id);
        awaitingRecovered++;
        continue;
      }

      await supabase.from("scheduled_posts").update({
        container_last_checked_at: nowIso,
        error_message: "Instagram está processando o vídeo (contas novas podem levar 5-30 min). Aguardando...",
      }).eq("id", p.id);
    }

    if (processed > 0) {
      return new Response(JSON.stringify({ processed, awaiting_checked: awaitingChecked, awaiting_recovered: awaitingRecovered }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!hasDailyCapacity) {
      return new Response(JSON.stringify({ processed: 0, awaiting_checked: awaitingChecked, awaiting_recovered: awaitingRecovered, reason: "daily limit reached" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let dueQuery = supabase.from("scheduled_posts")
      .select("*, news_items(*), instagram_accounts(*)")
      .eq("user_id", userId).eq("status", "scheduled")
      .lte("scheduled_for", new Date().toISOString());

    if (targetPostId) {
      dueQuery = dueQuery.eq("id", targetPostId).limit(1);
    } else {
      dueQuery = dueQuery.order("scheduled_for", { ascending: true }).limit(5);
    }

    const { data: due } = await dueQuery;

    // Pega último posted_at de cada conta IG envolvida
    const accountIds = Array.from(new Set((due || []).map((p: any) => p.instagram_account_id).filter(Boolean)));
    const lastPostedByAccount = new Map<string, number>();
    if (accountIds.length > 0) {
      const { data: lasts } = await supabase.from("scheduled_posts")
        .select("instagram_account_id, posted_at")
        .eq("user_id", userId).eq("status", "posted")
        .in("instagram_account_id", accountIds)
        .not("posted_at", "is", null)
        .order("posted_at", { ascending: false });
      for (const r of (lasts || [])) {
        if (r.instagram_account_id && !lastPostedByAccount.has(r.instagram_account_id)) {
          lastPostedByAccount.set(r.instagram_account_id, new Date(r.posted_at).getTime());
        }
      }
    }

    // Janela de tolerância: até X min esperando o navegador renderizar a arte
    // editorial (template Feed / capa Story / MP4 do Reel). Reels nunca fazem
    // fallback para Feed, porque isso quebraria o formato escolhido pelo cliente.
    const FALLBACK_AFTER_MS = 15 * 60_000;

    let chosen: any = null;
    let cooldownInfo: { post: any; nextAllowedAt: Date; minIntervalMin: number; allowedHours: number[] } | null = null;
    const cooldownPosts: { post: any; nextAllowedAt: Date; minIntervalMin: number; allowedHours: number[] }[] = [];
    const skippedNotReady: any[] = [];
    for (const p of (due || [])) {
      const news = p.news_items;
      const mt = p.media_type === "reel" ? "reel" : p.media_type === "story" ? "story" : "feed";
      const postCfg = getPostConfig(p);
      const waitedMs = Date.now() - new Date(p.created_at).getTime();
      const useFallback = waitedMs >= FALLBACK_AFTER_MS;
      const managedReelVideo = mt === "reel"
        ? isManagedReelVideoUrl(news?.generated_video_url, news?.user_id || p.user_id, news?.id || p.news_item_id)
        : false;

      const hasMedia = mt === "reel"
        ? managedReelVideo
        : mt === "story"
          ? !!(news?.generated_video_url || news?.generated_cover_url || news?.generated_image_url)
          : !!(news?.generated_image_url || news?.generated_cover_url);

      // Feed nunca publica foto crua: precisa da arte editorial/template pronta.
      // Stories ainda podem usar fallback depois da janela; Reels precisam do MP4 final.
      const allowRawFallback = mt === "story";
      const ready = mt === "reel"
        ? !!news?.editorial_ready && hasMedia
        : (allowRawFallback && useFallback) ? hasMedia : (news?.editorial_ready && hasMedia);
      if (!ready) {
        skippedNotReady.push(p);
        continue;
      }
      const accId = p.instagram_account_id;
      if (!isAllowedHour(new Date(), postCfg.allowedHours)) {
        const { data: takenSameAccount } = await supabase.from("scheduled_posts")
          .select("id, scheduled_for")
          .eq("user_id", userId)
          .in("status", ACTIVE_QUEUE_STATUSES)
          .eq("instagram_account_id", accId)
          .neq("id", p.id);
        const takenTimes = (takenSameAccount || []).map((row: any) => new Date(row.scheduled_for).getTime()).filter(Number.isFinite).sort((a: number, b: number) => a - b);
        const nextSlot = nextAllowedSpacedSlot(Date.now() + 60_000, takenTimes, postCfg.minIntervalMin * 60_000, postCfg.allowedHours);
        await supabase.from("scheduled_posts").update({
          scheduled_for: new Date(nextSlot).toISOString(),
          error_message: `Aguardando horário permitido do canal (${postCfg.allowedHours.join(", ")}h)`,
        }).eq("id", p.id);
        continue;
      }
      const last = accId ? lastPostedByAccount.get(accId) : undefined;
      if (!last || Date.now() - last >= postCfg.minIntervalMin * 60_000) {
        chosen = p;
        break;
      }
      const nextAllowedAt = new Date(last + postCfg.minIntervalMin * 60_000);
      cooldownPosts.push({ post: p, nextAllowedAt, minIntervalMin: postCfg.minIntervalMin, allowedHours: postCfg.allowedHours });
      if (!cooldownInfo) cooldownInfo = { post: p, nextAllowedAt, minIntervalMin: postCfg.minIntervalMin, allowedHours: postCfg.allowedHours };
    }

    // Reagenda em +3 min posts ainda DENTRO da janela de tolerância (esperando
    // o navegador renderizar). Posts fora da janela já entraram no fallback.
    // Reagenda posts ainda DENTRO da janela de tolerância. ESPAÇA cada um
    // pelo intervalo mínimo configurado — antes todos iam pro mesmo segundo,
    // empilhando vários posts no mesmo minuto.
    if (skippedNotReady.length > 0) {
      // Slots já ocupados (todos os agendados/posting do user) — para não empilhar
      const { data: taken } = await supabase.from("scheduled_posts")
        .select("id, scheduled_for")
        .eq("user_id", userId)
        .in("status", ACTIVE_QUEUE_STATUSES);
      const skipIds = new Set(skippedNotReady.map((s: any) => s.id));
      const takenTimes = (taken || [])
        .filter((t: any) => !skipIds.has(t.id))
        .map((t: any) => new Date(t.scheduled_for).getTime())
        .sort((a, b) => a - b);
      for (let i = 0; i < skippedNotReady.length; i++) {
        const cfg = getPostConfig(skippedNotReady[i]);
        const stepMs = Math.max(60_000, cfg.minIntervalMin * 60_000);
        const slot = nextAllowedSpacedSlot(
          Math.max(Date.now() + stepMs, (takenTimes[takenTimes.length - 1] ?? 0) + stepMs),
          takenTimes,
          stepMs,
          cfg.allowedHours,
        );
        await supabase.from("scheduled_posts").update({
          scheduled_for: new Date(slot).toISOString(),
          error_message: "Aguardando geração da arte/vídeo com template",
        }).eq("id", skippedNotReady[i].id);
        takenTimes.push(slot);
        takenTimes.sort((a, b) => a - b);
      }
    }


    if (!chosen) {
      if (cooldownPosts.length > 0) {
        // Adia TODOS os posts prontos que bateram no cooldown, espaçando a fila.
        // Antes apenas 1 item era adiado, deixando vários posts vencidos no mesmo horário.
        const sortedCooldown = cooldownPosts.sort((a, b) =>
          new Date(a.post.scheduled_for).getTime() - new Date(b.post.scheduled_for).getTime()
        );
        const cooldownIds = new Set(sortedCooldown.map((item) => item.post.id));
        const cooldownAccountIds = Array.from(new Set(sortedCooldown.map((item) => item.post.instagram_account_id).filter(Boolean)));
        const takenByAccount = new Map<string, number[]>();
        if (cooldownAccountIds.length > 0) {
          const { data: takenRows } = await supabase.from("scheduled_posts")
            .select("id, instagram_account_id, scheduled_for")
            .eq("user_id", userId)
            .in("status", ACTIVE_QUEUE_STATUSES)
            .in("instagram_account_id", cooldownAccountIds);
          for (const row of (takenRows || []) as any[]) {
            if (cooldownIds.has(row.id) || !row.instagram_account_id) continue;
            const time = new Date(row.scheduled_for).getTime();
            if (!Number.isFinite(time)) continue;
            const list = takenByAccount.get(row.instagram_account_id) || [];
            list.push(time);
            takenByAccount.set(row.instagram_account_id, list);
          }
        }
        for (const item of sortedCooldown) {
          const stepMs = item.minIntervalMin * 60_000;
          const accountKey = item.post.instagram_account_id || "__missing_account__";
          const takenTimes = (takenByAccount.get(accountKey) || []).sort((a, b) => a - b);
          const base = Math.max(Date.now(), item.nextAllowedAt.getTime());
          const slot = nextAllowedSpacedSlot(base, takenTimes, stepMs, item.allowedHours);
          await supabase.from("scheduled_posts").update({
            scheduled_for: new Date(slot).toISOString(),
            error_message: `Aguardando intervalo mínimo de ${item.minIntervalMin} min entre posts`,
          }).eq("id", item.post.id);
          takenTimes.push(slot);
          takenByAccount.set(accountKey, takenTimes);
        }
        return new Response(JSON.stringify({
          processed: 0,
          reason: "cooldown active",
          postponed: sortedCooldown.length,
          next_allowed_at: new Date(Math.max(Date.now(), sortedCooldown[0].nextAllowedAt.getTime())).toISOString(),
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ processed: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const dueList = [chosen];

    const expiredAccountIds = new Set<string>();
    for (const p of dueList) {
      const { data: lockedPost, error: lockError } = await supabase.from("scheduled_posts")
        .update({ status: "posting" })
        .eq("id", p.id)
        .eq("status", "scheduled")
        .select("id")
        .maybeSingle();
      if (lockError || !lockedPost) {
        const next = new Date(Date.now() + minIntervalMin * 60_000).toISOString();
        await supabase.from("scheduled_posts").update({
          scheduled_for: next,
          error_message: "Outra publicação desta conta já está em envio. Reagendado para evitar bloqueio do Instagram.",
        }).eq("id", p.id).eq("status", "scheduled");
        continue;
      }
      try {
        const acc = p.instagram_accounts;
        const news = p.news_items;
        // descarta se a notícia tem mais de 12h
        if (news?.published_at && Date.now() - new Date(news.published_at).getTime() > 12 * 3600 * 1000) {
          await supabase.from("scheduled_posts").update({ status: "cancelled", error_message: "Notícia expirou (>12h)" }).eq("id", p.id);
          await supabase.from("news_items").update({ status: "rejected", error_message: "Notícia com mais de 12h" }).eq("id", news.id);
          continue;
        }
        if (!acc || !acc.ig_user_id || !acc.access_token) throw new Error("Conta Instagram sem credenciais");
        if (expiredAccountIds.has(acc.id)) throw new Error("Token do Instagram expirou. Atualize o Access Token em Contas Instagram e clique em Verificar token antes de publicar novamente.");
        if (acc.token_expires_at && new Date(acc.token_expires_at).getTime() <= Date.now()) {
          throw new Error("TOKEN_EXPIRED: Token do Instagram expirou. Atualize o Access Token em Contas Instagram e clique em Verificar token antes de publicar novamente.");
        }

        // Trava final anti-concorrência: a escolha do post acontece antes da
        // chamada à Meta e pode ficar obsoleta se outro cron/manual publicar
        // a mesma conta enquanto esta execução aguardava. Revalidamos o
        // intervalo depois de marcar "posting", imediatamente antes do envio.
        const postCfg = getPostConfig(p);
        if (acc.id) {
          const { data: latestPosted } = await supabase.from("scheduled_posts")
            .select("posted_at")
            .eq("user_id", userId)
            .eq("status", "posted")
            .eq("instagram_account_id", acc.id)
            .neq("id", p.id)
            .not("posted_at", "is", null)
            .order("posted_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const latestPostedAt = latestPosted?.posted_at ? new Date(latestPosted.posted_at).getTime() : 0;
          const minGapMs = postCfg.minIntervalMin * 60_000;
          if (latestPostedAt && Date.now() - latestPostedAt < minGapMs) {
            const nextAt = new Date(latestPostedAt + minGapMs).toISOString();
            await supabase.from("scheduled_posts").update({
              status: "scheduled",
              scheduled_for: nextAt,
              error_message: `Aguardando intervalo mínimo de ${postCfg.minIntervalMin} min entre posts`,
            }).eq("id", p.id);
            await supabase.from("activity_logs").insert({
              user_id: userId,
              action: "publish_postponed",
              entity_type: "scheduled_post",
              entity_id: p.id,
              details: { reason: "account_cooldown_final_check", account_id: acc.id, retry_at: nextAt, min_interval_minutes: postCfg.minIntervalMin },
            });
            continue;
          }
        }

        // === AUTO-FREIO ANTES DE BATER 100% NO LIMITE DA META ===
        // Lê o último snapshot de quota desta conta. Se já passamos do
        // threshold (default 80%), pausamos automaticamente esta publicação
        // e reagendamos para depois do tempo estimado de regain (ou +1h).
        const usagePauseThreshold = settings?.meta_usage_pause_threshold ?? DEFAULT_USAGE_PAUSE_THRESHOLD;
        if (usagePauseThreshold > 0 && usagePauseThreshold < 100) {
          const { data: lastUsage } = await supabase.from("meta_api_usage_latest")
            .select("max_usage_percent, buc_estimated_time_to_regain_access, app_call_count, app_total_time, app_total_cputime, buc_call_count, buc_total_time, buc_total_cputime")
            .eq("instagram_account_id", acc.id).maybeSingle();
          if (lastUsage && lastUsage.max_usage_percent >= usagePauseThreshold) {
            const regainMin = Math.max(60, Number(lastUsage.buc_estimated_time_to_regain_access) || 60);
            const nextAt = new Date(Date.now() + regainMin * 60_000).toISOString();
            await supabase.from("scheduled_posts").update({
              status: "scheduled",
              scheduled_for: nextAt,
              error_message: `Auto-freio: uso da API Meta em ${lastUsage.max_usage_percent}% (limite ${usagePauseThreshold}%). Reagendado para ${new Date(nextAt).toLocaleString("pt-BR")} para evitar bloqueio.`,
            }).eq("id", p.id);
            await supabase.from("activity_logs").insert({
              user_id: userId, action: "publish_throttled_by_quota",
              entity_type: "scheduled_post", entity_id: p.id,
              details: { account_id: acc.id, usage_percent: lastUsage.max_usage_percent, threshold: usagePauseThreshold, retry_at: nextAt },
            });
            continue;
          }
        }

        const mediaType: "feed" | "reel" | "story" =
          p.media_type === "reel" ? "reel" : p.media_type === "story" ? "story" : "feed";
        let isVideo = mediaType === "reel";
        let mediaUrl: string | null | undefined;
        const waitedMs = Date.now() - new Date(p.created_at).getTime();
        const pastFallbackWindow = waitedMs >= 15 * 60_000;
        const managedReelVideo = mediaType === "reel"
          ? isManagedReelVideoUrl(news?.generated_video_url, news?.user_id || p.user_id, news?.id || p.news_item_id)
          : false;
        const staleReelVideo = mediaType === "reel" && !!news?.generated_video_url && !managedReelVideo;

        if (mediaType === "reel") {
          if (managedReelVideo) {
            mediaUrl = news.generated_video_url;
          }
        } else if (mediaType === "story") {
          if (news?.generated_video_url) { mediaUrl = news.generated_video_url; isVideo = true; }
          else { mediaUrl = news?.generated_cover_url || news?.generated_image_url; isVideo = false; }
        } else {
          mediaUrl = news?.generated_image_url || news?.generated_cover_url;
        }
        // Feed nunca publica foto crua: precisa da arte/template pronta.
        // Stories podem usar fallback depois da janela; Reels precisam do MP4 final.
        const editorialReady = !!news?.editorial_ready;
        const allowRawFallback = mediaType === "story";
        if (!mediaUrl || (mediaType === "reel" && !managedReelVideo) || (!editorialReady && !(allowRawFallback && pastFallbackWindow))) {
          const next = new Date(Date.now() + minIntervalMin * 60_000).toISOString();
          const reelNotReady = p.media_type === "reel" && !managedReelVideo;
          await supabase.from("scheduled_posts").update({
            status: "scheduled",
            scheduled_for: next,
            error_message: reelNotReady
              ? news?.generated_video_url
                ? "Aguardando regeneração do Reel com template"
                : "Aguardando geração do Reel com template"
              : !editorialReady
              ? "Aguardando geração da arte editorial/template"
              : "Aguardando mídia",
          }).eq("id", p.id);
          await supabase.from("activity_logs").insert({
            user_id: userId, action: "publish_postponed", entity_type: "scheduled_post", entity_id: p.id,
            details: {
              reason: reelNotReady
                ? staleReelVideo
                  ? "stale_reel_video_url"
                  : "reel_video_not_ready"
                : !editorialReady
                ? "editorial_not_ready"
                : "media_not_ready",
              media_type: mediaType,
              retry_at: next,
              waited_ms: waitedMs,
            },
          });
          continue;
        }
        const captionToUse = mediaType === "reel"
          ? news.reel_caption || news.caption || news.rewritten_title || ""
          : news.caption || news.rewritten_title || "";
        const usageCtx = { supabase, userId: userId!, accountId: acc.id, igUserId: acc.ig_user_id };
        const mediaId = await publishToInstagram(acc.ig_user_id, acc.access_token, mediaUrl, captionToUse, mediaType, isVideo, usageCtx);
        await supabase.from("scheduled_posts").update({ status: "posted", posted_at: new Date().toISOString(), ig_media_id: mediaId, error_message: null }).eq("id", p.id);
        await supabase.from("news_items").update({ status: "posted" }).eq("id", news.id);
        await supabase.from("activity_logs").insert({ user_id: userId, action: "publish_instagram", entity_type: "scheduled_post", entity_id: p.id, details: { media_id: mediaId } });
        processed++;
      } catch (e) {
        const rawMsg = e instanceof Error ? e.message : "unknown";
        const isExpiredToken = rawMsg.startsWith("TOKEN_EXPIRED:");
        const msg = isExpiredToken ? rawMsg.replace("TOKEN_EXPIRED: ", "") : rawMsg;
        const acc = p.instagram_accounts;
        const news = p.news_items;
        const isRateLimit = /too many actions|application request limit reached|código (4|9)\b|\/(2207042|2207051)/i.test(msg);
        const isAppLimit = isAppRateLimitMessage(msg);

        if (e instanceof ContainerStillProcessingError && acc?.id) {
          const nowIso = new Date().toISOString();
          await supabase.from("scheduled_posts").update({
            status: "awaiting_container",
            ig_creation_id: e.creationId,
            container_created_at: nowIso,
            container_last_checked_at: nowIso,
            retry_count: 0,
            error_message: e.message,
          }).eq("id", p.id);
          if (news?.id) await supabase.from("news_items").update({ status: "scheduled" }).eq("id", news.id);
          await supabase.from("activity_logs").insert({
            user_id: userId,
            action: "publish_container_awaiting",
            entity_type: "scheduled_post",
            entity_id: p.id,
            details: { creation_id: e.creationId, account_id: acc.id },
          });
          continue;
        }

        if (isExpiredToken && acc?.id) {
          expiredAccountIds.add(acc.id);
          await supabase.from("instagram_accounts").update({
            active: false,
            verification_status: "invalid",
            token_expires_at: new Date().toISOString(),
            last_verified_at: new Date().toISOString(),
          }).eq("id", acc.id);
        }

        if (isRateLimit && acc?.id) {
          // FALSO NEGATIVO: Meta às vezes devolve 4/2207051 em FEED depois
          // de já ter publicado a mídia. Antes de reagendar, verifica se o
          // post existe no perfil — se sim, marca como publicado.
          if (p.media_type === "feed") {
            try {
              const captionToCheck = (news as any)?.caption || (news as any)?.rewritten_title || "";
              const ghostId = await findRecentlyPublishedMediaId(acc.ig_user_id, acc.access_token, captionToCheck);
              if (ghostId) {
                await supabase.from("scheduled_posts").update({
                  status: "posted",
                  posted_at: new Date().toISOString(),
                  ig_media_id: ghostId,
                  error_message: null,
                }).eq("id", p.id);
                await supabase.from("news_items").update({ status: "posted" }).eq("id", news.id);
                await supabase.from("activity_logs").insert({
                  user_id: userId, action: "publish_recovered_ghost", entity_type: "scheduled_post", entity_id: p.id,
                  details: { media_id: ghostId, original_error: msg, account_id: acc.id },
                });
                processed++;
                continue;
              }
            } catch (recoverErr) {
              console.error("ghost recovery failed", recoverErr);
            }
          }

          // Code 4/2207051 vem do app vinculado ao token desta conta; não deve
          // bloquear outras contas que usam outro app/token.
          const cooldownMin = isAppLimit ? APP_RATE_LIMIT_COOLDOWN_MINUTES : RATE_LIMIT_COOLDOWN_MINUTES;
          const nextAt = new Date(Date.now() + cooldownMin * 60_000).toISOString();
          const reason = isAppLimit
            ? `Instagram recusou por excesso de chamadas desta conta/app (Application request limit). Reagendado para ${new Date(nextAt).toLocaleString("pt-BR")}.`
            : `Instagram bloqueou temporariamente esta conta (limite de ações). Reagendado para ${new Date(nextAt).toLocaleString("pt-BR")}.`;
          // Cada conta IG usa seu próprio App da Meta (token/credenciais isolados),
          // então o bloqueio (mesmo o de "app-level") afeta APENAS a conta atual.
          // Não pausamos as outras contas do usuário.
          const { data: takenSameAccount } = await supabase.from("scheduled_posts")
            .select("id, scheduled_for")
            .eq("user_id", userId)
            .in("status", ACTIVE_QUEUE_STATUSES)
            .eq("instagram_account_id", acc.id)
            .neq("id", p.id);
          const stepMs = minIntervalMin * 60_000;
          const takenTimes = (takenSameAccount || [])
            .map((row: any) => new Date(row.scheduled_for).getTime())
            .filter((time: number) => Number.isFinite(time))
            .sort((a: number, b: number) => a - b);
          const blockedSlot = nextSpacedSlot(new Date(nextAt).getTime(), takenTimes, stepMs);
          await supabase.from("scheduled_posts").update({
            status: "scheduled",
            scheduled_for: new Date(blockedSlot).toISOString(),
            error_message: reason,
          }).eq("id", p.id);
          takenTimes.push(blockedSlot);
          takenTimes.sort((a: number, b: number) => a - b);
          const { data: queuedSameAccount } = await supabase.from("scheduled_posts")
            .select("id")
            .eq("user_id", userId)
            .eq("status", "scheduled")
            .eq("instagram_account_id", acc.id)
            .neq("id", p.id)
            .lte("scheduled_for", nextAt)
            .order("scheduled_for", { ascending: true });
          for (let i = 0; i < (queuedSameAccount || []).length; i++) {
            const slot = nextSpacedSlot(new Date(nextAt).getTime(), takenTimes, stepMs);
            await supabase.from("scheduled_posts").update({
              scheduled_for: new Date(slot).toISOString(),
              error_message: isAppLimit
                ? "Aguardando fim do limite de chamadas do app Instagram desta conta"
                : "Aguardando fim do bloqueio temporário do Instagram nesta conta",
            }).eq("id", queuedSameAccount[i].id);
            takenTimes.push(slot);
            takenTimes.sort((a: number, b: number) => a - b);
          }

          await supabase.from("activity_logs").insert({
            user_id: userId,
            action: isAppLimit ? "publish_app_rate_limited" : "publish_rate_limited",
            entity_type: "scheduled_post", entity_id: p.id,
            details: { account_id: acc.id, retry_at: nextAt, error: msg, scope: isAppLimit ? "account_app" : "account" },
          });
          continue;
        }

        // Erro transitório do Instagram (2207082, indisponibilidade, rede): reagenda
        // com backoff exponencial em vez de marcar como falha definitiva.
        if (isTransientMediaError(msg)) {
          const attempt = (p.retry_count || 0) + 1;
          if (attempt <= MAX_TRANSIENT_RETRIES) {
            const waitMin = transientBackoffMinutes(attempt);
            const nextAt = new Date(Date.now() + waitMin * 60_000).toISOString();
            await supabase.from("scheduled_posts").update({
              status: "scheduled",
              scheduled_for: nextAt,
              retry_count: attempt,
              error_message: `Instagram demorou para processar o vídeo (tentativa ${attempt}/${MAX_TRANSIENT_RETRIES}). Nova tentativa em ${waitMin} min.`,
            }).eq("id", p.id);
            await supabase.from("activity_logs").insert({
              user_id: userId, action: "publish_transient_retry", entity_type: "scheduled_post", entity_id: p.id,
              details: { attempt, retry_at: nextAt, error: msg },
            });
            continue;
          }
        }

        await supabase.from("scheduled_posts").update({ status: "failed", error_message: msg }).eq("id", p.id);
        await supabase.from("activity_logs").insert({ user_id: userId, action: "publish_failed", entity_type: "scheduled_post", entity_id: p.id, details: { error: msg } });
      }
    }
    return new Response(JSON.stringify({ processed }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
