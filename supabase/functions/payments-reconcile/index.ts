import { createClient } from "npm:@supabase/supabase-js@2";
import { classifyError, createLogger } from "../_shared/observability.ts";
import {
  getInvoiceSubscriptionId,
  getSubscriptionPeriod,
} from "../_shared/stripe-event-compat.ts";
import { createStripeClient, type StripeEnv } from "../_shared/stripe.ts";
import { getEffectPolicy } from "../_shared/webhook-effect-policy.ts";

const PAGE_SIZE = 500;
const EFFECT_BATCH_SIZE = 100;
const SUBSCRIPTION_CONCURRENCY = 10;
const EFFECT_CONCURRENCY = 5;
const MAX_RUNTIME_MS = 110_000;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

let vaultAuthCache: { value: string; expiresAt: number } | null = null;

type StripeClient = ReturnType<typeof createStripeClient>;

interface EffectRow {
  id: string;
  event_id: string;
  effect_type: string;
  attempt_count: number;
}

interface SubscriptionRow {
  id: string;
  user_id: string;
  environment: StripeEnv;
  plan: string;
  status: string;
  stripe_subscription_id: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  refund_state: string;
  created_at: string;
}

interface Metrics {
  subs_scanned: number;
  subs_updated: number;
  divergences: number;
  effects_recovered: number;
  errors_by_code: Record<string, number>;
}

function jsonResponse(
  requestId: string,
  body: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "x-request-id": requestId,
    },
  });
}

function constantTimeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.max(a.length, b.length);
  let mismatch = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return mismatch === 0;
}

async function getVaultInternalAuth(): Promise<string | null> {
  if (vaultAuthCache && vaultAuthCache.expiresAt > Date.now()) {
    return vaultAuthCache.value;
  }
  const { data, error } = await supabase.rpc("get_internal_cron_secret");
  if (error || typeof data !== "string" || data.length === 0) return null;
  vaultAuthCache = { value: data, expiresAt: Date.now() + 5 * 60_000 };
  return data;
}

async function isInternalRequestAuthorized(
  suppliedAuth: string,
  environmentAuth: string | undefined,
): Promise<boolean> {
  if (environmentAuth && constantTimeEqual(suppliedAuth, environmentAuth)) {
    return true;
  }
  const vaultAuth = await getVaultInternalAuth();
  return vaultAuth !== null && constantTimeEqual(suppliedAuth, vaultAuth);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object"
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numericValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function objectId(value: unknown): string | null {
  if (typeof value === "string") return value;
  return stringValue(asRecord(value).id);
}

function lookupKeyToPlan(key: string | null | undefined): string {
  if (key?.startsWith("starter")) return "starter";
  if (key?.startsWith("pro")) return "pro";
  if (key?.startsWith("business")) return "business";
  return "free";
}

function sameInstant(left: string | null, right: string | null): boolean {
  if (left === null || right === null) return left === right;
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  return Number.isFinite(leftTime) && Number.isFinite(rightTime)
    ? leftTime === rightTime
    : left === right;
}

function recordError(metrics: Metrics, error: unknown): string {
  const { error_code } = classifyError(error);
  metrics.errors_by_code[error_code] =
    (metrics.errors_by_code[error_code] ?? 0) + 1;
  return error_code;
}

async function mapConcurrent<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (cursor < items.length) {
        const item = items[cursor];
        cursor += 1;
        await worker(item);
      }
    },
  );
  await Promise.all(runners);
}

async function sha256(value: string): Promise<string> {
  const data = new TextEncoder().encode(value.trim().toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(
    new Uint8Array(hash),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function sendMetaEvent(
  environment: StripeEnv,
  eventName: "StartTrial" | "Purchase",
  eventId: string,
  eventTime: number | null,
  object: Record<string, unknown>,
): Promise<string | null> {
  // Meta conversion reporting is intentionally disabled in sandbox.
  if (environment === "sandbox") return null;

  const pixelId = Deno.env.get("META_PIXEL_ID");
  const accessToken = Deno.env.get("META_CONVERSIONS_ACCESS_TOKEN");
  if (!pixelId || !accessToken) {
    throw Object.assign(new Error("meta_not_configured"), {
      code: "meta_not_configured",
    });
  }

  const isCheckout = eventName === "StartTrial";
  const customerDetails = asRecord(object.customer_details);
  const metadata = asRecord(object.metadata);
  const email = isCheckout
    ? stringValue(customerDetails.email) ?? stringValue(object.customer_email)
    : stringValue(object.customer_email);
  const amount = numericValue(
    isCheckout ? object.amount_total : object.amount_paid,
  );
  const currency = stringValue(object.currency)?.toUpperCase() ?? "BRL";
  const orderId = stringValue(object.id);
  const userData: Record<string, unknown> = {};
  if (email) userData.em = [await sha256(email)];

  const customData: Record<string, unknown> = { currency };
  if (amount !== null && amount > 0) {
    customData.value = Number((amount / 100).toFixed(2));
  }
  if (orderId) customData.order_id = orderId;
  const plan = lookupKeyToPlan(stringValue(metadata.priceId));
  if (plan !== "free") customData.content_name = plan;

  const graphVersion = Deno.env.get("META_GRAPH_VERSION") || "v23.0";
  const sourceUrl = Deno.env.get("PUBLIC_SITE_URL") ||
    Deno.env.get("PUBLIC_APP_URL") ||
    "https://fluxifeed.com";
  const response = await fetch(
    `https://graph.facebook.com/${graphVersion}/${pixelId}/events?access_token=${
      encodeURIComponent(accessToken)
    }`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [{
          event_name: eventName,
          event_time: eventTime ?? Math.floor(Date.now() / 1_000),
          event_id: `stripe_${eventId}`,
          action_source: "website",
          event_source_url: sourceUrl,
          user_data: userData,
          custom_data: customData,
        }],
      }),
    },
  );

  if (!response.ok) {
    throw Object.assign(new Error("meta_capi_failed"), {
      code: "meta_capi_failed",
      provider_status: response.status,
    });
  }
  return stringValue(
    asRecord(await response.json().catch(() => null)).fbtrace_id,
  );
}

async function resolveRefundSubscriptionId(
  stripe: StripeClient,
  eventType: string,
  eventObject: Record<string, unknown>,
): Promise<string> {
  let charge = eventObject;
  if (eventType.startsWith("charge.dispute.")) {
    const chargeId = objectId(eventObject.charge);
    if (!chargeId) {
      throw Object.assign(new Error("refund_mapping_failed"), {
        code: "refund_mapping_failed",
      });
    }
    charge = asRecord(await stripe.charges.retrieve(chargeId));
  }

  const invoiceId = objectId(charge.invoice);
  if (!invoiceId) {
    throw Object.assign(new Error("refund_mapping_failed"), {
      code: "refund_mapping_failed",
    });
  }
  const invoice = await stripe.invoices.retrieve(invoiceId);
  const subscriptionId = getInvoiceSubscriptionId(invoice);
  if (!subscriptionId) {
    throw Object.assign(new Error("refund_mapping_failed"), {
      code: "refund_mapping_failed",
    });
  }
  return subscriptionId;
}

async function executeEffect(
  stripe: StripeClient,
  environment: StripeEnv,
  effect: EffectRow,
): Promise<string | null> {
  const event = await stripe.events.retrieve(effect.event_id);
  const eventObject = asRecord(event.data.object);

  switch (effect.effect_type) {
    case "stripe_cancel_after_refund": {
      const subscriptionId = await resolveRefundSubscriptionId(
        stripe,
        event.type,
        eventObject,
      );
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      if (subscription.status === "canceled") return subscription.id;
      const canceled = await stripe.subscriptions.cancel(subscriptionId, {
        invoice_now: false,
        prorate: false,
      });
      return canceled.id;
    }
    case "meta_start_trial":
      if (event.type !== "checkout.session.completed") {
        throw Object.assign(new Error("effect_event_mismatch"), {
          code: "effect_event_mismatch",
        });
      }
      return await sendMetaEvent(
        environment,
        "StartTrial",
        event.id,
        event.created,
        eventObject,
      );
    case "meta_purchase":
      if (event.type !== "invoice.payment_succeeded") {
        throw Object.assign(new Error("effect_event_mismatch"), {
          code: "effect_event_mismatch",
        });
      }
      return await sendMetaEvent(
        environment,
        "Purchase",
        event.id,
        event.created,
        eventObject,
      );
    default:
      throw Object.assign(new Error("unsupported_effect_type"), {
        code: "unsupported_effect_type",
      });
  }
}

async function quarantineNonRetryableEffects(
  environment: StripeEnv,
  metrics: Metrics,
): Promise<void> {
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("payment_webhook_effects")
    .select("id,effect_type,status,claim_expires_at")
    .eq("environment", environment)
    .in("status", ["pending", "failed", "processing"])
    .order("created_at", { ascending: true })
    .limit(EFFECT_BATCH_SIZE);

  if (error) {
    throw Object.assign(new Error("effect_quarantine_lookup_failed"), {
      code: "effect_quarantine_lookup_failed",
    });
  }

  for (const candidate of data ?? []) {
    if (
      candidate.status === "processing" &&
      (!candidate.claim_expires_at || candidate.claim_expires_at >= now)
    ) {
      continue;
    }
    const policy = getEffectPolicy(candidate.effect_type);
    if (policy === "retry") continue;

    const nextStatus = policy === "manual_resend" ? "skipped" : "failed";
    const errorCode = policy === "manual_resend"
      ? "manual_resend_required"
      : "unsupported_effect_type";
    const mutation = await supabase
      .from("payment_webhook_effects")
      .update({
        status: nextStatus,
        error_code: errorCode,
        completed_at: now,
        claim_expires_at: null,
        updated_at: now,
      })
      .eq("id", candidate.id)
      .eq("status", candidate.status);
    if (mutation.error) {
      recordError(metrics, { code: "effect_quarantine_write_failed" });
    }
  }
}

async function reconcileEffects(
  stripe: StripeClient,
  environment: StripeEnv,
  requestId: string,
  metrics: Metrics,
): Promise<void> {
  await quarantineNonRetryableEffects(environment, metrics);

  const claim = await supabase.rpc(
    "claim_payment_webhook_effects_for_reconcile",
    {
      p_environment: environment,
      p_request_id: requestId,
      p_limit: EFFECT_BATCH_SIZE,
    },
  );
  if (claim.error) {
    throw Object.assign(new Error("effect_reconcile_claim_failed"), {
      code: "effect_reconcile_claim_failed",
    });
  }

  const effects = Array.isArray(claim.data) ? claim.data as EffectRow[] : [];
  await mapConcurrent(effects, EFFECT_CONCURRENCY, async (effect) => {
    try {
      const responseId = await executeEffect(stripe, environment, effect);
      const completed = await supabase.rpc("complete_payment_webhook_effect", {
        p_provider: "stripe",
        p_environment: environment,
        p_event_id: effect.event_id,
        p_effect_type: effect.effect_type,
        p_request_id: requestId,
        p_stripe_response_id: responseId,
      });
      if (completed.error || completed.data !== true) {
        throw Object.assign(new Error("effect_complete_fence_lost"), {
          code: "effect_complete_fence_lost",
        });
      }
      metrics.effects_recovered += 1;
    } catch (error) {
      const errorCode = recordError(metrics, error);
      const failed = await supabase.rpc("fail_payment_webhook_effect", {
        p_provider: "stripe",
        p_environment: environment,
        p_event_id: effect.event_id,
        p_effect_type: effect.effect_type,
        p_request_id: requestId,
        p_error_code: errorCode,
      });
      if (failed.error || failed.data !== true) {
        recordError(metrics, { code: "effect_fail_fence_lost" });
      }
    }
  });
}

function subscriptionDiverged(local: SubscriptionRow, remote: {
  plan: string;
  status: string;
  periodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}): boolean {
  return local.plan !== remote.plan ||
    local.status !== remote.status ||
    !sameInstant(local.current_period_end, remote.periodEnd) ||
    local.cancel_at_period_end !== remote.cancelAtPeriodEnd;
}

async function reconcileSubscription(
  stripe: StripeClient,
  environment: StripeEnv,
  local: SubscriptionRow,
  metrics: Metrics,
): Promise<void> {
  metrics.subs_scanned += 1;
  try {
    const remote = await stripe.subscriptions.retrieve(
      local.stripe_subscription_id,
    );
    const item = remote.items.data[0];
    const lookupKey = item?.price?.lookup_key ?? null;
    const { periodStart, periodEnd } = getSubscriptionPeriod(remote);
    const periodStartIso = periodStart
      ? new Date(periodStart * 1_000).toISOString()
      : null;
    const periodEndIso = periodEnd
      ? new Date(periodEnd * 1_000).toISOString()
      : null;
    const remoteState = {
      plan: lookupKeyToPlan(lookupKey),
      status: remote.status,
      periodEnd: periodEndIso,
      cancelAtPeriodEnd: remote.cancel_at_period_end,
    };

    if (!subscriptionDiverged(local, remoteState)) return;
    metrics.divergences += 1;

    const terminal = ["canceled", "unpaid", "incomplete_expired"].includes(
      remote.status,
    );
    const result = await supabase.rpc("apply_stripe_subscription_event", {
      p_environment: environment,
      p_event_id: `reconcile_${remote.id}_${remote.status}_${periodEnd ?? 0}`,
      p_event_type: "payments.reconcile",
      p_event_created_at: new Date().toISOString(),
      p_user_id: local.user_id,
      p_stripe_subscription_id: remote.id,
      p_stripe_customer_id: objectId(remote.customer),
      p_plan: remoteState.plan,
      p_status: remote.status,
      p_product_id: objectId(item?.price?.product),
      p_price_id: lookupKey ?? item?.price?.id ?? null,
      p_current_period_start: periodStartIso,
      p_current_period_end: periodEndIso,
      p_cancel_at_period_end: remote.cancel_at_period_end,
      p_terminal: terminal,
      p_refund_state: local.refund_state,
      p_request_id: null,
    });
    if (result.error) {
      throw Object.assign(new Error("subscription_reconcile_rpc_failed"), {
        code: "subscription_reconcile_rpc_failed",
      });
    }
    metrics.subs_updated += 1;
  } catch (error) {
    recordError(metrics, error);
  }
}

async function reconcileSubscriptions(
  stripe: StripeClient,
  environment: StripeEnv,
  startedAt: number,
  metrics: Metrics,
): Promise<void> {
  let cursor: { createdAt: string; id: string } | null = null;

  while (Date.now() - startedAt < MAX_RUNTIME_MS) {
    let query = supabase
      .from("user_subscriptions")
      .select(
        "id,user_id,environment,plan,status,stripe_subscription_id,current_period_end,cancel_at_period_end,refund_state,created_at",
      )
      .eq("environment", environment)
      .eq("terminal_state", false)
      .not("stripe_subscription_id", "is", null)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);

    if (cursor) {
      query = query.or(
        `created_at.gt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.gt.${cursor.id})`,
      );
    }

    const { data, error } = await query;
    if (error) {
      throw Object.assign(new Error("subscription_page_failed"), {
        code: "subscription_page_failed",
      });
    }
    const page = (data ?? []) as SubscriptionRow[];
    if (page.length === 0) break;

    await mapConcurrent(
      page,
      SUBSCRIPTION_CONCURRENCY,
      (row) => reconcileSubscription(stripe, environment, row, metrics),
    );

    const last = page[page.length - 1];
    cursor = { createdAt: last.created_at, id: last.id };
    if (page.length < PAGE_SIZE) break;
  }
}

Deno.serve(async (request) => {
  const log = createLogger("payments-reconcile");
  const requestId = log.requestId;
  const startedAt = Date.now();

  if (request.method !== "POST") {
    return jsonResponse(requestId, { error: "method_not_allowed" }, 405);
  }
  const suppliedAuth = request.headers.get("x-internal-secret");
  // Missing credentials fail before any database access. When a credential is
  // supplied, accept the Edge environment value first and the established
  // service-role-only Vault source as a compatibility fallback.
  if (!suppliedAuth) {
    log.warn("internal_auth_rejected", {
      error_code: "internal_auth_rejected",
    });
    return jsonResponse(requestId, { error: "unauthorized" }, 401);
  }
  const authorized = await isInternalRequestAuthorized(
    suppliedAuth,
    Deno.env.get("INTERNAL_CRON_SECRET"),
  );
  if (!authorized) {
    log.warn("internal_auth_rejected", {
      error_code: "internal_auth_rejected",
    });
    return jsonResponse(requestId, { error: "unauthorized" }, 401);
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 1_024) {
    return jsonResponse(requestId, { error: "payload_too_large" }, 413);
  }

  let environment: StripeEnv;
  try {
    const body = asRecord(await request.json());
    if (body.environment !== "sandbox" && body.environment !== "live") {
      return jsonResponse(requestId, { error: "invalid_environment" }, 400);
    }
    environment = body.environment;
  } catch {
    return jsonResponse(requestId, { error: "invalid_payload" }, 400);
  }

  const metrics: Metrics = {
    subs_scanned: 0,
    subs_updated: 0,
    divergences: 0,
    effects_recovered: 0,
    errors_by_code: {},
  };

  try {
    // createStripeClient selects exactly one credential family from environment.
    const stripe = createStripeClient(environment);
    await reconcileEffects(stripe, environment, requestId, metrics);
    await reconcileSubscriptions(stripe, environment, startedAt, metrics);

    const duration = Date.now() - startedAt;
    const errorsCount = Object.values(metrics.errors_by_code).reduce(
      (sum, count) => sum + count,
      0,
    );
    log.info("reconcile_completed", {
      environment,
      status: errorsCount > 0 ? "completed_with_errors" : "completed",
      duration_ms: duration,
      subs_scanned: metrics.subs_scanned,
      subs_updated: metrics.subs_updated,
      divergences: metrics.divergences,
      effects_recovered: metrics.effects_recovered,
      errors_count: errorsCount,
      errors_by_code: metrics.errors_by_code,
    });
    return jsonResponse(requestId, {
      ok: errorsCount === 0,
      environment,
      duration_ms: duration,
      subs_scanned: metrics.subs_scanned,
      subs_updated: metrics.subs_updated,
      divergences: metrics.divergences,
      effects_recovered: metrics.effects_recovered,
      errors_count: errorsCount,
    });
  } catch (error) {
    const errorCode = recordError(metrics, error);
    log.error("reconcile_failed", {
      environment,
      status: "failed",
      error_code: errorCode,
      duration_ms: Date.now() - startedAt,
    });
    return jsonResponse(requestId, { error: "reconcile_failed" }, 500);
  }
});
