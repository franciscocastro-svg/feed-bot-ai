// Admin-only: gera um magic link para logar como outro usuário (suporte/debug).
// Apenas usuários com role 'admin' podem chamar. Retorna a URL — o admin abre
// numa aba anônima pra não derrubar a própria sessão.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });

    // Verifica se quem chamou é admin
    const { data: roleRow } = await userClient
      .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: corsHeaders });

    const { target_user_id, redirect_to } = await req.json();
    if (!target_user_id) throw new Error("target_user_id obrigatório");

    const admin = createClient(url, service);
    const { data: target, error: tErr } = await admin.auth.admin.getUserById(target_user_id);
    if (tErr || !target?.user?.email) throw new Error("Usuário alvo não encontrado");

    // Audit log
    await admin.from("activity_logs").insert({
      user_id: user.id,
      action: "admin_impersonate",
      entity_type: "user",
      entity_id: target_user_id,
      details: { target_email: target.user.email },
    });

    const { data: link, error: lErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: target.user.email,
      options: { redirectTo: redirect_to || `${new URL(req.url).origin}/dashboard` },
    });
    if (lErr) throw lErr;

    return new Response(JSON.stringify({
      ok: true,
      url: link.properties?.action_link,
      email: target.user.email,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
