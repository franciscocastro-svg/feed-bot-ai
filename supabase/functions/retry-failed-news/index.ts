// Re-enfileira notícias com status=failed que ainda têm tentativas restantes
// (retry_count < 3) e cujo next_retry_at já passou.
// Backoff exponencial é aplicado pelo process-news ao falhar de novo.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTERNAL_SECRET = Deno.env.get("INTERNAL_CRON_SECRET") || "";
const MAX_ATTEMPTS = 3;
const BATCH = 20;

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

  const { data: items, error } = await supabase
    .from("news_items")
    .select("id, user_id, retry_count")
    .eq("status", "failed")
    .lt("retry_count", MAX_ATTEMPTS)
    .or(`next_retry_at.is.null,next_retry_at.lte.${nowIso}`)
    .order("next_retry_at", { ascending: true, nullsFirst: true })
    .limit(BATCH);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let processed = 0;
  const results: Array<{ id: string; ok: boolean; status?: number; error?: string }> = [];

  for (const item of items || []) {
    try {
      // Marca como pending para evitar requeue duplicado se a chamada demorar.
      await supabase.from("news_items").update({ status: "pending", next_retry_at: null }).eq("id", item.id);

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

  return new Response(JSON.stringify({ ok: true, processed, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
