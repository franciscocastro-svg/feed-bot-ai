import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function allowedOrigins(): string[] {
  return [
    "https://fluxifeed.com",
    "https://www.fluxifeed.com",
    "https://feed-bot-ai.lovable.app",
    Deno.env.get("APP_ORIGIN") || "",
    Deno.env.get("PUBLIC_APP_URL") || "",
  ].filter(Boolean);
}

function safeReturnUrl(raw: string | undefined | null): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (allowedOrigins().some((origin) => url.origin === origin)) return url.toString();
    if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url.origin)) return url.toString();
  } catch {
    return undefined;
  }
  return undefined;
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const token = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!token) throw new Error("Unauthorized");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const { returnUrl, environment, flow } = await req.json();
    const env: StripeEnv = environment === "live" ? "live" : "sandbox";
    const portalReturnUrl = safeReturnUrl(returnUrl);
    const wantsCardUpdate = flow === "payment_method_update";

    const { data: sub } = await supabase
      .from("user_subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .eq("environment", env)
      .not("stripe_customer_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!sub?.stripe_customer_id) throw new Error("No subscription found");

    const stripe = createStripeClient(env);
    const baseParams = {
      customer: sub.stripe_customer_id,
      ...(portalReturnUrl && { return_url: portalReturnUrl }),
    };
    // Abre direto na tela de troca de cartão quando solicitado; se a conta
    // Stripe não suportar o fluxo, cai para o portal completo.
    let portal;
    if (wantsCardUpdate) {
      try {
        portal = await stripe.billingPortal.sessions.create({
          ...baseParams,
          flow_data: {
            type: "payment_method_update",
            ...(portalReturnUrl && {
              after_completion: { type: "redirect", redirect: { return_url: portalReturnUrl } },
            }),
          },
        });
      } catch (flowError) {
        console.warn("portal_flow_fallback", { scope: "create-portal-session" });
        portal = await stripe.billingPortal.sessions.create(baseParams);
      }
    } else {
      portal = await stripe.billingPortal.sessions.create(baseParams);
    }
    return new Response(JSON.stringify({ url: portal.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
