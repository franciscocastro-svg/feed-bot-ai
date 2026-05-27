// Mantém os Page Access Tokens do Instagram sempre válidos.
// Roda via cron (autopilot) e:
//  1) Verifica cada conta IG ativa via /debug_token
//  2) Se for USER token -> converte para PAGE token (permanente) via /me/accounts
//  3) Se for PAGE token com expires_at definido e <= 7 dias -> re-busca via /me/accounts
//  4) Atualiza verification_status / token_expires_at / last_verified_at
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

async function refreshAccount(supabase: any, acc: any) {
  const result: any = { id: acc.id, username: acc.username };
  if (!acc.access_token || !acc.page_id) {
    result.skipped = "missing token or page_id";
    return result;
  }

  // 1) debug_token
  const dbgRes = await fetch(
    `https://graph.facebook.com/v21.0/debug_token?input_token=${acc.access_token}&access_token=${acc.access_token}`,
  );
  const dbg = await dbgRes.json();
  const type = dbg.data?.type; // USER | PAGE
  const expiresAt = dbg.data?.expires_at; // 0 = permanent
  const isValid = dbg.data?.is_valid !== false;
  result.type = type;
  result.expires_at = expiresAt;
  result.is_valid = isValid;

  const expIso = expiresAt && expiresAt > 0 ? new Date(expiresAt * 1000).toISOString() : null;
  const msUntilExp = expiresAt && expiresAt > 0 ? expiresAt * 1000 - Date.now() : Infinity;
  const needsConvert = type === "USER";
  const needsRefresh = !isValid || msUntilExp <= SEVEN_DAYS_MS;

  if (!needsConvert && !needsRefresh && type === "PAGE") {
    await supabase.from("instagram_accounts").update({
      token_expires_at: expIso,
      last_verified_at: new Date().toISOString(),
      verification_status: "ready",
    }).eq("id", acc.id);
    result.action = "ok";
    return result;
  }

  // 2/3) Buscar Page Token via /me/accounts
  const r = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?access_token=${acc.access_token}&limit=200`,
  );
  const d = await r.json();
  if (d.error) {
    await supabase.from("instagram_accounts").update({
      verification_status: "expired",
      last_verified_at: new Date().toISOString(),
    }).eq("id", acc.id);
    result.action = "error";
    result.error = d.error.message;
    return result;
  }

  const match = (d.data || []).find((p: any) => String(p.id) === String(acc.page_id));
  if (!match?.access_token) {
    await supabase.from("instagram_accounts").update({
      verification_status: "expired",
      last_verified_at: new Date().toISOString(),
    }).eq("id", acc.id);
    result.action = "no_page_match";
    return result;
  }

  const pageToken = match.access_token;
  const dbg2 = await fetch(
    `https://graph.facebook.com/v21.0/debug_token?input_token=${pageToken}&access_token=${pageToken}`,
  );
  const dbg2D = await dbg2.json();
  const newExp = dbg2D.data?.expires_at && dbg2D.data.expires_at > 0
    ? new Date(dbg2D.data.expires_at * 1000).toISOString()
    : null;

  await supabase.from("instagram_accounts").update({
    access_token: pageToken,
    token_expires_at: newExp,
    last_verified_at: new Date().toISOString(),
    verification_status: "ready",
  }).eq("id", acc.id);

  await supabase.from("activity_logs").insert({
    user_id: acc.user_id,
    action: "auto_refresh_ig_token",
    entity_type: "instagram_account",
    entity_id: acc.id,
    details: { permanent: !newExp, expires_at: newExp, was_type: type },
  });

  result.action = "refreshed";
  result.permanent = !newExp;
  result.new_expires_at = newExp;
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const internalSecret = Deno.env.get("INTERNAL_CRON_SECRET");
  const provided = req.headers.get("x-internal-secret");
  const auth = req.headers.get("Authorization") || "";
  const isInternal = internalSecret && provided === internalSecret;
  const isServiceRole = auth === `Bearer ${SERVICE_KEY}`;
  if (!isInternal && !isServiceRole) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: accounts } = await supabase
      .from("instagram_accounts")
      .select("*")
      .eq("active", true);

    const results: any[] = [];
    for (const acc of accounts || []) {
      try {
        results.push(await refreshAccount(supabase, acc));
      } catch (e) {
        results.push({ id: acc.id, error: e instanceof Error ? e.message : String(e) });
      }
    }

    return new Response(JSON.stringify({ ok: true, count: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
