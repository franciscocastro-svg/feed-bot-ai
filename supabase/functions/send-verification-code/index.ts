// Generates a 6-digit code, stores only its SHA-256 hash, and emails it via
// Resend. Callable by the payments-webhook (service-role internal header) OR
// by the authenticated user (resend button, 60s cooldown enforced here).
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

const SITE_NAME = "Flux & Feed";
const PUBLIC_SITE_URL = Deno.env.get("PUBLIC_SITE_URL") || "https://fluxifeed.com";
const AUTH_EMAIL_FROM =
  Deno.env.get("AUTH_EMAIL_FROM") || "Flux & Feed <suporte@news.fluxifeed.com>";
const AUTH_EMAIL_REPLY_TO = Deno.env.get("AUTH_EMAIL_REPLY_TO") || "suporte@fluxifeed.com";
const RESEND_KEY = Deno.env.get("RESEND_API_KEY") || "";
const INTERNAL_SECRET = Deno.env.get("INTERNAL_CRON_SECRET") || "";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function genCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return (buf[0] % 1_000_000).toString().padStart(6, "0");
}

async function sendMail(to: string, code: string) {
  if (!RESEND_KEY) throw new Error("RESEND_API_KEY not configured");
  const subject = `Seu código de verificação ${SITE_NAME}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#ffffff;color:#0f172a">
      <h1 style="font-size:22px;margin:0 0 12px">Confirme seu e-mail</h1>
      <p style="font-size:15px;line-height:1.55;color:#334155">Seu pagamento foi confirmado. Use o código abaixo em até <strong>15 minutos</strong> para liberar seu painel.</p>
      <div style="margin:28px 0;padding:24px;background:#f1f5f9;border-radius:12px;text-align:center">
        <div style="font-size:36px;letter-spacing:12px;font-weight:700;color:#0f172a">${code}</div>
      </div>
      <p style="font-size:13px;color:#64748b;line-height:1.55">Se você não iniciou este cadastro, ignore este e-mail. Não compartilhe este código.</p>
      <p style="font-size:12px;color:#94a3b8;margin-top:24px">${SITE_NAME} · <a href="${PUBLIC_SITE_URL}" style="color:#94a3b8">${PUBLIC_SITE_URL}</a></p>
    </div>`;
  const text = `Seu código ${SITE_NAME}: ${code}\nExpira em 15 minutos. Não compartilhe.`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_KEY}` },
    body: JSON.stringify({
      from: AUTH_EMAIL_FROM,
      to: [to],
      reply_to: AUTH_EMAIL_REPLY_TO,
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) {
    const error = new Error("email_provider_rejected") as Error & { code: string };
    error.code = `email_provider_${res.status}`;
    throw error;
  }
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const environment = body?.environment === "live"
      ? "live"
      : body?.environment === "sandbox"
        ? "sandbox"
        : null;
    if (!environment) return json({ ok: false, error: "invalid_environment" }, 400);

    let userId: string | null = null;
    let isInternal = false;

    // Path 1: internal call from webhook with shared secret + userId in body.
    const internal = req.headers.get("x-internal-secret");
    if (INTERNAL_SECRET && internal && internal === INTERNAL_SECRET) {
      if (typeof body.user_id === "string") {
        userId = body.user_id;
        isInternal = true;
      }
    }

    // Path 2: authenticated user resend.
    if (!userId) {
      const auth = req.headers.get("Authorization") || "";
      if (!auth.startsWith("Bearer ")) {
        return json({ ok: false, error: "unauthorized" }, 401);
      }
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: auth } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) {
        return json({ ok: false, error: "unauthorized" }, 401);
      }
      userId = user.id;
    }

    // Load subscription + user email.
    const { data: sub, error: subError } = await admin
      .from("user_subscriptions")
      .select("id, approval_status, last_code_sent_at, verification_blocked_until")
      .eq("user_id", userId!)
      .eq("environment", environment)
      .eq("terminal_state", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subError) throw Object.assign(new Error("subscription_lookup_failed"), { code: "subscription_lookup_failed" });

    if (!sub) {
      return json({ ok: false, error: "payment_required" }, 402);
    }

    if (sub.approval_status === "approved") {
      return json({ ok: true, already: true });
    }

    // Gate on paid state — webhook must have moved to pending_email_verification.
    if (sub.approval_status !== "pending_email_verification") {
      return json({ ok: false, error: "payment_required" }, 402);
    }

    // Rate limit: 60s cooldown, and respect any active block.
    if (sub.verification_blocked_until && new Date(sub.verification_blocked_until) > new Date()) {
      return json({ ok: false, error: "blocked" }, 429);
    }
    if (sub.last_code_sent_at) {
      const ageSec = (Date.now() - new Date(sub.last_code_sent_at).getTime()) / 1000;
      if (ageSec < 60) {
        if (isInternal) return json({ ok: true, already: true });
        return json({ ok: false, error: "cooldown", retry_after: Math.ceil(60 - ageSec) }, 429);
      }
    }

    // Fetch email via admin API (never trust client-supplied email).
    const { data: userInfo, error: userErr } = await admin.auth.admin.getUserById(userId!);
    if (userErr || !userInfo?.user?.email) {
      console.error("verification_user_lookup_failed");
      return json({ ok: false, error: "user_lookup_failed" }, 500);
    }
    const email = userInfo.user.email;

    // Compare-and-set the cooldown timestamp before generating the code. This
    // serializes concurrent webhook deliveries without exposing a DB lock over
    // the provider request.
    const reservedAt = new Date().toISOString();
    let reservation = admin
      .from("user_subscriptions")
      .update({ last_code_sent_at: reservedAt })
      .eq("id", sub.id);
    reservation = sub.last_code_sent_at
      ? reservation.eq("last_code_sent_at", sub.last_code_sent_at)
      : reservation.is("last_code_sent_at", null);
    const { data: reserved, error: reserveError } = await reservation.select("id").maybeSingle();
    if (reserveError) throw Object.assign(new Error("code_reservation_failed"), { code: "code_reservation_failed" });
    if (!reserved) {
      if (isInternal) return json({ ok: true, already: true });
      return json({ ok: false, error: "cooldown", retry_after: 60 }, 429);
    }

    const code = genCode();
    const codeHash = await sha256Hex(code);
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();

    const { data: insertedCode, error: insErr } = await admin.from("email_verification_codes").insert({
      user_id: userId,
      code_hash: codeHash,
      expires_at: expiresAt,
    }).select("id").single();
    if (insErr) {
      await admin.from("user_subscriptions")
        .update({ last_code_sent_at: sub.last_code_sent_at })
        .eq("id", sub.id)
        .eq("last_code_sent_at", reservedAt);
      throw Object.assign(new Error("code_insert_failed"), { code: "code_insert_failed" });
    }

    try {
      await sendMail(email, code);
    } catch {
      await admin.from("email_verification_codes")
        .update({ used_at: new Date().toISOString() })
        .eq("id", insertedCode.id);
      await admin.from("user_subscriptions")
        .update({ last_code_sent_at: sub.last_code_sent_at })
        .eq("id", sub.id)
        .eq("last_code_sent_at", reservedAt);
      console.error("verification_email_delivery_failed");
      return json({ ok: false, error: "send_failed" }, 500);
    }

    // Only the accepted code remains usable. Cleanup failure is non-fatal:
    // verify_email_code always chooses the newest code.
    const { error: invalidateError } = await admin
      .from("email_verification_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("user_id", userId!)
      .neq("id", insertedCode.id)
      .is("used_at", null);
    if (invalidateError) console.error("previous_verification_code_cleanup_failed");

    return json({ ok: true });
  } catch (e) {
    console.error("send_verification_code_failed", (e as { code?: string })?.code || "internal_error");
    return json({ ok: false, error: "internal_error" }, 500);
  }
});
