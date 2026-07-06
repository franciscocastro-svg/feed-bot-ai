// Autopilot: roda em cron, orquestra fetch -> process -> schedule -> publish
// para todos os usuários com auto_approve = true
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SAFE_MIN_MINUTES_BETWEEN_POSTS = 10;
const PUBLISH_ACTIVE_STATUSES = ["scheduled", "posting", "awaiting_container"];

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

function sameScheduledFingerprint(item: any, row: any, targetIg: string): boolean {
  if (!row || row.instagram_account_id !== targetIg) return false;
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

async function waitForProcessedNews(supabase: any, userId: string, newsItemId: string, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    const { data, error } = await supabase
      .from("news_items")
      .select("id, status, error_message")
      .eq("user_id", userId)
      .eq("id", newsItemId)
      .maybeSingle();
    
    if (error) {
      console.warn(`[wait] error fetching news ${newsItemId}:`, error);
      continue;
    }

    if (data && ["processed", "failed", "rejected", "scheduled", "posted"].includes(String(data.status))) return data;
  }
  console.warn(`[wait] timeout waiting for news ${newsItemId} to process after ${timeoutMs}ms`);
  return null;
}

// Próximo slot livre respeitando: cooldown do canal, horários permitidos, limite diário
function nextSlotForChannel(
  cfg: ChannelCfg,
  takenByChannel: Date[],
  allTaken: Date[],
  minIntervalAcrossAccount = SAFE_MIN_MINUTES_BETWEEN_POSTS,
): Date | null {
  // Tudo é interpretado em America/Sao_Paulo (UTC-3, sem horário de verão).
  // O servidor Deno roda em UTC, então aplicamos offset manual.
  const BRT_OFFSET_MS = 3 * 60 * 60 * 1000; // BRT = UTC - 3
  const toBRT = (d: Date) => new Date(d.getTime() - BRT_OFFSET_MS); // "vista" em BRT via UTC getters
  const fromBRT = (d: Date) => new Date(d.getTime() + BRT_OFFSET_MS); // BRT-vista -> UTC real

  const now = new Date();
  let candidate = new Date(now.getTime() + 60_000);
  const cooldownMs = cfg.min_interval_minutes * 60_000;
  const globalCooldownMs = Math.max(minIntervalAcrossAccount, SAFE_MIN_MINUTES_BETWEEN_POSTS) * 60_000;
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

const MAX_NEWS_AGE_HOURS = 12;

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
          results.push({ uid, ok: r.ok });
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
      try { await callFn("publish-scheduler", { user_id: uid }); }
      catch (e) { console.error("publish-scheduler (early) failed", uid, e); }
    }

    for (const u of users || []) {
      const userId = u.user_id;
      const userSummary: any = { userId, steps: {} };
      try {
        userSummary.steps.fetch = "done (global)";

        // 1.5) expirar pendentes/processadas com mais de 12h e cancelar agendamentos vencidos
        const cutoffIso = new Date(Date.now() - MAX_NEWS_AGE_HOURS * 3600 * 1000).toISOString();
        const { data: stale } = await supabase
          .from("news_items")
          .select("id")
          .eq("user_id", userId)
          .in("status", ["pending", "processed"])
          .lt("published_at", cutoffIso);
        const staleIds = (stale || []).map((s: any) => s.id);
        if (staleIds.length) {
          await supabase.from("news_items").update({ status: "rejected", error_message: "Notícia com mais de 12h" }).in("id", staleIds);
          await supabase.from("scheduled_posts").update({ status: "cancelled", error_message: "Notícia expirou (>12h)" })
            .eq("user_id", userId).eq("status", "scheduled").in("news_item_id", staleIds);
        }
        userSummary.steps.expired = staleIds.length;

        // 2) processar pendentes — uma por Instagram livre por execução do autopilot.
        // Mantém o fluxo seguro "pegar -> carregar -> postar", mas sem travar
        // clientes com múltiplas contas quando uma conta já tem fila e outra não.
        const { data: activeQueueRows, count: activeQueueCount } = await supabase
          .from("scheduled_posts")
          .select("id, instagram_account_id", { count: "exact" })
          .eq("user_id", userId)
          .in("status", PUBLISH_ACTIVE_STATUSES);
        const activeQueueIgIds = new Set<string>(
          (activeQueueRows || [])
            .map((s: any) => s.instagram_account_id)
            .filter(Boolean),
        );

        // pega TODAS as contas IG ativas (notícia carrega seu próprio IG; legado usa a 1ª)
        const { data: igAccs } = await supabase
          .from("instagram_accounts")
          .select("id, username")
          .eq("user_id", userId)
          .eq("active", true);
        const validIgIds = new Set((igAccs || []).map((a: any) => a.id));
        const fallbackAccountId = igAccs?.[0]?.id;
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

        // Só notícias frescas (<12h) E publicadas DEPOIS que o auto-piloto foi
        // ligado (ignora histórico antigo). Cron roda periodicamente, então a
        // próxima notícia só entra quando a atual estiver pronta + agendada.
        const enabledAt = (u as any).auto_approve_enabled_at as string | null;
        const sinceIso = enabledAt && new Date(enabledAt) > new Date(cutoffIso)
          ? enabledAt
          : cutoffIso;
        const { data: pendingAll } = await supabase
          .from("news_items")
          .select("id, instagram_account_id, original_title, original_content, original_image_url, published_at")
          .eq("user_id", userId)
          .eq("status", "pending")
          .gte("published_at", sinceIso)
          .order("published_at", { ascending: false, nullsFirst: false })
          .limit(50);

        // ranking de engajamento: recência + imagem + palavras virais + corpo
        const VIRAL = /\b(urgente|exclusivo|bombou|chocante|polêmica|polemica|escândalo|escandalo|revela|revelad[oa]|surpreende|surpreendente|inédit[oa]|inedit[oa]|recorde|histórico|historico|morre|morreu|morte|prisão|prisao|preso|presa|vaza|vazou|confirma|confirmad[oa]|anuncia|anunciad[oa]|novo|nova|primeira vez|nunca visto|impressionante|viral)\b/gi;
        const now2 = Date.now();
        type RankedNews = { id: string; instagram_account_id: string | null; score: number };
        const ranked: RankedNews[] = (pendingAll || []).map((n: any) => {
          const ageH = n.published_at ? (now2 - new Date(n.published_at).getTime()) / 3.6e6 : 999;
          const recency = Math.max(0, 100 - ageH * 6);
          const titleLen = (n.original_title?.length || 0);
          const titleScore = titleLen >= 40 && titleLen <= 100 ? 30 : Math.min(20, titleLen / 5);
          const hasImage = n.original_image_url ? 25 : 0;
          const bodyScore = Math.min(20, ((n.original_content?.length || 0) / 200));
          const viralMatches = ((n.original_title || "") + " " + (n.original_content || "")).match(VIRAL)?.length || 0;
          const viralScore = Math.min(40, viralMatches * 10);
          return {
            id: n.id,
            instagram_account_id: n.instagram_account_id || null,
            score: recency + titleScore + hasImage + bodyScore + viralScore,
          };
        }).sort((a, b) => b.score - a.score);

        // Antes de pegar mais, verifica se há notícia ainda em
        // "processing" (sendo trabalhada nos últimos 15 min) — se houver,
        // pula apenas a conta correspondente. Notícias presas há >15 min são reenfileiradas
        // com limite de tentativas. Assim uma falha transitória do process-news
        // não descarta conteúdo bom nem trava uma conta o dia inteiro.
        const stuckCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        const { data: stuckProcessing } = await supabase
          .from("news_items")
          .select("id, retry_count")
          .eq("user_id", userId)
          .eq("status", "processing")
          .lt("updated_at", stuckCutoff);
        for (const stuck of stuckProcessing || []) {
          const nextRetry = Number((stuck as any).retry_count || 0) + 1;
          if (nextRetry >= 4) {
            await supabase
              .from("news_items")
              .update({
                status: "failed",
                retry_count: nextRetry,
                error_message: "Processamento travou repetidas vezes. Verifique logs da Edge Function process-news.",
              })
              .eq("id", (stuck as any).id)
              .eq("user_id", userId);
          } else {
            await supabase
              .from("news_items")
              .update({
                status: "pending",
                retry_count: nextRetry,
                error_message: `Processamento travou >15min. Reenfileirado automaticamente (tentativa ${nextRetry}/3).`,
              })
              .eq("id", (stuck as any).id)
              .eq("user_id", userId);
          }
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
        const pending: RankedNews[] = [];
        const maxPerRun = Math.max(1, Math.min(3, validIgIds.size || 1));
        for (const item of ranked) {
          const targetIg = item.instagram_account_id && validIgIds.has(item.instagram_account_id)
            ? item.instagram_account_id
            : fallbackAccountId;
          if (!targetIg) continue;
          if (activeQueueIgIds.has(targetIg)) continue;
          if (inFlightIgIds.has(targetIg)) continue;
          if (pickedIgIds.has(targetIg)) continue;

          pending.push(item);
          pickedIgIds.add(targetIg);
          if (pending.length >= maxPerRun) break;
        }

        const results = await Promise.all(pending.map(async (it) => {
          const r = await callFn("process-news", {
            user_id: userId,
            news_item_id: it.id,
            image_style: u.default_image_style || "template",
            media_type: u.default_media_type || "feed",
            sync: true,
          });
          if (!r.ok) return null;
          const done = await waitForProcessedNews(supabase, userId, it.id);
          return done?.status === "processed" ? it.id : null;
        }));
        const processed = results.filter((x): x is string => !!x);
        userSummary.steps.processed = processed.length;
        userSummary.steps.active_queue = activeQueueCount || 0;
        userSummary.steps.active_queue_accounts = Array.from(activeQueueIgIds);
        userSummary.steps.in_flight = inFlight || 0;
        userSummary.steps.in_flight_accounts = Array.from(inFlightIgIds);
        userSummary.steps.pending_selected = pending.map((p) => ({
          id: p.id,
          instagram_account_id: p.instagram_account_id,
        }));
        userSummary.steps.requeued_stuck_processing = (stuckProcessing || []).length;

        // 3) agendar processadas que ainda não estão agendadas — usando channel_settings
        const { data: ready } = await supabase
          .from("news_items")
          .select("id, rewritten_title, rewritten_summary, original_title, original_content, original_url, original_canonical_url, instagram_account_id")
          .eq("user_id", userId)
          .eq("status", "processed");

        const { data: existingScheduled } = await supabase
          .from("scheduled_posts")
          .select("scheduled_for, news_item_id, media_type, instagram_account_id")
          .eq("user_id", userId)
          .in("status", PUBLISH_ACTIVE_STATUSES);

        const duplicateLookbackIso = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
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
        // ⚠️ ONE-AT-A-TIME (autopilot): se a conta IG já tem QUALQUER post
        // pendente (scheduled/posting), o autopilot NÃO enfileira mais nada
        // pra ela. O próximo só é gerado depois que o atual for publicado.
        // Isso evita filas longas e o efeito de "rajada" quando o sistema
        // fica fechado a noite toda. Manual continua livre.
        const igWithPending = new Set<string>(
          (existingScheduled || [])
            .map((s: any) => s.instagram_account_id)
            .filter(Boolean),
        );

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
        const masterMinInterval = Math.max(
          Number((u as any).min_post_interval_minutes) || SAFE_MIN_MINUTES_BETWEEN_POSTS,
          SAFE_MIN_MINUTES_BETWEEN_POSTS,
        );

        // se Automação define um tipo padrão, FORÇA todos os canais a esse tipo
        if (masterMediaType && ["feed", "story", "reel"].includes(masterMediaType)) {
          channels = channels.map(c => ({ ...c, active: c.channel === masterMediaType }));
          // garante que o canal escolhido existe e está ativo
          if (!channels.some(c => c.channel === masterMediaType && c.active)) {
            channels.push({
              channel: masterMediaType as any, active: true,
              min_interval_minutes: 60, allowed_hours: [], max_per_day: masterDailyCap,
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

        // Cada canal usa o próprio min_interval_minutes / max_per_day.
        // O valor global de Automação serve apenas como piso de segurança.
        channels = channels.map(c => ({
          ...c,
          min_interval_minutes: Math.max(c.min_interval_minutes, masterMinInterval),
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
        if (fallbackAccountId) {
          for (const it of ready || []) {
            if (alreadyScheduledNews.has(it.id)) continue;
            if (remainingDailyCap <= 0) break; // respeita limite global da Automação
            // Resolve qual IG usar: o vinculado à notícia (se válido) ou o fallback
            const targetIg = (it.instagram_account_id && validIgIds.has(it.instagram_account_id))
              ? it.instagram_account_id
              : fallbackAccountId;
            const duplicateRow = dupeRows.find((row) => sameScheduledFingerprint(it, row, targetIg));
            if (duplicateRow) {
              await supabase.from("news_items").update({
                status: "rejected",
                error_message: "Duplicada: notícia igual já foi agendada ou publicada para esta conta",
              }).eq("id", it.id).eq("user_id", userId);
              continue;
            }
            // ONE-AT-A-TIME: se essa conta já tem post pendente, não enfileira outro
            if (igWithPending.has(targetIg)) continue;
            const text = `${it.rewritten_title || it.original_title || ""} ${it.rewritten_summary || it.original_content || ""}`;
            const cfg = pickChannel(text, channels);
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
              igWithPending.add(targetIg); // bloqueia outras na mesma rodada
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
