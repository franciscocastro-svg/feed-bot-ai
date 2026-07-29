import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const migration = read(
  "supabase/migrations/20260729210000_four_plans_billing_limits.sql",
);
const pricing = read("src/pages/Pricing.tsx");
const landingPricing = read("src/components/landing/PricingSection.tsx");
const checkout = read("supabase/functions/create-checkout/index.ts");
const stripeSync = read("supabase/functions/admin-sync-stripe-price/index.ts");
const planUsage = read("src/components/PlanUsageCard.tsx");
const overview = read("src/pages/dashboard/Overview.tsx");
const autopilot = read("supabase/functions/autopilot/index.ts");
const publisher = read("supabase/functions/publish-scheduler/index.ts");

describe("four commercial plans and billing limits", () => {
  it("prepares the exact commercial prices without touching subscriptions", () => {
    expect(migration).toContain("'starter', 'Creator', 97.97, false, 7");
    expect(migration).toContain("'pro', 'Pro', 197.97, false, 7");
    expect(migration).toContain("'business', 'Business', 437.97, false, 7");
    expect(migration).toContain("'agency', 'Agência', NULL, true, NULL");
    expect(migration).not.toMatch(/\b(?:UPDATE|INSERT INTO|DELETE FROM)\s+public\.user_subscriptions/i);
    expect(migration).not.toContain("stripe_customer_id");
    expect(migration).not.toContain("stripe_subscription_id");
  });

  it("keeps monthly Reels unlimited on every paid plan", () => {
    const paidRows = migration.match(/\(\s*'(?:starter|pro|business|agency)'[\s\S]*?\)/g) || [];
    expect(paidRows).toHaveLength(4);
    for (const row of paidRows) {
      expect(row).toMatch(/,\s*-1,\s*(?:100|500|2000|-1),/);
    }
    expect(pricing).not.toContain("reels IA/mês");
    expect(landingPricing).not.toContain("reels IA/mês");
    expect(planUsage).not.toContain('label="Reels IA (mês)"');
    expect(overview).not.toContain('label="Reels (mês)"');
  });

  it("offers card checkout only for Creator, Pro and Business", () => {
    expect(checkout).toContain('"starter_monthly"');
    expect(checkout).toContain('"pro_monthly"');
    expect(checkout).toContain('"business_monthly"');
    expect(checkout).not.toContain('"agency_monthly"');
    expect(pricing).toContain('business: "business_monthly"');
    expect(pricing).toContain("Quero conhecer o plano Agência");
    expect(landingPricing).toContain('business: { label: "Testar Business por 7 dias"');
    expect(landingPricing).toContain('agency: { label: "Falar com um especialista", whatsapp: true }');
    expect(stripeSync).toContain("business_monthly");
    expect(stripeSync).not.toContain("agency_monthly");
  });

  it("communicates the all-format per-account publication limit", () => {
    expect(pricing).toContain("publicações/dia por conta");
    expect(pricing).toContain("Feed, Reels, Carrosséis e Stories");
    expect(pricing).toContain("Um carrossel completo conta como uma publicação");
    expect(landingPricing).toContain("limite diário é separado por Instagram");
    expect(planUsage).toContain("Limite diário");
    expect(planUsage).toContain("por conta");
  });

  it("removes the global daily blocker while preserving per-account gates", () => {
    expect(autopilot).toContain("capDailyPublications");
    expect(autopilot).toContain("dailyCountByIg");
    expect(autopilot).not.toContain("remainingDailyCap");
    expect(autopilot).not.toContain("masterDailyCap");
    expect(publisher).toContain("capDailyPublications");
    expect(publisher).toContain("accountLimitReached");
    expect(publisher).not.toContain("hasDailyCapacity");
    expect(publisher).not.toContain('reason: "daily limit reached"');
  });

  it("preserves cut, account, source and template gates for every plan", () => {
    expect(migration).toContain("1, 30, 3");
    expect(migration).toContain("5, 60, 5");
    expect(migration).toContain("20, 120, 5");
    expect(migration).toContain("50, 180, 5");
    expect(migration).toContain("max_ig_accounts = EXCLUDED.max_ig_accounts");
    expect(migration).toContain("max_rss_sources = EXCLUDED.max_rss_sources");
    expect(migration).toContain("max_templates = EXCLUDED.max_templates");
    expect(migration).toContain("max_cuts_per_day = EXCLUDED.max_cuts_per_day");
  });
});
