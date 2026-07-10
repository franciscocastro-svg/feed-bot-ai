// Converte o user access token (60d) num Page Access Token permanente.
// Para tokens derivados de um long-lived user token, o page token retornado
// por /me/accounts NÃO expira (Meta/Graph API).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getInstagramToken } from "../_shared/instagram-token.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function isInstagramLoginToken(token: string) {
  return /^IG/i.test(token.trim());
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
    const accountQuery = adminClient
      .from("instagram_accounts").select("*").eq("id", account_id);
    const { data: acc, error } = canManageTokens
      ? await accountQuery.maybeSingle()
      : await accountQuery.eq("user_id", user.id).maybeSingle();
    if (error || !acc) throw new Error("Conta não encontrada");
    const dataClient = adminClient;
    const currentToken = await getInstagramToken(adminClient, account_id);
    if (isInstagramLoginToken(currentToken)) {
      const refreshUrl = new URL("https://graph.instagram.com/refresh_access_token");
      refreshUrl.searchParams.set("grant_type", "ig_refresh_token");
      refreshUrl.searchParams.set("access_token", currentToken);
      const refreshRes = await fetch(refreshUrl.toString());
      const refreshData = await refreshRes.json();
      const nextToken = refreshRes.ok && refreshData.access_token ? refreshData.access_token : currentToken;
      const expiresIn = Number(refreshData.expires_in || 60 * 24 * 3600);
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      const meRes = await fetch(`https://graph.instagram.com/v21.0/me?fields=user_id,username&access_token=${encodeURIComponent(nextToken)}`);
      const me = await meRes.json();
      if (!meRes.ok || !(me.user_id || me.id)) {
        throw new Error(`Meta: ${me.error?.message || "não foi possível validar o token do Instagram"}`);
      }

      await dataClient.from("instagram_accounts").update({
        username: me.username || acc.username,
        ig_user_id: String(me.user_id ?? me.id),
        page_id: null,
        access_token: nextToken,
        token_expires_at: expiresAt,
        last_verified_at: new Date().toISOString(),
        verification_status: "ready",
        active: true,
      }).eq("id", account_id);

      return new Response(JSON.stringify({
        ok: true,
        permanent: false,
        expires_at: expiresAt,
        message: refreshRes.ok && refreshData.access_token
          ? `Token do Instagram renovado até ${new Date(expiresAt).toLocaleDateString("pt-BR")}.`
          : `Token do Instagram validado. Esta conexão usa OAuth direto do Instagram e expira em ${new Date(expiresAt).toLocaleDateString("pt-BR")}.`,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!acc.page_id) throw new Error("Page ID não configurado");

    // 0) Detecta tipo do token atual. Se já for PAGE, não há o que renovar.
    const dbgCur = await fetch(`https://graph.facebook.com/v21.0/debug_token?input_token=${currentToken}&access_token=${currentToken}`);
    const dbgCurD = await dbgCur.json();
    const curType = dbgCurD.data?.type; // "USER" | "PAGE"
    const curExpires = dbgCurD.data?.expires_at;

    if (curType === "PAGE") {
      const expIso = curExpires && curExpires > 0 ? new Date(curExpires * 1000).toISOString() : null;
      await dataClient.from("instagram_accounts").update({
        token_expires_at: expIso,
        last_verified_at: new Date().toISOString(),
        verification_status: "ready",
      }).eq("id", account_id);
      return new Response(JSON.stringify({
        ok: true, permanent: !expIso, expires_at: expIso,
        message: expIso
          ? `Token já é Page Token. Expira em ${new Date(expIso).toLocaleDateString("pt-BR")}`
          : "Esse token já é o Page Access Token permanente. Nada a fazer ✅",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 1) É User Token → busca o Page Access Token via /me/accounts
    const r = await fetch(`https://graph.facebook.com/v21.0/me/accounts?access_token=${currentToken}&limit=200`);
    const d = await r.json();
    if (d.error) throw new Error(`Meta: ${d.error.message}`);
    const pages = d.data || [];
    const match = pages.find((p: any) => String(p.id) === String(acc.page_id));
    if (!match) {
      const found = pages.map((p: any) => `${p.name} (${p.id})`).join(", ") || "nenhuma";
      throw new Error(`Page ${acc.page_id} não está entre as gerenciadas. Páginas encontradas: ${found}`);
    }
    const pageToken = match.access_token;
    if (!pageToken) throw new Error("Meta não retornou access_token da página (verifique permissões pages_show_list, pages_manage_posts).");

    // 3) Verifica se esse novo token é "permanente" (data_access_expires_at pode existir; expires_at = 0)
    const dbg = await fetch(`https://graph.facebook.com/v21.0/debug_token?input_token=${pageToken}&access_token=${pageToken}`);
    const dbgD = await dbg.json();
    let newExpiresAt: string | null = null;
    if (dbgD.data?.expires_at && dbgD.data.expires_at > 0) {
      newExpiresAt = new Date(dbgD.data.expires_at * 1000).toISOString();
    }

    await dataClient.from("instagram_accounts").update({
      access_token: pageToken,
      token_expires_at: newExpiresAt, // null = permanente
      last_verified_at: new Date().toISOString(),
      verification_status: "ready",
    }).eq("id", account_id);

    await dataClient.from("activity_logs").insert({
      user_id: acc.user_id, action: "refresh_ig_token", entity_type: "instagram_account", entity_id: account_id,
      details: { page_id: acc.page_id, expires_at: newExpiresAt, permanent: !newExpiresAt, performed_by: user.id },
    });

    return new Response(JSON.stringify({
      ok: true,
      permanent: !newExpiresAt,
      expires_at: newExpiresAt,
      message: newExpiresAt
        ? `Token renovado. Nova expiração: ${new Date(newExpiresAt).toLocaleDateString("pt-BR")}`
        : "Token permanente da Página obtido com sucesso! Não expira mais.",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
