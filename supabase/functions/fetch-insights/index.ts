// Busca insights (visualizações, alcance, curtidas, comentários, salvamentos) dos posts publicados no Instagram
// Throttle inteligente para NÃO saturar o limite do app na Meta:
//  - posts < 24h: refresh a cada 1h
//  - posts 1-7d: refresh a cada 6h
//  - posts > 7d: refresh a cada 24h
//  - posts > 21d: NÃO refresh (já decantaram)
// Também respeita auto-freio: se o uso do app na Meta passou do threshold, aborta.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getInstagramToken } from "../_shared/instagram-token.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function graphHost(accessToken: string) {
  return /^IG/i.test(accessToken.trim()) ? "https://graph.instagram.com" : "https://graph.facebook.com";
}

async function fetchInsights(mediaId: string, accessToken: string) {
  const metrics = "reach,likes,comments,saved,views";
  const graph = graphHost(accessToken);
  const r = await fetch(
    `${graph}/v21.0/${mediaId}/insights?metric=${metrics}&access_token=${accessToken}`,
  );
  const d = await r.json();
  if (!r.ok) {
    const r2 = await fetch(
      `${graph}/v21.0/${mediaId}/insights?metric=reach,likes,comments,saved&access_token=${accessToken}`,
    );
    const d2 = await r2.json();
    if (!r2.ok) throw new Error(d2?.error?.message || "Erro insights");
    return { data: d2.data || [], headers: r2.headers };
  }
  return { data: d.data || [], headers: r.headers };
}

function pick(insights: any[], name: string): number | null {
  const m = insights.find((i) => i.name === name);
  const v = m?.values?.[0]?.value;
  return typeof v === "number" ? v : null;
}

// Define a janela mínima entre refreshes baseada na idade do post
function refreshIntervalMs(postedAt: string | null): number | null {
  if (!postedAt) return 60 * 60 * 1000;
  const ageH = (Date.now() - new Date(postedAt).getTime()) / 3.6e6;
  if (ageH < 24) return 60 * 60 * 1000;        // 1h
  if (ageH < 24 * 7) return 6 * 60 * 60 * 1000; // 6h
  if (ageH < 24 * 21) return 24 * 60 * 60 * 1000; // 24h
  return null; // já não atualiza
}

function maxAppUsageFromHeaders(h: Headers): number {
  try {
    const raw = h.get("x-app-usage");
    if (!raw) return 0;
    const j = JSON.parse(raw);
    return Math.max(j.call_count || 0, j.call_volume || 0, j.total_time || 0, j.total_cputime || 0, j.cpu_time || 0);
  } catch { return 0; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    const body = await req.json().catch(() => ({} as any));
    let userId: string | undefined = body?.user_id;
    let supabase;
    if (userId) {
      const internalSecret = Deno.env.get("INTERNAL_CRON_SECRET");
      const provided = req.headers.get("x-internal-secret");
      if (!internalSecret || provided !== internalSecret) {
        return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });
      }
      supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    } else {
      if (!auth) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });
      supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });
      userId = user.id;
      const { data: approved } = await adminClient.rpc("is_approved", { _uid: userId });
      if (approved === false) return new Response(JSON.stringify({ error: "account_not_approved" }), { status: 403, headers: corsHeaders });
    }

    // === AUTO-FREIO: lê threshold do usuário e pula contas com uso alto ===
    const { data: settings } = await supabase
      .from("user_settings")
      .select("meta_usage_pause_threshold")
      .eq("user_id", userId)
      .maybeSingle();
    const pauseThreshold = (settings as any)?.meta_usage_pause_threshold ?? 80;

    const { data: igAccounts } = await adminClient
      .from("instagram_accounts")
      .select("id, ig_user_id")
      .eq("user_id", userId)
      .eq("active", true);

    let snapshots = 0;
    let updated = 0;
    let skippedThrottled = 0;
    let skippedHighUsage = 0;
    const errors: any[] = [];

    for (const acc of igAccounts || []) {
      if (!acc.ig_user_id) continue;
      let accessToken: string;
      try {
        accessToken = await getInstagramToken(adminClient, acc.id);
      } catch (error) {
        errors.push({ account_id: acc.id, error: error instanceof Error ? error.message : String(error) });
        continue;
      }

      // Verifica último uso desta conta
      const { data: lastUsage } = await supabase
        .from("meta_api_usage")
        .select("max_usage_percent, captured_at")
        .eq("instagram_account_id", acc.id)
        .order("captured_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastUsage && (lastUsage as any).max_usage_percent >= pauseThreshold) {
        skippedHighUsage++;
        continue; // pula conta inteira pra não piorar
      }

      // Snapshot de seguidores (1 chamada — também captura headers)
      try {
        const graph = graphHost(accessToken);
        const r = await fetch(
          `${graph}/v21.0/${acc.ig_user_id}?fields=followers_count,follows_count,media_count&access_token=${accessToken}`,
        );
        const d = await r.json();
        if (r.ok) {
          await supabase.from("follower_snapshots").insert({
            user_id: userId,
            instagram_account_id: acc.id,
            followers_count: d.followers_count ?? 0,
            follows_count: d.follows_count ?? null,
            media_count: d.media_count ?? null,
          });
          snapshots++;
        }
        // se já apertou o app aqui, para por essa conta
        if (maxAppUsageFromHeaders(r.headers) >= pauseThreshold) {
          skippedHighUsage++;
          continue;
        }
      } catch (_) { /* ignore */ }

      // Posts elegíveis (últimos 21d, com ig_media_id)
      const since = new Date(Date.now() - 21 * 24 * 3600 * 1000).toISOString();
      const { data: posts } = await supabase
        .from("scheduled_posts")
        .select("id, ig_media_id, posted_at, insights_updated_at")
        .eq("user_id", userId)
        .eq("instagram_account_id", acc.id)
        .eq("status", "posted")
        .not("ig_media_id", "is", null)
        .gte("posted_at", since)
        .order("posted_at", { ascending: false })
        .limit(200);

      // Filtra por throttle de idade
      const due = (posts || []).filter((p: any) => {
        const interval = refreshIntervalMs(p.posted_at);
        if (interval === null) return false;
        if (!p.insights_updated_at) return true;
        return Date.now() - new Date(p.insights_updated_at).getTime() >= interval;
      });
      skippedThrottled += (posts?.length || 0) - due.length;

      // Limite duro por execução para nunca passar de ~25 calls por conta
      const HARD_CAP = 25;
      const toFetch = due.slice(0, HARD_CAP);

      for (const p of toFetch) {
        try {
          const ins = await fetchInsights(p.ig_media_id, accessToken);
          const reach = pick(ins.data, "reach");
          const likes = pick(ins.data, "likes");
          const comments = pick(ins.data, "comments");
          const saves = pick(ins.data, "saved");
          const impressions = pick(ins.data, "views");
          await supabase.from("scheduled_posts").update({
            reach, likes, comments, saves, impressions,
            insights_updated_at: new Date().toISOString(),
          }).eq("id", p.id);
          updated++;

          // Auto-freio em runtime: se passou do threshold, para essa conta
          if (maxAppUsageFromHeaders(ins.headers) >= pauseThreshold) {
            skippedHighUsage++;
            break;
          }
        } catch (e) {
          errors.push({ id: p.id, error: e instanceof Error ? e.message : String(e) });
        }
      }
    }

    return new Response(JSON.stringify({ updated, snapshots, skippedThrottled, skippedHighUsage, errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
