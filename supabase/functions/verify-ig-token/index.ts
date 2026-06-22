// Verifies an Instagram access token: scopes, account info, publish permission
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function isMetaRateLimit(data: any) {
  const code = data?.error?.code;
  const subcode = data?.error?.error_subcode;
  const message = data?.error?.message || "";
  return code === 4 || code === 9 || subcode === 2207051 || subcode === 2207042 || /application request limit|too many actions/i.test(message);
}

function metaError(data: any) {
  const e = data?.error;
  if (!e) return "erro desconhecido";
  return `${e.message || "erro desconhecido"}${e.code ? ` (código ${e.code}${e.error_subcode ? `/${e.error_subcode}` : ""})` : ""}`;
}

function isInstagramLoginToken(token: string) {
  return /^IG/i.test(token.trim());
}

function daysUntil(value: string | null | undefined) {
  if (!value) return null;
  return Math.floor((new Date(value).getTime() - Date.now()) / 86400000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });
    {
      const { data: approved } = await adminClient.rpc("is_approved", { _uid: user.id });
      if (approved === false) return new Response(JSON.stringify({ error: "account_not_approved" }), { status: 403, headers: corsHeaders });
    }

    const { account_id } = await req.json();
    const { data: canManageTokens } = await supabase.rpc("admin_has_permission", { _section: "tokens" });
    const accountQuery = (canManageTokens ? adminClient : supabase)
      .from("instagram_accounts").select("*").eq("id", account_id);
    const { data: acc, error } = canManageTokens
      ? await accountQuery.maybeSingle()
      : await accountQuery.eq("user_id", user.id).maybeSingle();
    if (error || !acc) throw new Error("account not found");

    const token = acc.access_token;
    if (!token) throw new Error("Conta sem access_token");

    const checks: Record<string, any> = {
      token_valid: false,
      scopes: [] as string[],
      has_publish_permission: false,
      ig_user_id_valid: false,
      ig_username: null as string | null,
      page_id_valid: false,
      page_name: null as string | null,
      expires_at: null as string | null,
      days_until_expiry: null as number | null,
      rate_limited: false,
      token_mode: isInstagramLoginToken(token) ? "instagram_login" : "facebook_graph",
      page_id_required: !isInstagramLoginToken(token),
      errors: [] as string[],
    };

    const instagramLoginToken = isInstagramLoginToken(token);

    if (instagramLoginToken) {
      try {
        const r = await fetch(`https://graph.instagram.com/v21.0/me?fields=user_id,username&access_token=${encodeURIComponent(token)}`);
        const d = await r.json();
        if (r.ok && (d.user_id || d.id)) {
          const resolvedIgUserId = String(d.user_id ?? d.id);
        checks.token_valid = true;
          checks.scopes = ["instagram_business_basic", "instagram_business_content_publish"];
          checks.has_publish_permission = true;
          checks.ig_user_id_valid = !acc.ig_user_id || String(acc.ig_user_id) === resolvedIgUserId;
          checks.ig_username = d.username || acc.username;
          checks.page_id_valid = true;
          checks.expires_at = acc.token_expires_at || null;
          checks.days_until_expiry = daysUntil(acc.token_expires_at);
          if (!checks.ig_user_id_valid) {
            checks.errors.push(`Instagram User ID diferente do token: salvo ${acc.ig_user_id}, token ${resolvedIgUserId}`);
          }
        } else if (isMetaRateLimit(d)) {
          checks.rate_limited = true;
          checks.errors.push(`Bloqueio temporário da Meta: ${metaError(d)}. Não é problema do token; aguarde algumas horas e tente verificar novamente.`);
        } else {
          checks.errors.push(`Token inválido: ${d.error?.message || JSON.stringify(d)}`);
        }
      } catch (e) {
        checks.errors.push(`instagram_me: ${e instanceof Error ? e.message : "unknown"}`);
      }
    } else {
      // 1. Debug token for Facebook Login / Page tokens
      try {
        const r = await fetch(`https://graph.facebook.com/v21.0/debug_token?input_token=${token}&access_token=${token}`);
        const d = await r.json();
        if (d.data?.is_valid) {
          checks.token_valid = true;
          checks.scopes = d.data.scopes || [];
          checks.has_publish_permission = checks.scopes.includes("instagram_content_publish") || checks.scopes.includes("instagram_business_content_publish");
          if (d.data.expires_at && d.data.expires_at > 0) {
            const exp = new Date(d.data.expires_at * 1000);
            checks.expires_at = exp.toISOString();
            checks.days_until_expiry = Math.floor((exp.getTime() - Date.now()) / 86400000);
          }
        } else if (isMetaRateLimit(d)) {
          checks.rate_limited = true;
          checks.errors.push(`Bloqueio temporário da Meta: ${metaError(d)}. Não é problema do token; aguarde algumas horas e tente verificar novamente.`);
        } else {
          checks.errors.push(`Token inválido: ${d.data?.error?.message || JSON.stringify(d)}`);
        }
      } catch (e) {
        checks.errors.push(`debug_token: ${e instanceof Error ? e.message : "unknown"}`);
      }

      // 2. Check IG user
      if (acc.ig_user_id && !checks.rate_limited) {
        try {
          const r = await fetch(`https://graph.facebook.com/v21.0/${acc.ig_user_id}?fields=id,username&access_token=${token}`);
          const d = await r.json();
          if (d.id) { checks.ig_user_id_valid = true; checks.ig_username = d.username; }
          else if (isMetaRateLimit(d)) { checks.rate_limited = true; checks.errors.push(`Bloqueio temporário da Meta: ${metaError(d)}. Aguarde algumas horas antes de nova verificação.`); }
          else checks.errors.push(`IG User: ${d.error?.message || "inválido"}`);
        } catch (e) { checks.errors.push(`ig_user: ${e instanceof Error ? e.message : "unknown"}`); }
      }

      // 3. Check Page
      if (acc.page_id && !checks.rate_limited) {
        try {
          const r = await fetch(`https://graph.facebook.com/v21.0/${acc.page_id}?fields=id,name&access_token=${token}`);
          const d = await r.json();
          if (d.id) { checks.page_id_valid = true; checks.page_name = d.name; }
          else if (isMetaRateLimit(d)) { checks.rate_limited = true; checks.errors.push(`Bloqueio temporário da Meta: ${metaError(d)}. Aguarde algumas horas antes de nova verificação.`); }
          else checks.errors.push(`Page: ${d.error?.message || "inválida"}`);
        } catch (e) { checks.errors.push(`page: ${e instanceof Error ? e.message : "unknown"}`); }
      }
    }

    const ready = !checks.rate_limited && checks.token_valid && checks.has_publish_permission && checks.ig_user_id_valid;

    // persist on the account row for the UI badge
    const updates: Record<string, unknown> = {
      token_expires_at: checks.expires_at,
      last_verified_at: new Date().toISOString(),
      verification_status: checks.rate_limited ? "warning" : (ready ? "ready" : (checks.token_valid ? "warning" : "invalid")),
      active: ready ? true : acc.active,
    };
    if (instagramLoginToken) updates.page_id = null;
    await (canManageTokens ? adminClient : supabase).from("instagram_accounts").update(updates).eq("id", account_id);

    return new Response(JSON.stringify({ ok: true, ready, ...checks }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
