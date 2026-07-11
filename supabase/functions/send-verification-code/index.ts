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
    const body = await res.text();
    throw new Error(`resend_${res.status}: ${body.slice(0, 200)}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    let userId: string | null = null;
    let isInternal = false;

    // Path 1: internal call from webhook with shared secret + userId in body.
    const internal = req.headers.get("x-internal-secret");
    if (INTERNAL_SECRET && internal && internal === INTERNAL_SECRET) {
      const body = await req.json().catch(() => ({}));
      if (typeof body.user_id === "string") {
        userId = body.user_id;
        isInternal = true;
      }
    }

    // Path 2: authenticated user resend.
    if (!userId) {
      const auth = req.headers.get("Authorization") || "";
      if (!auth.startsWith("Bearer ")) {
        return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: auth } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) {
        return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = user.id;
    }

    // Load subscription + user email.
    const { data: sub } = await admin
      .from("user_subscriptions")
      .select("approval_status, last_code_sent_at, verification_blocked_until")
      .eq("user_id", userId!)
      .maybeSingle();

    if (!sub) {
      // Do not leak account existence to unauthenticated callers.
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (sub.approval_status === "approved") {
      return new Response(JSON.stringify({ ok: true, already: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Gate on paid state — webhook must have moved to pending_email_verification.
    if (!isInternal && sub.approval_status !== "pending_email_verification") {
      return new Response(JSON.stringify({ ok: false, error: "payment_required" }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Rate limit: 60s cooldown, and respect any active block.
    if (sub.verification_blocked_until && new Date(sub.verification_blocked_until) > new Date()) {
      return new Response(JSON.stringify({ ok: false, error: "blocked" }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!isInternal && sub.last_code_sent_at) {
      const ageSec = (Date.now() - new Date(sub.last_code_sent_at).getTime()) / 1000;
      if (ageSec < 60) {
        return new Response(
          JSON.stringify({ ok: false, error: "cooldown", retry_after: Math.ceil(60 - ageSec) }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Fetch email via admin API (never trust client-supplied email).
    const { data: userInfo, error: userErr } = await admin.auth.admin.getUserById(userId!);
    if (userErr || !userInfo?.user?.email) {
      console.error("admin.getUserById failed", userErr?.message);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const email = userInfo.user.email;

    // Invalidate previous codes (idempotent per resend).
    await admin
      .from("email_verification_codes")
      .update({ used_at: new Date().toISOString() })
      .eq("user_id", userId!)
      .is("used_at", null);

    const code = genCode();
    const codeHash = await sha256Hex(code);
    const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();

    const { error: insErr } = await admin.from("email_verification_codes").insert({
      user_id: userId,
      code_hash: codeHash,
      expires_at: expiresAt,
    });
    if (insErr) throw insErr;

    await admin
      .from("user_subscriptions")
      .update({ last_code_sent_at: new Date().toISOString() })
      .eq("user_id", userId!);

    try {
      await sendMail(email, code);
    } catch (e) {
      console.error("send failed", (e as Error).message);
      // Don't leak details; caller can retry after cooldown.
      return new Response(JSON.stringify({ ok: false, error: "send_failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-verification-code error", (e as Error).message);
    return new Response(JSON.stringify({ ok: false, error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
