import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const migration = read(
  "supabase/migrations/20260801134000_manual_pix_live_subscriptions.sql",
);
const admin = read("src/pages/dashboard/Admin.tsx");
const types = read("src/integrations/supabase/types.ts");

describe("manual Pix subscriptions in live", () => {
  it("records the payment origin, amount and administrator", () => {
    expect(migration).toContain("manual_payment_method text");
    expect(migration).toContain("manual_amount_paid_brl numeric(12, 2)");
    expect(migration).toContain("manual_payment_recorded_at timestamptz");
    expect(migration).toContain("manual_payment_recorded_by uuid references auth.users(id)");
    expect(migration).toContain("manual_payment_method = 'pix'");
    expect(migration).toContain("manual_amount_paid_brl > 0");
  });

  it("creates or renews only a one-month live entitlement", () => {
    expect(migration).toContain("function public.admin_upsert_pix_subscription");
    expect(migration).toContain("_duration_months <> 1");
    expect(migration).toContain("environment = 'live'");
    expect(migration).toContain("'live',");
    expect(migration.match(/interval '1 month'/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration).toContain("v_existing.manual_payment_method = 'pix'");
    expect(migration).toContain("coalesce(v_existing.expires_at, v_existing.current_period_end) + interval '1 month'");
  });

  it("requires finance permission and never overwrites Stripe", () => {
    expect(migration).toContain("public.admin_has_permission('finance')");
    expect(migration).toContain("live_stripe_subscription_exists");
    expect(migration).toContain("v_existing.stripe_customer_id is not null");
    expect(migration).toContain("v_existing.stripe_subscription_id is not null");
    expect(migration).toContain("normalize_subscription_payment_origin");
  });

  it("does not present a sandbox record as live in the admin overview", () => {
    const overviewStart = migration.indexOf("function public.admin_subscription_overview");
    const grantStart = migration.indexOf("function public.admin_upsert_pix_subscription");
    const overview = migration.slice(overviewStart, grantStart);

    expect(overview).toContain("candidate.environment = 'live'");
    expect(overview).toContain("has_sandbox_subscription boolean");
    expect(overview).toContain("sandbox_subscription.environment = 'sandbox'");
    expect(overview).not.toContain("(candidate.environment = 'live') desc");
  });

  it("offers an explicit LIVE Pix action with plan and amount", () => {
    expect(admin).toContain('supabase.rpc("admin_subscription_overview")');
    expect(admin).toContain('supabase.rpc("admin_upsert_pix_subscription"');
    expect(admin).toContain("Confirmar pagamento via Pix");
    expect(admin).toContain("Validade de 1 mês");
    expect(admin).toContain("Valor recebido via Pix (R$)");
    expect(admin).toContain("Somente sandbox — sem acesso real");
    expect(admin).not.toContain('from("user_subscriptions").insert');
  });

  it("keeps generated database contracts in sync", () => {
    expect(types).toContain("manual_amount_paid_brl: number | null");
    expect(types).toContain("manual_payment_method: string | null");
    expect(types).toContain("admin_subscription_overview");
    expect(types).toContain("admin_upsert_pix_subscription");
  });
});
