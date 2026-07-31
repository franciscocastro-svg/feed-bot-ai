import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";
import {
  customerForCheckout,
  isBlockingStoredSubscription,
  isBlockingStripeStatus,
  reusableCustomerId,
  type StoredSubscriptionForCheckout,
} from "../_shared/stripe-subscription-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Agência é contratada exclusivamente pelo atendimento comercial. Somente os
// três planos de autosserviço podem iniciar checkout com cartão.
const ALLOWED_PRICE_LOOKUP_KEYS = new Set([
  "starter_monthly",
  "pro_monthly",
  "business_monthly",
]);
const CARD_BACKED_TRIAL_DAYS = 7;
const CHECKOUT_IDEMPOTENCY_WINDOW_MS = 15 * 60 * 1000;

function json(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function existingSubscriptionResponse(
  subscription: StoredSubscriptionForCheckout,
): Response {
  return json({
    code: "subscription_exists",
    existingSubscription: true,
    portalAvailable: Boolean(subscription.stripe_customer_id),
    status: subscription.status,
  });
}

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
    if (allowedOrigins().some((origin) => url.origin === origin)) return true;
    if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url.origin)) return true;
    // Allow Lovable preview/sandbox subdomains (e.g. id-preview--*.lovable.app, *.lovable.app, *.lovableproject.com)
    if (/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)*\.(lovable\.app|lovableproject\.com|lovable\.dev)$/i.test(url.origin)) return true;
    return false;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }
  try {
    // Authenticate caller — never trust a client-provided userId
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return json({ error: "unauthorized" }, 401);
    }
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) {
      return json({ error: "unauthorized" }, 401);
    }

    const { priceId, returnUrl, environment } = await req.json();
    if (!priceId || !/^[a-zA-Z0-9_-]+$/.test(priceId)) throw new Error("Invalid priceId");
    if (!ALLOWED_PRICE_LOOKUP_KEYS.has(priceId)) throw new Error("Plano não permitido para checkout");
    if (!returnUrl) throw new Error("returnUrl required");
    if (!isAllowedUrl(returnUrl)) throw new Error("returnUrl não permitido");
    const env: StripeEnv = environment === "live" ? "live" : "sandbox";
    const stripe = createStripeClient(env);

    // Use verified user data only — ignore any client-provided userId/email.
    const verifiedUserId = user.id;
    const verifiedEmail = user.email;
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: storedRows, error: storedRowsError } = await admin
      .from("user_subscriptions")
      .select(
        "approval_status, plan, status, stripe_customer_id, stripe_subscription_id, terminal_state",
      )
      .eq("user_id", verifiedUserId)
      .eq("environment", env)
      .order("created_at", { ascending: false })
      .limit(20);
    if (storedRowsError) {
      throw new Error("Não foi possível verificar a assinatura atual");
    }

    const subscriptions =
      (storedRows || []) as StoredSubscriptionForCheckout[];
    const storedBlocking = subscriptions.find(isBlockingStoredSubscription);
    if (storedBlocking) return existingSubscriptionResponse(storedBlocking);

    const existingCustomerId = reusableCustomerId(subscriptions);
    if (existingCustomerId) {
      // Confirma também na Stripe para fechar a janela em que o banco ainda não
      // recebeu a atualização mais recente do webhook.
      const stripeSubscriptions = await stripe.subscriptions.list({
        customer: existingCustomerId,
        status: "all",
        limit: 100,
      });
      const stripeBlocking = stripeSubscriptions.data.find((subscription) =>
        isBlockingStripeStatus(subscription.status)
      );
      if (stripeBlocking) {
        return existingSubscriptionResponse({
          approval_status: null,
          plan: null,
          status: stripeBlocking.status,
          stripe_customer_id: existingCustomerId,
          stripe_subscription_id: stripeBlocking.id,
          terminal_state: false,
        });
      }
    }

    const prices = await stripe.prices.list({ lookup_keys: [priceId], active: true, limit: 1 });
    if (!prices.data.length) throw new Error("Price not found");
    const stripePrice = prices.data[0];
    const isRecurring = stripePrice.type === "recurring";
    const safeTrialDays = isRecurring ? CARD_BACKED_TRIAL_DAYS : 0;

    const idempotencyWindow = Math.floor(
      Date.now() / CHECKOUT_IDEMPOTENCY_WINDOW_MS,
    );
    const session = await stripe.checkout.sessions.create(
      {
        line_items: [{ price: stripePrice.id, quantity: 1 }],
        mode: isRecurring ? "subscription" : "payment",
        ui_mode: "embedded_page",
        return_url: returnUrl,
        ...(isRecurring && { payment_method_collection: "always" }),
        ...customerForCheckout(existingCustomerId, verifiedEmail),
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
      },
      {
        idempotencyKey:
          `checkout:${env}:${verifiedUserId}:${priceId}:${idempotencyWindow}`,
      },
    );

    return json({ clientSecret: session.client_secret });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
