import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  customerForCheckout,
  isBlockingStoredSubscription,
  isBlockingStripeStatus,
  reusableCustomerId,
  type StoredSubscriptionForCheckout,
} from "../../supabase/functions/_shared/stripe-subscription-guard";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const checkout = read("supabase/functions/create-checkout/index.ts");
const checkoutUi = read("src/components/StripeEmbeddedCheckout.tsx");

const subscription = (
  overrides: Partial<StoredSubscriptionForCheckout> = {},
): StoredSubscriptionForCheckout => ({
  approval_status: "approved",
  plan: "starter",
  status: "active",
  stripe_customer_id: "cus_current",
  stripe_subscription_id: "sub_current",
  terminal_state: false,
  ...overrides,
});

describe("Stripe duplicate subscription guard", () => {
  it.each(["active", "trialing", "past_due"])(
    "blocks the Stripe status %s",
    (status) => {
      expect(isBlockingStripeStatus(status)).toBe(true);
      expect(isBlockingStoredSubscription(subscription({ status }))).toBe(true);
    },
  );

  it("does not mistake the active free row for a paid subscription", () => {
    expect(isBlockingStoredSubscription(subscription({
      plan: "free",
      stripe_customer_id: null,
      stripe_subscription_id: null,
    }))).toBe(false);
  });

  it("allows a new checkout after the prior database record became terminal", () => {
    expect(isBlockingStoredSubscription(subscription({
      terminal_state: true,
    }))).toBe(false);
  });

  it("blocks an approved manual paid plan without offering a Stripe customer", () => {
    expect(isBlockingStoredSubscription(subscription({
      plan: "pro",
      stripe_customer_id: null,
      stripe_subscription_id: null,
    }))).toBe(true);
  });

  it("reuses the latest available Customer and never sends customer_email with it", () => {
    const rows = [
      subscription({ stripe_customer_id: "cus_reused" }),
      subscription({ stripe_customer_id: "cus_old" }),
    ];
    expect(reusableCustomerId(rows)).toBe("cus_reused");
    expect(customerForCheckout("cus_reused", "verified@example.com")).toEqual({
      customer: "cus_reused",
    });
    expect(customerForCheckout(null, "verified@example.com")).toEqual({
      customer_email: "verified@example.com",
    });
  });

  it("fails closed in the backend and provides the current-subscription portal in the UI", () => {
    expect(checkout).toContain('Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")');
    expect(checkout).toContain('.eq("user_id", verifiedUserId)');
    expect(checkout).toContain('.eq("environment", env)');
    expect(checkout).toContain("stripe.subscriptions.list");
    expect(checkout).toContain('code: "subscription_exists"');
    expect(checkout).toContain("customerForCheckout(existingCustomerId, verifiedEmail)");
    expect(checkout).toContain("idempotencyKey:");
    expect(checkoutUi).toContain('"create-portal-session"');
    expect(checkoutUi).toContain("Gerenciar assinatura atual");
    expect(checkoutUi).not.toContain("customerEmail");
    expect(checkoutUi).not.toContain("userId");
  });
});
