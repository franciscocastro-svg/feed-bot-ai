import { describe, expect, it } from "vitest";
import {
  getInvoicePriceLookup,
  getInvoiceSubscriptionId,
  getSubscriptionPeriod,
} from "../../supabase/functions/_shared/stripe-event-compat";

describe("Stripe event compatibility", () => {
  it("prefers current subscription item periods and supports the legacy fallback", () => {
    expect(getSubscriptionPeriod({
      current_period_start: 10,
      current_period_end: 20,
      items: { data: [{ current_period_start: 30, current_period_end: 40 }] },
    })).toEqual({ periodStart: 30, periodEnd: 40 });

    expect(getSubscriptionPeriod({
      current_period_start: 10,
      current_period_end: 20,
    })).toEqual({ periodStart: 10, periodEnd: 20 });
  });

  it("reads subscription ids from current and legacy invoice shapes", () => {
    expect(getInvoiceSubscriptionId({ subscription: "sub_legacy" })).toBe("sub_legacy");
    expect(getInvoiceSubscriptionId({
      parent: { subscription_details: { subscription: "sub_current" } },
    })).toBe("sub_current");
    expect(getInvoiceSubscriptionId({
      lines: { data: [{
        parent: { subscription_item_details: { subscription: "sub_line" } },
      }] },
    })).toBe("sub_line");
  });

  it("reads plan lookup metadata from current and legacy invoice shapes", () => {
    expect(getInvoicePriceLookup({
      lines: { data: [{ price: { lookup_key: "pro_monthly" } }] },
    })).toBe("pro_monthly");
    expect(getInvoicePriceLookup({
      parent: { subscription_details: { metadata: { priceId: "business_yearly" } } },
    })).toBe("business_yearly");
  });

  it("returns undefined for unrelated payloads", () => {
    expect(getInvoiceSubscriptionId(null)).toBeUndefined();
    expect(getInvoicePriceLookup({ lines: { data: [] } })).toBeUndefined();
    expect(getSubscriptionPeriod({})).toEqual({ periodStart: undefined, periodEnd: undefined });
  });
});
