// Faz uma chamada barata à Meta Graph API para CADA conta IG ativa do usuário,
// captura os headers X-App-Usage / X-Business-Use-Case-Usage e persiste em
// meta_api_usage. Permite ver o uso atual em tempo real no dashboard sem
// precisar publicar.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GRAPH = "https://graph.facebook.com/v21.0";
const IG_GRAPH = "https://graph.instagram.com/v21.0";

function graphBase(accessToken: string) {
  return /^IG/i.test(accessToken.trim()) ? IG_GRAPH : GRAPH;
}

function parseUsage(res: Response, igUserId?: string | null) {
  const appRaw = res.headers.get("x-app-usage");
  const bucRaw = res.headers.get("x-business-use-case-usage");
  if (!appRaw && !bucRaw) return null;
  let app: any = null, buc: any = null;
  try { app = appRaw ? JSON.parse(appRaw) : null; } catch { /* ignore */ }
  try { buc = bucRaw ? JSON.parse(bucRaw) : null; } catch { /* ignore */ }
  // Facebook Graph: { call_count, total_time, total_cputime }
  // Instagram Graph: { call_volume, cpu_time, total_time }
  const appCallCount = Number(app?.call_count ?? app?.call_volume ?? 0);
  const appTotalTime = Number(app?.total_time ?? 0);
  const appTotalCpuTime = Number(app?.total_cputime ?? app?.cpu_time ?? 0);
  let bucEntry: any = null;
  if (buc && typeof buc === "object") {
    const list = (igUserId && Array.isArray(buc[igUserId])) ? buc[igUserId] : null;
    const fallback = list || (Object.values(buc).flat() as any[]);
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
    bucEstimated, maxPercent, rawApp: app, rawBuc: buc,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = req.headers.get("Authorization") || "";

  const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
  const { data: userRes, error: uErr } = await userClient.auth.getUser();
  if (uErr || !userRes?.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
  const userId = userRes.user.id;
  const admin = createClient(url, service);

  const { data: accounts, error: aErr } = await admin
    .from("instagram_accounts")
    .select("id, username, ig_user_id, access_token, active")
    .eq("user_id", userId)
    .eq("active", true);
  if (aErr) {
    return new Response(JSON.stringify({ error: aErr.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const results: any[] = [];
  for (const acc of accounts || []) {
    if (!acc.access_token || !acc.ig_user_id) {
      results.push({ id: acc.id, username: acc.username, skipped: "missing token or ig_user_id" });
      continue;
    }
    try {
      const r = await fetch(`${graphBase(acc.access_token)}/${acc.ig_user_id}?fields=id&access_token=${encodeURIComponent(acc.access_token)}`);
      const snap = parseUsage(r, acc.ig_user_id);
      if (!snap) {
        results.push({ id: acc.id, username: acc.username, ok: r.ok, no_headers: true });
        continue;
      }
      await admin.from("meta_api_usage").insert({
        user_id: userId,
        instagram_account_id: acc.id,
        app_call_count: snap.appCallCount,
        app_total_time: snap.appTotalTime,
        app_total_cputime: snap.appTotalCpuTime,
        buc_call_count: snap.bucCallCount,
        buc_total_time: snap.bucTotalTime,
        buc_total_cputime: snap.bucTotalCpuTime,
        buc_estimated_time_to_regain_access: snap.bucEstimated,
        max_usage_percent: snap.maxPercent,
        raw_app_usage: snap.rawApp,
        raw_buc_usage: snap.rawBuc,
      });
      results.push({
        id: acc.id, username: acc.username, ok: r.ok,
        max_usage_percent: snap.maxPercent,
        app: { call_count: snap.appCallCount, total_time: snap.appTotalTime, total_cputime: snap.appTotalCpuTime },
        buc: { call_count: snap.bucCallCount, total_time: snap.bucTotalTime, total_cputime: snap.bucTotalCpuTime, regain_min: snap.bucEstimated },
      });
    } catch (e: any) {
      results.push({ id: acc.id, username: acc.username, error: String(e?.message || e) });
    }
  }

  return new Response(JSON.stringify({ refreshed: results.length, results }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
