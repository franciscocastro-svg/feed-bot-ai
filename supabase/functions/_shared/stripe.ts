import Stripe from "https://esm.sh/stripe@22.0.2";

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`${key} is not configured`);
  return value;
};

export type StripeEnv = "sandbox" | "live";

const GATEWAY_STRIPE_BASE = "https://connector-gateway.lovable.dev/stripe";

export function getConnectionApiKey(env: StripeEnv): string {
  return env === "sandbox"
    ? getEnv("STRIPE_SANDBOX_API_KEY")
    : getEnv("STRIPE_LIVE_API_KEY");
}

export function createStripeClient(env: StripeEnv): Stripe {
  const connectionApiKey = getConnectionApiKey(env);
  const lovableApiKey = getEnv("LOVABLE_API_KEY");
  return new Stripe(connectionApiKey, {
    apiVersion: "2026-03-25.dahlia",
    httpClient: Stripe.createFetchHttpClient((input: URL | RequestInfo, init?: RequestInit) => {
      const sourceRequest = input instanceof Request ? input : null;
      const sourceUrl = sourceRequest?.url || input.toString();
      const gatewayUrl = sourceUrl.replace("https://api.stripe.com", GATEWAY_STRIPE_BASE);
      return fetch(gatewayUrl, {
        ...(sourceRequest
          ? { method: sourceRequest.method, body: sourceRequest.body, headers: sourceRequest.headers }
          : {}),
        ...init,
        headers: {
          ...Object.fromEntries(new Headers(sourceRequest?.headers).entries()),
          ...Object.fromEntries(new Headers(init?.headers).entries()),
          "X-Connection-Api-Key": connectionApiKey,
          "Lovable-API-Key": lovableApiKey,
        },
      });
    }),
  });
}
