import { loadStripe, Stripe } from "@stripe/stripe-js";

export type StripeEnv = "sandbox" | "live";

export type StripeClientConfig = {
  clientToken: string;
  environment: StripeEnv;
};

export function resolveStripeClientConfig(
  rawClientToken: string | undefined,
): StripeClientConfig {
  const clientToken = rawClientToken?.trim();

  if (!clientToken) {
    throw new Error("VITE_PAYMENTS_CLIENT_TOKEN is required");
  }

  if (clientToken.startsWith("pk_test_")) {
    return { clientToken, environment: "sandbox" };
  }

  if (clientToken.startsWith("pk_live_")) {
    return { clientToken, environment: "live" };
  }

  throw new Error(
    "VITE_PAYMENTS_CLIENT_TOKEN must be a Stripe publishable key",
  );
}

let stripePromise: Promise<Stripe | null> | null = null;
let stripeConfig: StripeClientConfig | null = null;

function getStripeClientConfig(): StripeClientConfig {
  if (!stripeConfig) {
    stripeConfig = resolveStripeClientConfig(
      import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN,
    );
  }

  return stripeConfig;
}

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = loadStripe(getStripeClientConfig().clientToken);
  }
  return stripePromise;
}

export function getStripeEnvironment(): StripeEnv {
  return getStripeClientConfig().environment;
}
