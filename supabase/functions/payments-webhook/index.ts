import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";
import {
  getInvoicePriceLookup,
  getInvoiceSubscriptionId,
  getSubscriptionPeriod,
} from "../_shared/stripe-event-compat.ts";
import { classifyError, createLogger } from "../_shared/observability.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const jsonHeaders = (requestId: string) => ({
  "Content-Type": "application/json",
  "x-request-id": requestId,
  "Access-Control-Expose-Headers": "x-request-id",
});

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

/**
 * Attempt to reserve an external side-effect for this webhook event in the
 * durable outbox. Returns true only when this call is the first (and thus
 * responsible) writer; false means another attempt already handled it.
 */
async function tryClaimEffect(
  env: StripeEnv,
  eventId: string,
  effectType: string,
  requestId: string,
): Promise<{ ok: boolean; error?: unknown }> {
  const { data, error } = await supabase.rpc("try_claim_payment_webhook_effect", {
    p_provider: "stripe",
    p_environment: env,
    p_event_id: eventId,
    p_effect_type: effectType,
    p_request_id: requestId,
  });
  if (error) return { ok: false, error };
  return { ok: data === true };
}

async function deliverVerificationCode(userId: string, env: StripeEnv): Promise<void> {
  const internalSecret = Deno.env.get("INTERNAL_CRON_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!internalSecret || !supabaseUrl || !serviceKey) {
    throw Object.assign(new Error("verification_delivery_not_configured"), {
      code: "verification_delivery_not_configured",
    });
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/send-verification-code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": internalSecret,
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({ user_id: userId, environment: env }),
  });
  const payload = await response.json().catch(() => null) as { ok?: boolean } | null;
  if (!response.ok || payload?.ok !== true) {
    throw Object.assign(new Error("verification_delivery_failed"), {
      code: `verification_delivery_${response.status}`,
    });
  }
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
  if (!pixelId || !accessToken) return;

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
    // Do not include the provider body; surface only the numeric status.
    const err = new Error("meta_capi_failed") as Error & { code: string; provider_status: number };
    err.code = "meta_capi_failed";
    err.provider_status = response.status;
    throw err;
  }
}

Deno.serve(async (req) => {
  const log = createLogger("payments-webhook");
  const requestId = log.requestId;

  const url = new URL(req.url);
  const env: StripeEnv = url.searchParams.get("env") === "live" ? "live" : "sandbox";
  const stripe = createStripeClient(env);
  const signingSecret = env === "live"
    ? Deno.env.get("PAYMENTS_LIVE_WEBHOOK_SECRET")
    : Deno.env.get("PAYMENTS_SANDBOX_WEBHOOK_SECRET");

  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  let event: Awaited<ReturnType<typeof stripe.webhooks.constructEventAsync>>;
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig!, signingSecret!);
  } catch (e) {
    const { error_code } = classifyError(e);
    log.error("signature_verification_failed", { environment: env, error_code });
    return new Response("Bad signature", { status: 400, headers: { "x-request-id": requestId } });
  }

  // Idempotency: claim the event before running any side effects.
  const claimResult = await supabase.rpc("claim_payment_webhook_event", {
    p_provider: "stripe",
    p_environment: env,
    p_event_id: event.id,
    p_event_type: event.type,
    p_event_created_at: event.created ? new Date(event.created * 1000).toISOString() : null,
    p_request_id: requestId,
  });

  if (claimResult.error) {
    const { error_code } = classifyError(claimResult.error);
    log.error("claim_failed", {
      environment: env,
      event_id: event.id,
      event_type: event.type,
      error_code,
    });
    return new Response(JSON.stringify({ error: "claim_failed" }), {
      status: 500,
      headers: jsonHeaders(requestId),
    });
  }

  const claimStatus = (claimResult.data as string | null);
  if (claimStatus === "duplicate_completed") {
    log.info("duplicate_event", {
      environment: env,
      event_id: event.id,
      event_type: event.type,
      status: "duplicate_completed",
    });
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      status: 200,
      headers: jsonHeaders(requestId),
    });
  }

  if (claimStatus === "already_processing") {
    log.warn("event_already_processing", {
      environment: env,
      event_id: event.id,
      event_type: event.type,
      status: "already_processing",
    });
    return new Response(JSON.stringify({ received: true, in_flight: true }), {
      status: 200,
      headers: jsonHeaders(requestId),
    });
  }

  // Effects run ONLY when the claim RPC returned exactly "claimed".
  // Any other value (null, unknown string, etc.) is treated as a hard
  // failure — return 500 without touching side effects or the ledger.
  if (claimStatus !== "claimed") {
    log.error("claim_unknown_status", {
      environment: env,
      event_id: event.id,
      event_type: event.type,
      error_code: "claim_unknown_status",
      status: typeof claimStatus === "string" ? claimStatus : "null",
    });
    return new Response(JSON.stringify({ error: "claim_unknown_status" }), {
      status: 500,
      headers: jsonHeaders(requestId),
    });
  }

  const started = Date.now();
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const priceLookup = session.metadata?.priceId as string | undefined;
        const claim = await tryClaimEffect(env, event.id, "meta_start_trial", requestId);
        if (claim.error) {
          const { error_code } = classifyError(claim.error);
          throw Object.assign(new Error("effect_claim_failed"), { code: error_code });
        }
        if (claim.ok) {
          await sendMetaConversionEvent("StartTrial", {
            env,
            eventId: `stripe_${event.id}`,
            created: event.created,
            email: session.customer_details?.email || session.customer_email,
            currency: session.currency,
            amount: session.amount_total,
            orderId: session.id,
            plan: lookupKeyToPlan(priceLookup),
          }).catch((error) => {
            // Meta CAPI is best-effort per outbox; log without failing the event.
            const { error_code } = classifyError(error);
            log.warn("meta_start_trial_failed", { environment: env, error_code });
          });
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object;
        const userId = sub.metadata?.userId;
        if (!userId) {
          log.warn("missing_user_id_metadata", {
            environment: env,
            event_id: event.id,
            event_type: event.type,
          });
          break;
        }

        const item = sub.items?.data?.[0];
        const priceLookup = item?.price?.lookup_key as string | undefined;
        const plan = lookupKeyToPlan(priceLookup);
        const { periodStart, periodEnd } = getSubscriptionPeriod(sub);

        const existingResult = await supabase
          .from("user_subscriptions")
          .select("id, approval_status")
          .eq("user_id", userId)
          .eq("environment", env)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (existingResult.error) {
          const { error_code } = classifyError(existingResult.error);
          throw Object.assign(new Error("subscription_lookup_failed"), { code: error_code });
        }
        const existing = existingResult.data;

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

        const mutation = existing
          ? await supabase.from("user_subscriptions").update(payload).eq("id", existing.id)
          : await supabase.from("user_subscriptions").insert(payload);
        if (mutation.error) {
          const { error_code } = classifyError(mutation.error);
          throw Object.assign(new Error("subscription_write_failed"), { code: error_code });
        }

        if (paidStatus && !alreadyApproved) {
          // Email delivery must be accepted before the durable effect is marked
          // completed. A provider failure leaves the webhook failed so Stripe's
          // normal retry can recover it; no manual replay is needed here.
          await deliverVerificationCode(userId, env);
          const emailClaim = await tryClaimEffect(env, event.id, "send_verification_code", requestId);
          if (emailClaim.error) {
            const { error_code } = classifyError(emailClaim.error);
            throw Object.assign(new Error("effect_claim_failed"), { code: error_code });
          }
          log.info("verification_code_delivery_recorded", {
            environment: env,
            event_id: event.id,
            status: emailClaim.ok ? "effect_created" : "effect_already_recorded",
          });
        }
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object;
        const subId = getInvoiceSubscriptionId(inv);
        if (subId) {
          const upd = await supabase.from("user_subscriptions").update({
            status: "past_due",
          }).eq("stripe_subscription_id", subId).eq("environment", env);
          if (upd.error) {
            const { error_code } = classifyError(upd.error);
            throw Object.assign(new Error("subscription_write_failed"), { code: error_code });
          }
        }
        break;
      }
      case "invoice.payment_succeeded": {
        const inv = event.data.object;
        const subId = getInvoiceSubscriptionId(inv);
        if (subId) {
          const upd = await supabase.from("user_subscriptions").update({
            status: "active",
          }).eq("stripe_subscription_id", subId).eq("environment", env);
          if (upd.error) {
            const { error_code } = classifyError(upd.error);
            throw Object.assign(new Error("subscription_write_failed"), { code: error_code });
          }
        }
        if ((inv.amount_paid || 0) > 0) {
          const purchaseClaim = await tryClaimEffect(env, event.id, "meta_purchase", requestId);
          if (purchaseClaim.error) {
            const { error_code } = classifyError(purchaseClaim.error);
            throw Object.assign(new Error("effect_claim_failed"), { code: error_code });
          }
          if (purchaseClaim.ok) {
            const priceLookup = getInvoicePriceLookup(inv);
            await sendMetaConversionEvent("Purchase", {
              env,
              eventId: `stripe_${event.id}`,
              created: event.created,
              email: inv.customer_email,
              currency: inv.currency,
              amount: inv.amount_paid,
              orderId: inv.id,
              plan: lookupKeyToPlan(priceLookup),
            }).catch((error) => {
              const { error_code } = classifyError(error);
              log.warn("meta_purchase_failed", { environment: env, error_code });
            });
          }
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const userId = sub.metadata?.userId;
        if (!userId) break;
        const upd = await supabase.from("user_subscriptions").update({
          status: "canceled",
          plan: "free",
          cancel_at_period_end: true,
        }).eq("stripe_subscription_id", sub.id).eq("environment", env);
        if (upd.error) {
          const { error_code } = classifyError(upd.error);
          throw Object.assign(new Error("subscription_write_failed"), { code: error_code });
        }
        break;
      }
      default:
        log.info("unhandled_event", {
          environment: env,
          event_id: event.id,
          event_type: event.type,
        });
    }

    // Fenced completion: only succeeds when this request still owns the claim.
    const completeResult = await supabase.rpc("complete_payment_webhook_event", {
      p_provider: "stripe",
      p_environment: env,
      p_event_id: event.id,
      p_request_id: requestId,
    });
    if (completeResult.error) {
      const { error_code } = classifyError(completeResult.error);
      throw Object.assign(new Error("complete_rpc_failed"), { code: error_code });
    }
    if (completeResult.data !== true) {
      // Fence lost — another worker recovered this event. Do not overwrite state.
      log.warn("complete_fence_lost", {
        environment: env,
        event_id: event.id,
        event_type: event.type,
        status: "fence_lost",
        duration_ms: Date.now() - started,
      });
      return new Response(JSON.stringify({ received: true, fence_lost: true }), {
        status: 200,
        headers: jsonHeaders(requestId),
      });
    }

    log.info("event_completed", {
      environment: env,
      event_id: event.id,
      event_type: event.type,
      status: "completed",
      duration_ms: Date.now() - started,
    });
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: jsonHeaders(requestId),
    });
  } catch (e) {
    const { error_code } = classifyError(e);
    // Fenced fail: only marks failed if this worker still owns the claim.
    const failResult = await supabase.rpc("fail_payment_webhook_event", {
      p_provider: "stripe",
      p_environment: env,
      p_event_id: event.id,
      p_error_code: error_code,
      p_request_id: requestId,
    });
    if (failResult.error) {
      const { error_code: rpc_error_code } = classifyError(failResult.error);
      log.error("fail_rpc_failed", {
        environment: env,
        event_id: event.id,
        event_type: event.type,
        error_code: rpc_error_code,
      });
    } else if (failResult.data !== true) {
      log.warn("fail_fence_lost", {
        environment: env,
        event_id: event.id,
        event_type: event.type,
        status: "fence_lost",
      });
    }
    log.error("event_failed", {
      environment: env,
      event_id: event.id,
      event_type: event.type,
      status: "failed",
      error_code,
      duration_ms: Date.now() - started,
    });
    return new Response("Handler error", {
      status: 500,
      headers: { "x-request-id": requestId },
    });
  }
});
