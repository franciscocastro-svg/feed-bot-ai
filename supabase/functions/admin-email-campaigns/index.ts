import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]!));

type Contact = { email: string; firstName: string; plan: string; status: string };

async function resend(path: string, apiKey: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.resend.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.message || data?.error?.message || `Resend HTTP ${response.status}`);
  return data;
}

function renderEmail(campaign: any) {
  const cta = campaign.cta_label && campaign.cta_url
    ? `<p style="margin:32px 0"><a href="${escapeHtml(campaign.cta_url)}" style="background:#f32ead;color:#fff;text-decoration:none;padding:14px 22px;border-radius:10px;font-weight:700;display:inline-block">${escapeHtml(campaign.cta_label)}</a></p>` : "";
  return `<!doctype html><html><body style="margin:0;background:#f4f4f6;font-family:Arial,sans-serif;color:#18181b"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(campaign.preview_text || "")}</div><table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table width="100%" style="max-width:620px;background:#fff;border-radius:16px;overflow:hidden"><tr><td style="background:#130712;padding:24px 32px;color:#fff;font-size:24px;font-weight:800">Flux &amp; Feed</td></tr><tr><td style="padding:36px 32px"><p style="color:#f32ead;font-weight:700;margin:0 0 10px">Olá, {{{contact.first_name|cliente}}}!</p><h1 style="font-size:28px;line-height:1.2;margin:0 0 20px">${escapeHtml(campaign.heading)}</h1><div style="font-size:16px;line-height:1.7;color:#3f3f46;white-space:pre-line">${escapeHtml(campaign.body)}</div>${cta}<p style="font-size:13px;color:#71717a;margin-top:36px">Você recebeu esta mensagem porque autorizou novidades da Flux &amp; Feed.</p><p style="font-size:12px"><a href="{{{RESEND_UNSUBSCRIBE_URL}}}" style="color:#71717a">Cancelar o recebimento de comunicações</a></p></td></tr></table></td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return json({ error: "unauthorized" }, 401);
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);
    const { data: allowed } = await userClient.rpc("admin_has_permission", { _section: "email" });
    if (!allowed) return json({ error: "forbidden" }, 403);

    const admin = createClient(url, service);
    const body = await req.json().catch(() => ({}));
    const action = body.action || "status";
    const apiKey = Deno.env.get("RESEND_API_KEY") || "";
    const from = Deno.env.get("MARKETING_EMAIL_FROM") || "Flux & Feed <novidades@news.fluxifeed.com>";
    const replyTo = Deno.env.get("MARKETING_EMAIL_REPLY_TO") || "suporte@fluxifeed.com";

    if (action === "status") return json({ configured: !!apiKey, from, reply_to: replyTo });

    const getContacts = async (audience: string): Promise<Contact[]> => {
      const [{ data: profiles }, { data: subscriptions }] = await Promise.all([
        admin.from("profiles").select("id, display_name, marketing_consent, marketing_unsubscribed_at").eq("marketing_consent", true).is("marketing_unsubscribed_at", null),
        admin.from("user_subscriptions").select("user_id, plan, status"),
      ]);
      const subs = new Map((subscriptions || []).map((s: any) => [s.user_id, s]));
      const eligible = (profiles || []).filter((p: any) => {
        const sub: any = subs.get(p.id) || { plan: "free", status: "active" };
        if (audience === "active") return ["active", "trialing"].includes(sub.status);
        if (audience === "paying") return sub.plan !== "free" && ["active", "trialing"].includes(sub.status);
        if (["free", "starter", "pro", "business"].includes(audience)) return sub.plan === audience;
        return true;
      });
      const contacts: Contact[] = [];
      for (let page = 1; page <= 20; page++) {
        const { data } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
        for (const u of data.users) {
          const profile: any = eligible.find((p: any) => p.id === u.id);
          if (!profile || !u.email) continue;
          const sub: any = subs.get(u.id) || { plan: "free", status: "active" };
          contacts.push({ email: u.email, firstName: (profile.display_name || u.email.split("@")[0]).split(" ")[0], plan: sub.plan, status: sub.status });
        }
        if (data.users.length < 1000) break;
      }
      return contacts;
    };

    if (action === "audience") {
      const contacts = await getContacts(body.audience || "all_opted_in");
      return json({ count: contacts.length });
    }
    if (!apiKey) return json({ error: "resend_not_configured" }, 409);

    const { data: campaign, error } = await admin.from("email_campaigns").select("*").eq("id", body.campaign_id).single();
    if (error || !campaign) return json({ error: "campaign_not_found" }, 404);
    const html = renderEmail(campaign);

    if (action === "test") {
      if (!body.test_email || !/^\S+@\S+\.\S+$/.test(body.test_email)) return json({ error: "invalid_test_email" }, 400);
      await resend("/emails", apiKey, { method: "POST", body: JSON.stringify({ from, to: [body.test_email], reply_to: replyTo, subject: `[TESTE] ${campaign.subject}`, html: html.replace("{{{contact.first_name|cliente}}}", "cliente").replace("{{{RESEND_UNSUBSCRIBE_URL}}}", "https://fluxifeed.com") }) });
      return json({ ok: true });
    }

    if (action !== "publish" || body.confirm_text !== "ENVIAR") return json({ error: "confirmation_required" }, 400);
    if (!['draft', 'failed'].includes(campaign.status)) return json({ error: "campaign_already_processed" }, 409);
    const contacts = await getContacts(campaign.audience);
    if (contacts.length === 0) return json({ error: "empty_audience" }, 409);

    const { data: claimed } = await admin.from("email_campaigns")
      .update({ status: "sending", error_message: null, recipient_count: contacts.length })
      .eq("id", campaign.id)
      .in("status", ["draft", "failed"])
      .select("id")
      .maybeSingle();
    if (!claimed) return json({ error: "campaign_already_processed" }, 409);
    try {
      const segment = await resend("/segments", apiKey, { method: "POST", body: JSON.stringify({ name: `FluxFeed ${campaign.name} ${campaign.id.slice(0, 8)}` }) });
      for (const contact of contacts) {
        // Never force a provider-side unsubscribed contact back into marketing.
        // New contacts default to subscribed; existing suppression remains intact.
        const created = await fetch("https://api.resend.com/contacts", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ email: contact.email, first_name: contact.firstName }) });
        if (!created.ok && created.status !== 409) throw new Error(`Falha ao sincronizar ${contact.email}`);
        await resend(`/contacts/${encodeURIComponent(contact.email)}/segments/${segment.id}`, apiKey, { method: "POST" });
      }
      const broadcast = await resend("/broadcasts", apiKey, { method: "POST", body: JSON.stringify({
        segment_id: segment.id, from, reply_to: replyTo, name: campaign.name, subject: campaign.subject,
        preview_text: campaign.preview_text || undefined, html, send: true,
        scheduled_at: campaign.scheduled_at || undefined,
      }) });
      await admin.from("email_campaigns").update({
        status: campaign.scheduled_at ? "scheduled" : "sent",
        sent_at: campaign.scheduled_at ? null : new Date().toISOString(),
        provider_broadcast_id: broadcast.id, provider_segment_id: segment.id,
      }).eq("id", campaign.id);
      await admin.from("activity_logs").insert({ user_id: user.id, action: "email_campaign_publish", entity_type: "email_campaign", entity_id: campaign.id, details: { recipients: contacts.length, scheduled_at: campaign.scheduled_at } });
      return json({ ok: true, recipients: contacts.length, scheduled: !!campaign.scheduled_at });
    } catch (sendError) {
      await admin.from("email_campaigns").update({ status: "failed", error_message: sendError instanceof Error ? sendError.message : "Falha no provedor" }).eq("id", campaign.id);
      throw sendError;
    }
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "unknown" }, 500);
  }
});
