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
          .select("id")
          .eq("user_id", userId)
          .eq("environment", env)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const payload = {
          user_id: userId,
          environment: env,
          plan,
          status: sub.status,
          approval_status: "approved",
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
