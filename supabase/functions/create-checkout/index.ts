import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALLOWED_PRICE_LOOKUP_KEYS = new Set(["starter_monthly", "pro_monthly"]);
const CARD_BACKED_TRIAL_DAYS = 7;

function allowedOrigins(): string[] {
  return [
    "https://fluxifeed.com",
    "https://www.fluxifeed.com",
    "https://feed-bot-ai.lovable.app",
    Deno.env.get("APP_ORIGIN") || "",
    Deno.env.get("PUBLIC_APP_URL") || "",
  ].filter(Boolean);
}

function isAllowedUrl(raw: string | undefined | null): raw is string {
  if (!raw) return false;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(url.origin)) return false;
    if (url.searchParams.get("session_id") !== "{CHECKOUT_SESSION_ID}") return false;
    return allowedOrigins().some((origin) => url.origin === origin)
      || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url.origin);
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  try {
    // Authenticate caller — never trust a client-provided userId
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { priceId, returnUrl, environment } = await req.json();
    if (!priceId || !/^[a-zA-Z0-9_-]+$/.test(priceId)) throw new Error("Invalid priceId");
    if (!ALLOWED_PRICE_LOOKUP_KEYS.has(priceId)) throw new Error("Plano não permitido para checkout");
    if (!returnUrl) throw new Error("returnUrl required");
    if (!isAllowedUrl(returnUrl)) throw new Error("returnUrl não permitido");
    const env: StripeEnv = environment === "live" ? "live" : "sandbox";
    const stripe = createStripeClient(env);

    const prices = await stripe.prices.list({ lookup_keys: [priceId], active: true, limit: 1 });
    if (!prices.data.length) throw new Error("Price not found");
    const stripePrice = prices.data[0];
    const isRecurring = stripePrice.type === "recurring";
    const safeTrialDays = isRecurring ? CARD_BACKED_TRIAL_DAYS : 0;

    // Use verified user data only — ignore any client-provided userId/email
    const verifiedUserId = user.id;
    const verifiedEmail = user.email;

    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: stripePrice.id, quantity: 1 }],
      mode: isRecurring ? "subscription" : "payment",
      ui_mode: "embedded_page",
      return_url: returnUrl,
      ...(isRecurring && { payment_method_collection: "always" }),
      ...(verifiedEmail && { customer_email: verifiedEmail }),
      metadata: { userId: verifiedUserId, priceId, trialDays: String(safeTrialDays) },
      ...(isRecurring && {
        subscription_data: {
          metadata: { userId: verifiedUserId, priceId, trialDays: String(safeTrialDays) },
          ...(safeTrialDays > 0 && {
            trial_period_days: safeTrialDays,
            trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
          }),
        },
      }),
    });

    return new Response(JSON.stringify({ clientSecret: session.client_secret }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
