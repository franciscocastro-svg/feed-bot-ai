import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { planLabel, subscriptionMonthlyValue } from "@/lib/billing";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const migration = read(
  "supabase/migrations/20260801144500_live_plan_and_pix_fallback.sql",
);
const admin = read("src/pages/dashboard/Admin.tsx");
const planEditor = read("src/components/admin/PlanLimitsEditor.tsx");

describe("live Agency billing and public plan names", () => {
  it("resolves quota plans only from the latest live subscription", () => {
    const resolverStart = migration.indexOf("function public.get_user_plan");
    const pixStart = migration.indexOf("function public.admin_upsert_pix_subscription");
    const resolver = migration.slice(resolverStart, pixStart);

    expect(resolver).toContain("subscription.environment = 'live'");
    expect(resolver).toContain("subscription.terminal_state = false");
    expect(resolver).toContain("order by subscription.created_at desc, subscription.id desc");
    expect(resolver).not.toContain("environment = 'sandbox'");
    expect(resolver).toContain("return v_subscription.plan");
  });

  it("shows customer-facing names while retaining stable internal keys", () => {
    expect(planLabel("starter")).toBe("Creator");
    expect(planLabel("agency")).toBe("Agência");
    expect(planLabel("business")).toBe("Business");
    expect(admin).toContain("planLabel(r.plan)");
    expect(admin).toContain("planLabel(plan)");
    expect(planEditor).toContain("planLabel(p.plan)");
    expect(admin).not.toContain(">{r.plan}</Badge>");
    expect(planEditor).not.toContain(">{p.plan}</span>");
  });

  it("uses the recorded Pix amount before the catalog value", () => {
    const catalog = { agency: 0, business: 497.97 };

    expect(subscriptionMonthlyValue({
      plan: "agency",
      payment_method: "pix",
      amount_paid_brl: 1500,
    }, catalog)).toBe(1500);

    expect(subscriptionMonthlyValue({
      plan: "business",
      payment_method: "stripe",
      amount_paid_brl: null,
    }, catalog)).toBe(497.97);

    expect(admin).toContain("subscriptionMonthlyValue(r, planPrices)");
  });

  it("replaces only terminal Stripe failures with Pix", () => {
    expect(migration).toContain(
      "v_existing.status in ('canceled', 'unpaid', 'incomplete_expired')",
    );
    expect(migration).toContain("approval_reason = 'replaced_by_manual_pix'");
    expect(migration).toContain("'converted_from_failed_stripe'");
    expect(migration).toContain("raise exception 'live_stripe_subscription_exists'");
  });
});
