import { describe, expect, it } from "vitest";
import {
  resolveSubscriptionAccessView,
  type SubscriptionAccessSnapshot,
} from "@/lib/subscriptionAccess";

function access(overrides: Partial<SubscriptionAccessSnapshot> = {}): SubscriptionAccessSnapshot {
  return {
    has_access: false,
    status: "active",
    approval_status: "approved",
    reason: "active",
    ...overrides,
  };
}

describe("subscription access presentation", () => {
  it("allows a valid manual/Pix subscription without requiring a Stripe identifier", () => {
    expect(resolveSubscriptionAccessView(access({ has_access: true }))).toBe("allowed");
  });

  it("never bypasses a deny result because status and approval look active", () => {
    expect(resolveSubscriptionAccessView(access({ reason: "email_not_verified" }))).toBe("verify_email");
    expect(resolveSubscriptionAccessView(access({ reason: "pending_approval" }))).toBe("pending_approval");
    expect(resolveSubscriptionAccessView(access({ reason: "unexpected_state" }))).toBe("unavailable");
  });

  it.each(["no_subscription", "no_paid_plan"])("uses checkout only for %s", (reason) => {
    expect(resolveSubscriptionAccessView(access({ reason }))).toBe("checkout_required");
  });

  it.each(["blocked", "rejected"])("denies %s without offering checkout", (reason) => {
    expect(resolveSubscriptionAccessView(access({ reason }))).toBe("denied");
  });

  it.each(["expired", "past_due_expired"])("explains expiration for %s", (reason) => {
    expect(resolveSubscriptionAccessView(access({ reason }))).toBe("expired");
  });

  it.each(["access_frozen", "refunded", "unpaid", "incomplete_expired"])(
    "routes %s to subscription support",
    (reason) => {
      expect(resolveSubscriptionAccessView(access({ reason }))).toBe("payment_issue");
    },
  );

  it("fails closed when no access result exists", () => {
    expect(resolveSubscriptionAccessView(null)).toBe("unavailable");
  });

  it("preserves the explicit admin bypass", () => {
    expect(resolveSubscriptionAccessView(null, true)).toBe("allowed");
  });
});
