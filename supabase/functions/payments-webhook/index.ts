import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Map price lookup_key -> internal plan
function lookupKeyToPlan(key: string | undefined | null): string {
  if (!key) return "free";
  if (key.startsWith("starter")) return "starter";
  if (key.startsWith("pro")) return "pro";
  if (key.startsWith("business")) return "business";
  return "free";
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function centsToCurrencyValue(amount: number | null | undefined): number | undefined {
  if (!amount || amount <= 0) return undefined;
  return Number((amount / 100).toFixed(2));
}

async function sendMetaConversionEvent(
  eventName: "StartTrial" | "Purchase",
  params: {
    env: StripeEnv;
    eventId: string;
    created: number | undefined;
    email?: string | null;
    currency?: string | null;
    amount?: number | null;
    orderId?: string | null;
    plan?: string | null;
  },
): Promise<void> {
  if (params.env !== "live") return;

  const pixelId = Deno.env.get("META_PIXEL_ID");
  const accessToken = Deno.env.get("META_CONVERSIONS_ACCESS_TOKEN");
  if (!pixelId || !accessToken) {
    console.warn("Meta Conversions API not configured");
    return;
  }

  const eventSourceUrl = Deno.env.get("PUBLIC_SITE_URL") ||
    Deno.env.get("PUBLIC_APP_URL") ||
    "https://fluxifeed.com";
  const eventTime = params.created || Math.floor(Date.now() / 1000);
  const customData: Record<string, unknown> = {
    currency: (params.currency || "BRL").toUpperCase(),
  };
  const value = centsToCurrencyValue(params.amount);
  if (value !== undefined) customData.value = value;
  if (params.orderId) customData.order_id = params.orderId;
  if (params.plan) customData.content_name = params.plan;

  const userData: Record<string, unknown> = {};
  if (params.email) userData.em = [await sha256(params.email)];

  const graphVersion = Deno.env.get("META_GRAPH_VERSION") || "v23.0";
  const response = await fetch(
    `https://graph.facebook.com/${graphVersion}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [{
          event_name: eventName,
          event_time: eventTime,
          event_id: params.eventId,
          action_source: "website",
          event_source_url: eventSourceUrl,
          user_data: userData,
          custom_data: customData,
        }],
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Meta CAPI ${response.status}: ${text.slice(0, 500)}`);
  }
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const env: StripeEnv = url.searchParams.get("env") === "live" ? "live" : "sandbox";
  const stripe = createStripeClient(env);
  const signingSecret = env === "live"
    ? Deno.env.get("PAYMENTS_LIVE_WEBHOOK_SECRET")
    : Deno.env.get("PAYMENTS_SANDBOX_WEBHOOK_SECRET");

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  let event: any;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig!, signingSecret!);
  } catch (e) {
    console.error("Webhook signature failed:", (e as Error).message);
    return new Response("Bad signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const priceLookup = session.metadata?.priceId as string | undefined;
        await sendMetaConversionEvent("StartTrial", {
          env,
          eventId: `stripe_${event.id}`,
          created: event.created,
          email: session.customer_details?.email || session.customer_email,
          currency: session.currency,
          amount: session.amount_total,
          orderId: session.id,
          plan: lookupKeyToPlan(priceLookup),
        }).catch((error) => console.warn("Meta StartTrial failed:", error.message));
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object;
        const userId = sub.metadata?.userId;
        if (!userId) { console.warn("No userId in metadata", sub.id); break; }

        const item = sub.items?.data?.[0];
        const priceLookup = item?.price?.lookup_key as string | undefined;
        const plan = lookupKeyToPlan(priceLookup);
        const periodStart = item?.current_period_start || sub.current_period_start;
        const periodEnd = item?.current_period_end || sub.current_period_end;

        // Find existing row for this user+env
        const { data: existing } = await supabase
          .from("user_subscriptions")
          .select("id, approval_status")
          .eq("user_id", userId)
          .eq("environment", env)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // Payment gate: only trialing/active/past_due unlock the email-code step.
        // Any other status (incomplete, incomplete_expired, canceled, unpaid) stays blocked.
        const paidStatus = ["trialing", "active", "past_due"].includes(sub.status);
        const alreadyApproved = existing?.approval_status === "approved";
        const nextApprovalStatus = alreadyApproved
          ? "approved"
          : paidStatus
            ? "pending_email_verification"
            : "pending_payment";

        const payload: Record<string, unknown> = {
          user_id: userId,
          environment: env,
          plan,
          status: sub.status,
          approval_status: nextApprovalStatus,
          stripe_customer_id: sub.customer,
          stripe_subscription_id: sub.id,
          product_id: item?.price?.product,
          price_id: priceLookup,
          current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
          current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
          cancel_at_period_end: !!sub.cancel_at_period_end,
          expires_at: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        };

        if (existing) {
          await supabase.from("user_subscriptions").update(payload).eq("id", existing.id);
        } else {
          await supabase.from("user_subscriptions").insert(payload);
        }

        // Idempotent: only fire the code email when we're transitioning INTO
        // pending_email_verification (i.e. wasn't approved yet and payment is confirmed).
        if (paidStatus && !alreadyApproved) {
          try {
            const internalSecret = Deno.env.get("INTERNAL_CRON_SECRET");
            if (internalSecret) {
              await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-verification-code`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-internal-secret": internalSecret,
                  Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                },
                body: JSON.stringify({ user_id: userId }),
              });
            } else {
              console.warn("INTERNAL_CRON_SECRET missing; skipping code send");
            }
          } catch (err) {
            console.error("send-verification-code call failed", (err as Error).message);
          }
        }
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object;
        const subId = inv.subscription;
        if (subId) {
          await supabase.from("user_subscriptions").update({
            status: "past_due",
          }).eq("stripe_subscription_id", subId).eq("environment", env);
        }
        break;
      }
      case "invoice.payment_succeeded": {
        const inv = event.data.object;
        const subId = inv.subscription;
        if (subId) {
          await supabase.from("user_subscriptions").update({
            status: "active",
          }).eq("stripe_subscription_id", subId).eq("environment", env);
        }
        if ((inv.amount_paid || 0) > 0) {
          const priceLookup = inv.lines?.data?.[0]?.price?.lookup_key as string | undefined;
          await sendMetaConversionEvent("Purchase", {
            env,
            eventId: `stripe_${event.id}`,
            created: event.created,
            email: inv.customer_email,
            currency: inv.currency,
            amount: inv.amount_paid,
            orderId: inv.id,
            plan: lookupKeyToPlan(priceLookup),
          }).catch((error) => console.warn("Meta Purchase failed:", error.message));
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const userId = sub.metadata?.userId;
        if (!userId) break;
        await supabase.from("user_subscriptions").update({
          status: "canceled",
          plan: "free",
          cancel_at_period_end: true,
        }).eq("stripe_subscription_id", sub.id).eq("environment", env);
        break;
      }
      default:
        console.log("Unhandled event:", event.type);
    }
    return new Response(JSON.stringify({ received: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Webhook handler error:", e);
    return new Response("Handler error", { status: 500 });
  }
});
