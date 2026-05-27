import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Maps internal plan -> Stripe price lookup_key + product_id
const PLAN_MAP: Record<string, { lookup_key: string; product_id: string; product_name: string }> = {
  starter: { lookup_key: "starter_monthly", product_id: "starter_plan", product_name: "Starter" },
  pro: { lookup_key: "pro_monthly", product_id: "pro_plan", product_name: "Pro" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) throw new Error("Unauthorized");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) throw new Error("Unauthorized");

    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden — admin only");

    const { plan, price_brl, environment } = await req.json();
    const map = PLAN_MAP[plan];
    if (!map) {
      return new Response(JSON.stringify({ skipped: true, reason: `plan ${plan} not synced to Stripe` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!price_brl || Number(price_brl) <= 0) throw new Error("price_brl must be > 0");

    const env: StripeEnv = environment === "live" ? "live" : "sandbox";
    const stripe = createStripeClient(env);

    // 1) Find existing price by lookup_key
    const existing = await stripe.prices.list({ lookup_keys: [map.lookup_key], active: true, limit: 1 });
    const oldPrice = existing.data[0];

    // If price already matches, do nothing
    const newAmountCents = Math.round(Number(price_brl) * 100);
    if (oldPrice && oldPrice.unit_amount === newAmountCents && oldPrice.currency === "brl") {
      return new Response(JSON.stringify({ unchanged: true, lookup_key: map.lookup_key, amount: newAmountCents }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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
      try { await stripe.prices.update(oldPrice.id, { active: false }); } catch (e) { console.warn("archive old price failed", e); }
    }

    return new Response(JSON.stringify({
      success: true,
      lookup_key: map.lookup_key,
      new_price_id: newPrice.id,
      amount_brl: Number(price_brl),
      environment: env,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
