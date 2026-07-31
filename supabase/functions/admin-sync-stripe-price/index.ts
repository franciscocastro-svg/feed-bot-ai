import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeAdminSection } from "../_shared/admin-authorization.ts";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type SafeLogLevel = "error" | "warn";
type SafeLogEvent =
  | "authentication_denied"
  | "permission_denied"
  | "permission_check_failed"
  | "invalid_request"
  | "stripe_sync_failed"
  | "archive_previous_price_failed";

function logSafe(level: SafeLogLevel, event: SafeLogEvent, status: number) {
  const entry = JSON.stringify({
    scope: "admin-sync-stripe-price",
    event,
    status,
  });
  if (level === "error") console.error(entry);
  else console.warn(entry);
}

// Maps internal plan -> Stripe price lookup_key + product_id
const PLAN_MAP: Record<string, { lookup_key: string; product_id: string; product_name: string }> = {
  starter: { lookup_key: "starter_monthly", product_id: "starter_plan", product_name: "Creator" },
  pro: { lookup_key: "pro_monthly", product_id: "pro_plan", product_name: "Pro" },
  business: { lookup_key: "business_monthly", product_id: "business_plan", product_name: "Business" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authorizationHeader = req.headers.get("Authorization")?.trim() || "";
  if (!/^Bearer\s+\S+$/i.test(authorizationHeader)) {
    logSafe("warn", "authentication_denied", 401);
    return json({ error: "unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    logSafe("error", "permission_check_failed", 503);
    return json({ error: "permission_check_failed" }, 503);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorizationHeader } },
  });
  const authorization = await authorizeAdminSection(
    {
      getAuthenticatedUserId: async () => {
        const {
          data: { user },
          error,
        } = await userClient.auth.getUser();
        return error || !user ? null : user.id;
      },
      checkPermission: async (section) => {
        const { data, error } = await userClient.rpc("admin_has_permission", {
          _section: section,
        });
        if (error) throw new Error("permission_check_failed");
        return data === true;
      },
    },
    "plans",
  );
  if (!authorization.ok) {
    const event =
      authorization.code === "permission_check_failed"
        ? "permission_check_failed"
        : authorization.code === "forbidden"
          ? "permission_denied"
          : "authentication_denied";
    logSafe(
      authorization.code === "permission_check_failed" ? "error" : "warn",
      event,
      authorization.status,
    );
    return json({ error: authorization.code }, authorization.status);
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      logSafe("warn", "invalid_request", 400);
      return json({ error: "invalid_request" }, 400);
    }
    const plan = typeof body.plan === "string" ? body.plan : "";
    const priceBrl = Number(body.price_brl);
    const environment = body.environment;
    const map = PLAN_MAP[plan];
    if (!map) {
      return json({ skipped: true, reason: "plan_not_synced_to_stripe" });
    }
    if (!Number.isFinite(priceBrl) || priceBrl <= 0) {
      logSafe("warn", "invalid_request", 400);
      return json({ error: "invalid_price" }, 400);
    }
    if (environment !== "live" && environment !== "sandbox") {
      logSafe("warn", "invalid_request", 400);
      return json({ error: "invalid_environment" }, 400);
    }

    const env: StripeEnv = environment;
    const stripe = createStripeClient(env);

    // 1) Find existing price by lookup_key
    const existing = await stripe.prices.list({ lookup_keys: [map.lookup_key], active: true, limit: 1 });
    const oldPrice = existing.data[0];

    // If price already matches, do nothing
    const newAmountCents = Math.round(priceBrl * 100);
    if (oldPrice && oldPrice.unit_amount === newAmountCents && oldPrice.currency === "brl") {
      return json({
        unchanged: true,
        lookup_key: map.lookup_key,
        amount: newAmountCents,
      });
    }

    // 2) Ensure product exists
    let productId = oldPrice?.product as string | undefined;
    if (!productId) {
      const products = await stripe.products.list({ limit: 100, active: true });
      const found = products.data.find((p) => p.name === map.product_name);
      if (found) productId = found.id;
      else {
        const created = await stripe.products.create({ name: map.product_name });
        productId = created.id;
      }
    }

    // 3) Create new price
    const newPrice = await stripe.prices.create({
      product: productId!,
      unit_amount: newAmountCents,
      currency: "brl",
      recurring: { interval: "month" },
      lookup_key: map.lookup_key,
      transfer_lookup_key: true,
    });

    // 4) Archive old price (lookup_key already transferred)
    if (oldPrice && oldPrice.id !== newPrice.id) {
      try {
        await stripe.prices.update(oldPrice.id, { active: false });
      } catch {
        logSafe("warn", "archive_previous_price_failed", 502);
      }
    }

    return json({
      success: true,
      lookup_key: map.lookup_key,
      new_price_id: newPrice.id,
      amount_brl: priceBrl,
      environment: env,
    });
  } catch {
    logSafe("error", "stripe_sync_failed", 502);
    return json({ error: "stripe_sync_failed" }, 502);
  }
});
