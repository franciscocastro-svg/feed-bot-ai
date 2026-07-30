import { loadStripe, Stripe } from "@stripe/stripe-js";

type StripeEnv = "sandbox" | "live";

// Phase 2 is intentionally sandbox-only. Keeping this explicit prevents the
// Lovable build environment from replacing the test configuration with live.
const environment: StripeEnv = "sandbox";
const clientToken =
  "pk_test_51TVvemDvtp0NFGCIpkU6JgrF3VaxkmvkITI1tiF1VUuMLqcvZCC0DGz6FMfqTqdtFMHD6kPzw331eeSFZgeWUa8U00bLbx999S";

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = loadStripe(clientToken);
  }
  return stripePromise;
}

export function getStripeEnvironment(): StripeEnv {
  return environment;
}
