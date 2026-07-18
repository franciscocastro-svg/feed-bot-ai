// Autopilot: roda em cron, orquestra fetch -> process -> schedule -> publish
// para todos os usuários com auto_approve = true
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PENDING_NEWS_MAX_AGE_HOURS } from "../_shared/autopilot-policy.ts";
import {
  decideStaleNewsRecovery,
  STALE_NEWS_PROCESSING_MS,
} from "../_shared/news-processing-policy.ts";
import {
  compareEditorialNews,
  editorialNewsScore,
  MIN_POST_INTERVAL_MINUTES,
  resolveGlobalPostInterval,
  shouldPrepareNextPost,
  type EditorialNews,
} from "../_shared/editorial-policy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PUBLISH_ACTIVE_STATUSES = ["scheduled", "posting", "awaiting_container"];
const DUPLICATE_LOOKBACK_HOURS = 72;
const MAX_ACTIVE_QUEUE_PER_ACCOUNT = 1;

async function callFn(name: string, body: Record<string, unknown>) {
  const internalSecret = Deno.env.get("INTERNAL_CRON_SECRET") || "";
  const r = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      "Content-Type": "application/json",
      "x-internal-secret": internalSecret,
    },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let data: any = text;
  try { data = JSON.parse(text); } catch {}
  return { ok: r.ok, status: r.status, data };
}

async function recordFunctionFailure(
  supabase: any,
  userId: string,
  functionName: string,
  result: { ok: boolean; status: number; data: any },
) {
  if (result.ok) return;
  const response = typeof result.data === "string"
    ? result.data.slice(0, 500)
    : result.data;
  const { error } = await supabase.from("activity_logs").insert({
    user_id: userId,
    action: "autopilot_function_failed",
    entity_type: functionName,
    details: {
      status: result.status,
      response,
    },
  });
  if (error) {
    console.error("Failed to record autopilot function error", {
      userId,
      functionName,
      message: error.message,
    });
  }
}

type ChannelCfg = {
  channel: "feed" | "story" | "reel";
  active: boolean;
  min_interval_minutes: number;
  allowed_hours: number[];
  max_per_day: number;
  keywords: string[];
  urgent_keywords: string[];
  is_priority: boolean;
};

type ActiveQueueRow = {
  id: string;
  status: string;
  instagram_account_id: string | null;
  news_item_id: string | null;
  scheduled_for: string;
  created_at: string;
  news_items: EditorialNews | EditorialNews[] | null;
};

type PostedAccountRow = {
  instagram_account_id: string | null;
  posted_at: string | null;
};

function pickChannel(text: string, channels: ChannelCfg[]): ChannelCfg | null {
  const t = text.toLowerCase();
  const active = channels.filter(c => c.active);
  if (!active.length) return null;
  // 1) urgência: se algum canal prioritário tem palavra urgente que bate
  const priority = active.filter(c => c.is_priority);
  for (const c of priority) {
    if (c.urgent_keywords.some(k => k && t.includes(k))) return c;
  }
  // 2) match por keywords normais
  const matches = active.filter(c => c.keywords.length && c.keywords.some(k => k && t.includes(k)));
  if (matches.length) return matches[0];
  // 3) canais sem keywords (aceita tudo) — preferir não-prioritário
  const generic = active.filter(c => !c.keywords.length && !c.is_priority);
  if (generic.length) return generic[0];
  return active[0];
}

function normalizeDuplicateTitle(value?: string | null): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sameScheduledFingerprint(item: any, row: any, targetIg?: string, globalUserScope = false): boolean {
  if (!row) return false;
  if (!globalUserScope && row.instagram_account_id !== targetIg) return false;
  const rowNews = Array.isArray(row.news_items) ? row.news_items[0] : row.news_items;
  if (!rowNews) return false;
  if (row.news_item_id === item.id || rowNews.id === item.id) return true;

  const itemUrl = item.original_canonical_url || item.original_url;
  const rowUrl = rowNews.original_canonical_url || rowNews.original_url;
  if (itemUrl && rowUrl && itemUrl === rowUrl) return true;

  const itemTitle = normalizeDuplicateTitle(item.rewritten_title || item.original_title);
  const rowTitle = normalizeDuplicateTitle(rowNews.rewritten_title || rowNews.original_title);
  return itemTitle.length >= 18 && rowTitle.length >= 18 && itemTitle === rowTitle;
}

// Próximo slot livre respeitando: cooldown do canal, horários permitidos, limite diário
function nextSlotForChannel(
  cfg: ChannelCfg,
  takenByChannel: Date[],
  allTaken: Date[],
  minIntervalAcrossAccount = MIN_POST_INTERVAL_MINUTES,
): Date | null {
  // Tudo é interpretado em America/Sao_Paulo (UTC-3, sem horário de verão).
  // O servidor Deno roda em UTC, então aplicamos offset manual.
  const BRT_OFFSET_MS = 3 * 60 * 60 * 1000; // BRT = UTC - 3
  const toBRT = (d: Date) => new Date(d.getTime() - BRT_OFFSET_MS); // "vista" em BRT via UTC getters
  const fromBRT = (d: Date) => new Date(d.getTime() + BRT_OFFSET_MS); // BRT-vista -> UTC real

  const now = new Date();
  let candidate = new Date(now.getTime() + 60_000);
  const cooldownMs = cfg.min_interval_minutes * 60_000;
  const globalCooldownMs = Math.max(minIntervalAcrossAccount, MIN_POST_INTERVAL_MINUTES) * 60_000;
  const lastTakenAt = allTaken.length ? Math.max(...allTaken.map((d) => d.getTime())) : 0;
  if (lastTakenAt && candidate.getTime() < lastTakenAt + globalCooldownMs) {
    candidate = new Date(lastTakenAt + globalCooldownMs);
  }
  const nowBRT = toBRT(now);
  const todayStartBRT = new Date(nowBRT); todayStartBRT.setUTCHours(0,0,0,0);
  const todayStart = fromBRT(todayStartBRT);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const usedToday = takenByChannel.filter(d => d >= todayStart && d < todayEnd).length;
  if (usedToday >= cfg.max_per_day) return null;
  for (let guard = 0; guard < 1000; guard++) {
    const candBRT = toBRT(candidate);
    const h = candBRT.getUTCHours();
    if (cfg.allowed_hours.length && !cfg.allowed_hours.includes(h)) {
      // pula pra próxima hora permitida (em BRT)
      const nextH = cfg.allowed_hours.find(x => x > h) ?? cfg.allowed_hours[0];
      const nextBRT = new Date(candBRT);
      if (nextH > h) nextBRT.setUTCHours(nextH, 0, 0, 0);
      else { nextBRT.setUTCDate(nextBRT.getUTCDate() + 1); nextBRT.setUTCHours(nextH, 0, 0, 0); }
      candidate = fromBRT(nextBRT);
      continue;
    }
    const conflictCh = takenByChannel.some(d => Math.abs(candidate.getTime() - d.getTime()) < cooldownMs);
    const conflictAll = allTaken.some(d => Math.abs(candidate.getTime() - d.getTime()) < globalCooldownMs);
    if (!conflictCh && !conflictAll) return candidate;
    candidate = new Date(candidate.getTime() + Math.max(globalCooldownMs, cooldownMs / 4));
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Auth: only cron (internal secret from env or vault) or service role can trigger
  const envSecret = Deno.env.get("INTERNAL_CRON_SECRET") || "";
  const provided = req.headers.get("x-internal-secret") || "";
  const auth = req.headers.get("Authorization") || "";
  let vaultSecret = "";
  try {
    const { data } = await supabase.rpc("get_internal_cron_secret");
    vaultSecret = (data as string) || "";
  } catch { /* ignore */ }
  const isInternal = !!provided && (provided === envSecret || provided === vaultSecret);
  const isServiceRole = auth === `Bearer ${SERVICE_KEY}`;
  if (!isInternal && !isServiceRole) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const summary: any[] = [];

  // modo rápido: só publica o que está vencido (chamado pelo cron a cada 5 min)
  let onlyPublish = false;
  let onlyFetch = false;
  let onlyInsights = false;
  try {
    const body = await req.json().catch(() => ({}));
    onlyPublish = !!body?.only_publish;
    onlyFetch = !!body?.only_fetch;
    onlyInsights = !!body?.only_insights;
  } catch {}

  try {
    if (onlyInsights) {
      // atualiza métricas para todos os usuários com posts publicados nos últimos 30d
      const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
      const { data: usersWithPosts } = await supabase
        .from("scheduled_posts")
        .select("user_id")
        .eq("status", "posted")
        .not("ig_media_id", "is", null)
        .gte("posted_at", since);
      const ids = Array.from(new Set((usersWithPosts || []).map((s: any) => s.user_id)));
      const results: any[] = [];
      for (const uid of ids) {
        try {
          const r = await callFn("fetch-insights", { user_id: uid });
          results.push({ uid, ok: r.ok, data: r.data });
        } catch (e) { results.push({ uid, error: String(e) }); }
      }
      return new Response(JSON.stringify({ ok: true, mode: "only_insights", users: ids.length, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (onlyFetch) {
      // dispara fetch-rss para todos os usuários com fontes ativas;
      // o próprio fetch-rss respeita fetch_interval_minutes por fonte.
      const { data: allUsersWithSources } = await supabase
        .from("news_sources")
        .select("user_id")
        .eq("active", true);
      const ids = Array.from(new Set((allUsersWithSources || []).map((s: any) => s.user_id)));
      const results: any[] = [];
      for (const uid of ids) {
        try {
          const r = await callFn("fetch-rss", { user_id: uid });
          results.push({ uid, ok: r.ok, data: r.data });
        } catch (e) { results.push({ uid, error: String(e) }); }
      }
      return new Response(JSON.stringify({ ok: true, mode: "only_fetch", users: ids.length, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (onlyPublish) {
      const nowIso = new Date().toISOString();
      const stalePostingIso = new Date(Date.now() - 15 * 60_000).toISOString();
      const [{ data: usersWithSched }, { data: usersWithStalePosting }, { data: usersWithAwaitingContainer }] = await Promise.all([
        supabase
          .from("scheduled_posts")
          .select("user_id")
          .eq("status", "scheduled")
          .lte("scheduled_for", nowIso),
        supabase
          .from("scheduled_posts")
          .select("user_id")
          .eq("status", "posting")
          .lt("updated_at", stalePostingIso),
        supabase
          .from("scheduled_posts")
          .select("user_id")
          .eq("status", "awaiting_container"),
      ]);
      const dueUserIds = Array.from(new Set([
        ...(usersWithSched || []).map((s: any) => s.user_id),
        ...(usersWithStalePosting || []).map((s: any) => s.user_id),
        ...(usersWithAwaitingContainer || []).map((s: any) => s.user_id),
      ]));
      const results: any[] = [];
      for (const uid of dueUserIds) {
        try {
          const r = await callFn("publish-scheduler", { user_id: uid });
          await recordFunctionFailure(supabase, uid, "publish-scheduler", r);
          results.push({ uid, ok: r.ok, status: r.status, data: r.data });
        } catch (e) {
          results.push({ uid, error: String(e) });
        }
      }
      return new Response(JSON.stringify({ ok: true, mode: "only_publish", users: dueUserIds.length, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 0) Mantém os tokens do Instagram sempre vivos (auto-renova se faltarem ≤7 dias)
    try { await callFn("keep-ig-token-alive", {}); } catch (e) { console.error("keep-ig-token-alive failed", e); }


    // SEMPRE busca RSS para todos os usuários com fontes ativas (não só auto_approve)
    const { data: allUsersWithSources } = await supabase
      .from("news_sources")
      .select("user_id")
      .eq("active", true);
    const allUserIds = Array.from(new Set((allUsersWithSources || []).map((s: any) => s.user_id)));
    for (const uid of allUserIds) {
      try { await callFn("fetch-rss", { user_id: uid }); } catch (e) { console.error("fetch-rss failed", uid, e); }
    }

    const { data: users } = await supabase
      .from("user_settings")
      .select("user_id, auto_approve, auto_approve_enabled_at, max_posts_per_day, preferred_post_hours, default_image_style, default_media_type, min_post_interval_minutes, topics_enabled, topics_posts_per_day")
      .eq("auto_approve", true);

    // PRIMEIRO: publica o que já está vencido (rápido e prioritário) — para todos
    // os usuários, não só auto_approve. Assim, mesmo que o resto do autopilot
    // demore ou seja interrompido, posts agendados saem no horário.
    const nowIso = new Date().toISOString();
    const stalePostingIso = new Date(Date.now() - 15 * 60_000).toISOString();
    const [{ data: usersWithSched }, { data: usersWithStalePosting }, { data: usersWithAwaitingContainer }] = await Promise.all([
      supabase
        .from("scheduled_posts")
        .select("user_id")
        .eq("status", "scheduled")
        .lte("scheduled_for", nowIso),
      supabase
        .from("scheduled_posts")
        .select("user_id")
        .eq("status", "posting")
        .lt("updated_at", stalePostingIso),
      supabase
        .from("scheduled_posts")
        .select("user_id")
        .eq("status", "awaiting_container"),
    ]);
    const dueUserIds = Array.from(new Set([
      ...(usersWithSched || []).map((s: any) => s.user_id),
      ...(usersWithStalePosting || []).map((s: any) => s.user_id),
      ...(usersWithAwaitingContainer || []).map((s: any) => s.user_id),
    ]));
    for (const uid of dueUserIds) {
      try {
        const result = await callFn("publish-scheduler", { user_id: uid });
        await recordFunctionFailure(supabase, uid, "publish-scheduler", result);
      }
      catch (e) { console.error("publish-scheduler (early) failed", uid, e); }
    }

    for (const u of users || []) {
      const userId = u.user_id;
      const masterMinInterval = resolveGlobalPostInterval((u as any).min_post_interval_minutes);
      const userSummary: any = { userId, steps: {} };
      try {
        userSummary.steps.fetch = "done (global)";

        // 1.5) Retira apenas conteúdo que nunca entrou na fila dentro da janela.
        // Uma espera operacional não é uma rejeição editorial.
        const cutoffIso = new Date(Date.now() - PENDING_NEWS_MAX_AGE_HOURS * 3600 * 1000).toISOString();
        const { data: stale } = await supabase
          .from("news_items")
          .select("id, created_at")
          .eq("user_id", userId)
          .in("status", ["pending", "processed"])
          .lt("created_at", cutoffIso);
        const staleIds = (stale || []).map((s: any) => s.id);
        if (staleIds.length) {
          await supabase.from("news_items").update({
            status: "failed",
            error_message: `Expirada sem entrar na fila após ${PENDING_NEWS_MAX_AGE_HOURS}h`,
          }).in("id", staleIds);
        }
        userSummary.steps.expired = staleIds.length;

        // 2) processar pendentes — uma por Instagram livre por execução do autopilot.
        // Mantém o fluxo seguro "pegar -> carregar -> postar", mas sem travar
        // clientes com múltiplas contas quando uma conta já tem fila e outra não.
        const { data: activeQueueData } = await supabase
          .from("scheduled_posts")
          .select("id, status, instagram_account_id, news_item_id, scheduled_for, created_at, news_items(id,published_at,original_title,rewritten_title,original_content,rewritten_summary,original_image_url,generated_image_url,generated_cover_url,generated_video_url)")
          .eq("user_id", userId)
          .in("status", PUBLISH_ACTIVE_STATUSES);
        let activeQueueRows = (activeQueueData || []) as ActiveQueueRow[];

        // Uma única vaga editorial por conta. Se houver reservas antigas do
        // modelo anterior, mantém a melhor notícia (ou um envio já iniciado),
        // promove-a para o primeiro horário e cancela as reservas excedentes.
        const activeByAccount = new Map<string, ActiveQueueRow[]>();
        for (const row of activeQueueRows) {
          if (!row.instagram_account_id) continue;
          const rows = activeByAccount.get(row.instagram_account_id) || [];
          rows.push(row);
          activeByAccount.set(row.instagram_account_id, rows);
        }
        const compactedIds = new Set<string>();
        const queueRankingNowMs = Date.now();
        for (const [accountId, rows] of activeByAccount) {
          if (rows.length <= MAX_ACTIVE_QUEUE_PER_ACCOUNT) continue;
          const inFlight = rows.filter((row) => row.status === "posting" || row.status === "awaiting_container");
          const scheduled = rows.filter((row) => row.status === "scheduled");
          const keep = inFlight[0] || [...scheduled].sort((a, b) => {
            const newsA = Array.isArray(a.news_items) ? a.news_items[0] : a.news_items;
            const newsB = Array.isArray(b.news_items) ? b.news_items[0] : b.news_items;
            return compareEditorialNews(newsA || {}, newsB || {}, queueRankingNowMs);
          })[0];
          if (!keep) continue;
          const earliestScheduledFor = rows
            .map((row) => new Date(row.scheduled_for).getTime())
            .filter(Number.isFinite)
            .sort((a, b) => a - b)[0];
          if (keep.status === "scheduled" && Number.isFinite(earliestScheduledFor)) {
            await supabase.from("scheduled_posts").update({
              scheduled_for: new Date(earliestScheduledFor).toISOString(),
            }).eq("id", keep.id).eq("status", "scheduled");
          }
          const extras = scheduled.filter((row) => row.id !== keep.id);
          if (!extras.length) continue;
          const extraIds = extras.map((row) => row.id);
          const extraNewsIds = extras.map((row) => row.news_item_id).filter(Boolean);
          await supabase.from("scheduled_posts").update({
            status: "cancelled",
            error_message: "Substituída pela melhor notícia disponível na fila editorial dinâmica.",
          }).in("id", extraIds).eq("status", "scheduled");
          if (extraNewsIds.length) {
            await supabase.from("news_items").update({
              status: "rejected",
              error_message: "Superada por notícia mais nova ou mais relevante antes da publicação.",
            }).in("id", extraNewsIds).eq("status", "scheduled");
          }
          extraIds.forEach((id) => compactedIds.add(id));
          await supabase.from("activity_logs").insert({
            user_id: userId,
            action: "editorial_queue_compacted",
            entity_type: "instagram_account",
            entity_id: accountId,
            details: { kept_post_id: keep.id, cancelled_post_ids: extraIds },
          });
        }
        activeQueueRows = activeQueueRows.filter((row) => !compactedIds.has(row.id));
        const activeQueueCount = activeQueueRows.length;
        const activeQueueIgIds = new Set<string>(
          (activeQueueRows || [])
            .map((s: any) => s.instagram_account_id)
            .filter(Boolean),
        );
        const activeQueueCountByIg = new Map<string, number>();
        for (const row of activeQueueRows || []) {
          const accountId = (row as any).instagram_account_id;
          if (!accountId) continue;
          activeQueueCountByIg.set(accountId, (activeQueueCountByIg.get(accountId) || 0) + 1);
        }

        // pega TODAS as contas IG ativas (notícia carrega seu próprio IG; legado usa a 1ª)
        const { data: igAccs } = await supabase
          .from("instagram_accounts")
          .select("id, username")
          .eq("user_id", userId)
          .eq("active", true);
        const validIgIds = new Set((igAccs || []).map((a: any) => a.id));
        const fallbackAccountId = igAccs?.[0]?.id;
        let postedRows: PostedAccountRow[] = [];
        if (validIgIds.size > 0) {
          const { data } = await supabase.from("scheduled_posts")
            .select("instagram_account_id, posted_at")
            .eq("user_id", userId)
            .eq("status", "posted")
            .in("instagram_account_id", Array.from(validIgIds))
            .not("posted_at", "is", null)
            .order("posted_at", { ascending: false })
            .limit(1000);
          postedRows = (data || []) as PostedAccountRow[];
        }
        const lastPostedByAccount = new Map<string, number>();
        for (const row of postedRows) {
          if (!row.instagram_account_id || !row.posted_at || lastPostedByAccount.has(row.instagram_account_id)) continue;
          lastPostedByAccount.set(row.instagram_account_id, new Date(row.posted_at).getTime());
        }
        const canPrepareAccount = (accountId: string) => shouldPrepareNextPost(
          lastPostedByAccount.get(accountId),
          masterMinInterval,
        );
        userSummary.steps.active_instagram_accounts = (igAccs || []).map((a: any) => ({
          id: a.id,
          username: a.username,
          has_queue: activeQueueIgIds.has(a.id),
        }));

        // 2.1) Conteúdo perene por Pautas: quando ativado, gera no máximo
        // uma pauta por rodada e só se a conta estiver livre. Assim o fluxo
        // continua one-at-a-time: gerar -> processar -> agendar -> publicar.
        if ((u as any).topics_enabled && !(activeQueueCount && activeQueueCount > 0)) {
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const todayEnd = new Date(todayStart);
          todayEnd.setDate(todayEnd.getDate() + 1);
          const topicDailyLimit = Math.max(1, Math.min(5, Number((u as any).topics_posts_per_day) || 1));
          const [{ count: topicsToday }, { count: pendingTopics }, { count: activeTopics }] = await Promise.all([
            supabase
              .from("news_items")
              .select("id", { count: "exact", head: true })
              .eq("user_id", userId)
              .eq("content_type", "topic")
              .gte("published_at", todayStart.toISOString())
              .lt("published_at", todayEnd.toISOString()),
            supabase
              .from("news_items")
              .select("id", { count: "exact", head: true })
              .eq("user_id", userId)
              .eq("content_type", "topic")
              .in("status", ["pending", "processing", "processed"]),
            supabase
              .from("scheduled_posts")
              .select("id, news_items!inner(content_type)", { count: "exact", head: true })
              .eq("user_id", userId)
              .in("status", PUBLISH_ACTIVE_STATUSES)
              .eq("news_items.content_type", "topic"),
          ]);
          const canGenerateTopic =
            (topicsToday || 0) < topicDailyLimit &&
            !(pendingTopics && pendingTopics > 0) &&
            !(activeTopics && activeTopics > 0);
          if (canGenerateTopic) {
            const topicResult = await callFn("generate-from-topic", { user_id: userId });
            userSummary.steps.topic_generation = { ok: topicResult.ok, data: topicResult.data };
          } else {
            userSummary.steps.topic_generation = {
              skipped: true,
              topics_today: topicsToday || 0,
              limit: topicDailyLimit,
              pending_topics: pendingTopics || 0,
              active_topics: activeTopics || 0,
            };
          }
        }

        // Só notícias frescas e publicadas DEPOIS que o auto-piloto foi
        // ligado (ignora histórico antigo). Cron roda periodicamente, então a
        // próxima notícia só entra quando a atual estiver pronta + agendada.
        const enabledAt = (u as any).auto_approve_enabled_at as string | null;
        const sinceIso = enabledAt && new Date(enabledAt) > new Date(cutoffIso)
          ? enabledAt
          : cutoffIso;
        const { data: pendingAll } = await supabase
          .from("news_items")
          .select("id, instagram_account_id, original_title, original_content, original_image_url, original_url, original_canonical_url, published_at")
          .eq("user_id", userId)
          .eq("status", "pending")
          .gte("published_at", sinceIso)
          .order("published_at", { ascending: false, nullsFirst: false })
          .limit(50);

        // ranking editorial: recência domina; urgência, imagem e qualidade
        // escolhem a melhor notícia entre itens igualmente frescos.
        const now2 = Date.now();
        type RankedNews = { id: string; instagram_account_id: string | null; score: number; fingerprint: string | null };
        const ranked: RankedNews[] = (pendingAll || []).map((n: any) => {
          return {
            id: n.id,
            instagram_account_id: n.instagram_account_id || null,
            score: editorialNewsScore(n, now2),
            fingerprint: n.original_canonical_url || n.original_url || normalizeDuplicateTitle(n.original_title),
          };
        }).sort((a, b) => b.score - a.score);

        // Antes de pegar mais, verifica se há notícia ainda em
        // "processing" recente — se houver,
        // pula apenas a conta correspondente. Notícias além da janela comum de
        // abandono são reenfileiradas
        // com limite de tentativas. Assim uma falha transitória do process-news
        // não descarta conteúdo bom nem trava uma conta o dia inteiro.
        const stuckCutoff = new Date(Date.now() - STALE_NEWS_PROCESSING_MS).toISOString();
        const { data: stuckProcessing } = await supabase
          .from("news_items")
          .select("id, retry_count, updated_at")
          .eq("user_id", userId)
          .eq("status", "processing")
          .lt("updated_at", stuckCutoff);
        let recoveredStuckProcessing = 0;
        for (const stuck of stuckProcessing || []) {
          const recovery = decideStaleNewsRecovery((stuck as any).retry_count);
          const { data: recovered } = await supabase
            .from("news_items")
            .update({
              status: recovery.terminal ? "failed" : "pending",
              retry_count: recovery.retryCount,
              next_retry_at: null,
              error_message: recovery.errorMessage,
            })
            .eq("id", (stuck as any).id)
            .eq("user_id", userId)
            .eq("status", "processing")
            .eq("updated_at", (stuck as any).updated_at)
            .select("id")
            .maybeSingle();
          if (recovered) recoveredStuckProcessing++;
        }
        const { data: inFlightRows, count: inFlight } = await supabase
          .from("news_items")
          .select("id, instagram_account_id", { count: "exact" })
          .eq("user_id", userId)
          .eq("status", "processing")
          .gte("updated_at", stuckCutoff);
        const inFlightIgIds = new Set<string>(
          (inFlightRows || [])
            .map((n: any) => {
              if (n.instagram_account_id && validIgIds.has(n.instagram_account_id)) return n.instagram_account_id;
              return fallbackAccountId;
            })
            .filter(Boolean),
        );

        const pickedIgIds = new Set<string>();
        const pickedFingerprints = new Set<string>();
        const pending: RankedNews[] = [];
        const maxPerRun = Math.max(1, Math.min(3, validIgIds.size || 1));
        for (const item of ranked) {
          const targetIg = item.instagram_account_id && validIgIds.has(item.instagram_account_id)
            ? item.instagram_account_id
            : fallbackAccountId;
          if (!targetIg) continue;
          if ((activeQueueCountByIg.get(targetIg) || 0) >= MAX_ACTIVE_QUEUE_PER_ACCOUNT) continue;
          if (!canPrepareAccount(targetIg)) continue;
          if (inFlightIgIds.has(targetIg)) continue;
          if (pickedIgIds.has(targetIg)) continue;
          if (item.fingerprint && pickedFingerprints.has(item.fingerprint)) continue;

          pending.push(item);
          pickedIgIds.add(targetIg);
          if (item.fingerprint) pickedFingerprints.add(item.fingerprint);
          if (pending.length >= maxPerRun) break;
        }

        // process-news responde 202 e conclui em background. O autopiloto não
        // deve aguardar o resultado dentro da mesma execução: o próximo ciclo
        // agenda os itens que já chegaram a processed.
        const results = await Promise.all(pending.map(async (it) => {
          const r = await callFn("process-news", {
            user_id: userId,
            news_item_id: it.id,
            image_style: u.default_image_style || "template",
            media_type: u.default_media_type || "feed",
          });
          if (!r.ok) {
            await recordFunctionFailure(supabase, userId, "process-news", r);
            return null;
          }
          return r.status === 202 || r.data?.status === "processing" ? it.id : null;
        }));
        const processingStarted = results.filter((x): x is string => !!x);
        userSummary.steps.processed = 0;
        userSummary.steps.processing_started = processingStarted.length;
        userSummary.steps.active_queue = activeQueueCount || 0;
        userSummary.steps.active_queue_accounts = Array.from(activeQueueIgIds);
        userSummary.steps.active_queue_by_account = Object.fromEntries(activeQueueCountByIg);
        userSummary.steps.max_active_queue_per_account = MAX_ACTIVE_QUEUE_PER_ACCOUNT;
        userSummary.steps.in_flight = inFlight || 0;
        userSummary.steps.in_flight_accounts = Array.from(inFlightIgIds);
        userSummary.steps.pending_selected = pending.map((p) => ({
          id: p.id,
          instagram_account_id: p.instagram_account_id,
        }));
        userSummary.steps.requeued_stuck_processing = recoveredStuckProcessing;

        // 3) agendar processadas que ainda não estão agendadas — usando channel_settings
        const { data: ready } = await supabase
          .from("news_items")
          .select("id, rewritten_title, rewritten_summary, original_title, original_content, original_image_url, generated_image_url, generated_cover_url, generated_video_url, original_url, original_canonical_url, published_at, instagram_account_id, content_format, carousel_slides, carousel_media_urls, editorial_ready")
          .eq("user_id", userId)
          .eq("status", "processed");
        const readyRankingNowMs = Date.now();
        const rankedReady = [...(ready || [])].sort((a, b) => compareEditorialNews(a, b, readyRankingNowMs));

        const { data: existingScheduled } = await supabase
          .from("scheduled_posts")
          .select("scheduled_for, news_item_id, media_type, instagram_account_id")
          .eq("user_id", userId)
          .in("status", PUBLISH_ACTIVE_STATUSES);

        const duplicateLookbackIso = new Date(Date.now() - DUPLICATE_LOOKBACK_HOURS * 3600 * 1000).toISOString();
        const { data: recentScheduledForDupes } = await supabase
          .from("scheduled_posts")
          .select("id, status, news_item_id, instagram_account_id, scheduled_for, posted_at, updated_at, news_items(id, original_url, original_canonical_url, original_title, rewritten_title)")
          .eq("user_id", userId)
          .in("status", [...PUBLISH_ACTIVE_STATUSES, "posted"])
          .gte("updated_at", duplicateLookbackIso);
        const dupeRows: any[] = recentScheduledForDupes || [];

        const alreadyScheduledNews = new Set((existingScheduled || []).map((s) => s.news_item_id));
        const allTaken = (existingScheduled || []).map((s) => new Date(s.scheduled_for));
        const takenByCh: Record<string, Date[]> = { feed: [], story: [], reel: [] };
        (existingScheduled || []).forEach((s: any) => {
          const k = s.media_type === "story" ? "story" : s.media_type === "reel" ? "reel" : "feed";
          takenByCh[k].push(new Date(s.scheduled_for));
        });
        // Mantém uma fila curta por conta. Um item problemático não pode
        // bloquear toda a produção, mas o limite evita acúmulo sem controle.
        const activeScheduledCountByIg = new Map<string, number>();
        for (const row of existingScheduled || []) {
          if (!row.instagram_account_id) continue;
          activeScheduledCountByIg.set(
            row.instagram_account_id,
            (activeScheduledCountByIg.get(row.instagram_account_id) || 0) + 1,
          );
        }

        // carrega configurações de canais (cria defaults se faltar)
        const { data: chRows } = await supabase.from("channel_settings").select("*").eq("user_id", userId);
        const hasSavedChannelSettings = (chRows || []).length > 0;
        let channels: ChannelCfg[] = (chRows || []) as any;
        if (!channels.length) {
          channels = [
            { channel: "feed", active: true, min_interval_minutes: 60, allowed_hours: [8,9,10,11,12,13,14,15,16,17,18,19,20,21], max_per_day: 5, keywords: [], urgent_keywords: [], is_priority: false },
            { channel: "story", active: true, min_interval_minutes: 30, allowed_hours: [8,9,10,11,12,13,14,15,16,17,18,19,20,21,22], max_per_day: 10, keywords: [], urgent_keywords: ["urgente","exclusivo","morre","prisão","vaza"], is_priority: true },
            { channel: "reel", active: true, min_interval_minutes: 120, allowed_hours: [12,18,21], max_per_day: 3, keywords: [], urgent_keywords: [], is_priority: false },
          ];
        }

        // === REGRAS MESTRES vindas de Automação (user_settings) sobrescrevem channel_settings ===
        const masterMediaType = (u as any).default_media_type as string | null; // "feed" | "story" | "reel" | null
        const masterHours: number[] = Array.isArray((u as any).preferred_post_hours) && (u as any).preferred_post_hours.length
          ? (u as any).preferred_post_hours
          : [];
        const rawMasterDailyCap = (u as any).max_posts_per_day ?? 5;
        const masterDailyCap = rawMasterDailyCap < 0
          ? Number.POSITIVE_INFINITY
          : rawMasterDailyCap;
        // se Automação define um tipo padrão, FORÇA todos os canais a esse tipo
        if (masterMediaType && ["feed", "story", "reel"].includes(masterMediaType)) {
          channels = channels.map(c => ({ ...c, active: c.channel === masterMediaType }));
          // garante que o canal escolhido existe e está ativo
          if (!channels.some(c => c.channel === masterMediaType && c.active)) {
            channels.push({
              channel: masterMediaType as any, active: true,
              min_interval_minutes: masterMinInterval, allowed_hours: [], max_per_day: masterDailyCap,
              keywords: [], urgent_keywords: [], is_priority: false,
            });
          }
        }

        // Se não houver configuração específica do canal, usa os horários globais.
        // Quando o usuário configurou Feed/Story/Reel, esses horários do canal vencem.
        if (masterHours.length) {
          channels = channels.map(c => ({
            ...c,
            allowed_hours: hasSavedChannelSettings && c.allowed_hours?.length ? c.allowed_hours : masterHours,
          }));
        }

        // O intervalo global é autoritativo; cada canal mantém apenas suas
        // regras editoriais, horários e limite diário.
        channels = channels.map(c => ({
          ...c,
          min_interval_minutes: masterMinInterval,
        }));

        // === RESTRIÇÃO DE PLANO: madrugada (22h–7h BRT) só p/ Pro/Business ===
        const { data: planRow } = await supabase.rpc("get_user_plan", { _user_id: userId });
        const userPlan = (planRow as string) || "free";
        const canPostOvernight = userPlan === "pro" || userPlan === "business";
        if (!canPostOvernight) {
          const DAY_HOURS = [8,9,10,11,12,13,14,15,16,17,18,19,20,21];
          channels = channels.map(c => ({
            ...c,
            allowed_hours: c.allowed_hours.length
              ? c.allowed_hours.filter(h => DAY_HOURS.includes(h))
              : DAY_HOURS,
          }));
          channels = channels.map(c => c.allowed_hours.length ? c : { ...c, allowed_hours: DAY_HOURS });
        }

        // limite global diário (soma de todos os canais) = max_posts_per_day
        const todayStart0 = new Date(); todayStart0.setHours(0,0,0,0);
        const todayEnd0 = new Date(todayStart0); todayEnd0.setDate(todayEnd0.getDate() + 1);
        const scheduledTodayCount = (existingScheduled || []).filter((s: any) => {
          const d = new Date(s.scheduled_for);
          return d >= todayStart0 && d < todayEnd0;
        }).length;
        let remainingDailyCap = masterDailyCap < 0
          ? Number.POSITIVE_INFINITY
          : Math.max(0, masterDailyCap - scheduledTodayCount);

        const scheduledNow: { id: string; channel: string }[] = [];
        const scheduledThisRunIgIds = new Set<string>();
        if (fallbackAccountId) {
          for (const it of rankedReady) {
            if (alreadyScheduledNews.has(it.id)) continue;
            if (remainingDailyCap <= 0) break; // respeita limite global da Automação
            // Resolve qual IG usar: o vinculado à notícia (se válido) ou o fallback
            const targetIg = (it.instagram_account_id && validIgIds.has(it.instagram_account_id))
              ? it.instagram_account_id
              : fallbackAccountId;
            if (!canPrepareAccount(targetIg)) continue;
            // No máximo uma nova publicação por conta em cada tick. A fila
            // pode manter uma reserva, mas nunca é preenchida em rajada.
            if (scheduledThisRunIgIds.has(targetIg)) continue;
            const duplicateRow = dupeRows.find((row) => sameScheduledFingerprint(it, row, targetIg, true));
            if (duplicateRow) {
              await supabase.from("news_items").update({
                status: "rejected",
                error_message: "Duplicada: notícia igual já foi agendada ou publicada para outra conta deste cliente",
              }).eq("id", it.id).eq("user_id", userId);
              continue;
            }
            if ((activeScheduledCountByIg.get(targetIg) || 0) >= MAX_ACTIVE_QUEUE_PER_ACCOUNT) continue;
            const text = `${it.rewritten_title || it.original_title || ""} ${it.rewritten_summary || it.original_content || ""}`;
            const cfg = it.content_format === "carrossel"
              ? channels.find((channel) => channel.channel === "feed" && channel.active) || null
              : pickChannel(text, channels);
            if (!cfg) continue;
            const slot = nextSlotForChannel(cfg, takenByCh[cfg.channel], allTaken, masterMinInterval);
            if (!slot) continue;
            const { error } = await supabase.from("scheduled_posts").insert({
              user_id: userId,
              news_item_id: it.id,
              instagram_account_id: targetIg,
              scheduled_for: slot.toISOString(),
              status: "scheduled",
              media_type: cfg.channel,
            });
            if (!error) {
              await supabase.from("news_items").update({ status: "scheduled" }).eq("id", it.id).eq("user_id", userId);
              scheduledNow.push({ id: it.id, channel: cfg.channel });
              takenByCh[cfg.channel].push(slot);
              allTaken.push(slot);
              remainingDailyCap--;
              activeScheduledCountByIg.set(targetIg, (activeScheduledCountByIg.get(targetIg) || 0) + 1);
              scheduledThisRunIgIds.add(targetIg);
              dupeRows.push({
                news_item_id: it.id,
                instagram_account_id: targetIg,
                news_items: {
                  id: it.id,
                  original_url: it.original_url,
                  original_canonical_url: it.original_canonical_url,
                  original_title: it.original_title,
                  rewritten_title: it.rewritten_title,
                },
              });
            }
          }
        }
        userSummary.steps.scheduled = scheduledNow;
        userSummary.steps.account = fallbackAccountId ? "ok" : "missing";

        // 4) publicar o que está vencido
        const pub = await callFn("publish-scheduler", { user_id: userId });
        await recordFunctionFailure(supabase, userId, "publish-scheduler", pub);
        userSummary.steps.publish = pub.data;
      } catch (e) {
        userSummary.error = e instanceof Error ? e.message : String(e);
      }
      summary.push(userSummary);

      await supabase.from("activity_logs").insert({
        user_id: userId,
        action: "autopilot_run",
        details: userSummary,
      });
    }

    return new Response(JSON.stringify({ ok: true, users: summary.length, summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
