// Reprocessa falhas elegíveis e recupera execuções abandonadas em processing.
// O claim atômico e o fencing temporal permanecem dentro de process-news.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  decideStaleNewsRecovery,
  MAX_NEWS_PROCESSING_ATTEMPTS,
  STALE_NEWS_PROCESSING_MS,
} from "../_shared/news-processing-policy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_SECRET = Deno.env.get("INTERNAL_CRON_SECRET") || "";
const MAX_ATTEMPTS = MAX_NEWS_PROCESSING_ATTEMPTS;
const BATCH = 20;

type RetryItem = {
  id: string;
  user_id: string;
  retry_count: number | null;
  status: string;
  updated_at?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Permite chamada via cron (x-internal-secret) OU admin autenticado.
  const provided = req.headers.get("x-internal-secret") || "";
  let authorized = INTERNAL_SECRET && provided === INTERNAL_SECRET;
  if (!authorized) {
    const auth = req.headers.get("Authorization") || "";
    if (auth) {
      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
      const { data: { user } } = await userClient.auth.getUser();
      if (user) {
        const { data: isAdmin } = await userClient.rpc("is_admin");
        authorized = !!isAdmin;
      }
    }
  }
  if (!authorized) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const nowIso = new Date().toISOString();
  const staleIso = new Date(Date.now() - STALE_NEWS_PROCESSING_MS).toISOString();

  const [failedResult, staleResult] = await Promise.all([
    supabase
      .from("news_items")
      .select("id, user_id, retry_count, status")
      .eq("status", "failed")
      .lt("retry_count", MAX_ATTEMPTS)
      .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
      .order("next_retry_at", { ascending: true, nullsFirst: true })
      .limit(BATCH),
    supabase
      .from("news_items")
      .select("id, user_id, retry_count, status, updated_at")
      .eq("status", "processing")
      .lt("updated_at", staleIso)
      .order("updated_at", { ascending: true })
      .limit(BATCH),
  ]);

  if (failedResult.error || staleResult.error) {
    return new Response(JSON.stringify({ error: failedResult.error?.message || staleResult.error?.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // Um runtime encerrado por limite de CPU não executa o catch de process-news.
  // Convertemos o claim abandonado em failed de forma cercada por status e
  // updated_at antes de tentar novamente, contabilizando a tentativa perdida.
  const recoveredStale: RetryItem[] = [];
  let terminalStale = 0;
  for (const stale of staleResult.data || []) {
    const recovery = decideStaleNewsRecovery(stale.retry_count, MAX_ATTEMPTS);
    const { data: recovered, error: recoveryError } = await supabase
      .from("news_items")
      .update({
        status: "failed",
        retry_count: recovery.retryCount,
        next_retry_at: recovery.terminal ? null : nowIso,
        error_message: recovery.errorMessage,
      })
      .eq("id", stale.id)
      .eq("user_id", stale.user_id)
      .eq("status", "processing")
      .eq("updated_at", stale.updated_at)
      .select("id, user_id, retry_count, status")
      .maybeSingle();
    if (recoveryError) {
      console.error("stale processing recovery failed", recoveryError.message);
      continue;
    }
    if (!recovered) continue;
    if (recovery.terminal) terminalStale++;
    else recoveredStale.push(recovered);
  }

  const items = [...recoveredStale, ...(failedResult.data || [])]
    .filter((item, index, rows) => rows.findIndex((row) => row.id === item.id) === index)
    .slice(0, BATCH);

  let processed = 0;
  const results: Array<{ id: string; ok: boolean; status?: number; error?: string }> = [];

  for (const item of items) {
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/process-news`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
          "Content-Type": "application/json",
          "x-internal-secret": INTERNAL_SECRET,
        },
        body: JSON.stringify({ news_item_id: item.id, user_id: item.user_id }),
      });
      const text = await r.text();
      processed++;
      results.push({ id: item.id, ok: r.ok, status: r.status });
      if (!r.ok) console.error("retry process-news fail", item.id, r.status, text.slice(0, 200));
    } catch (e) {
      results.push({ id: item.id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return new Response(JSON.stringify({
    ok: true,
    processed,
    stale_recovered: recoveredStale.length,
    stale_terminal: terminalStale,
    results,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
