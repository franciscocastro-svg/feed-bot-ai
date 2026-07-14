import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "supabase/functions/payments-reconcile/index.ts"),
  "utf8",
);
const ledgerMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260714153000_phase_1e_a_2_reconcile_run_ledger.sql",
  ),
  "utf8",
);
const cronMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260714153100_phase_1e_a_2_reconcile_observable_cron.sql",
  ),
  "utf8",
);

describe("payments-reconcile durable observability", () => {
  it("keeps the sanitized run ledger private", () => {
    const tableDefinition = ledgerMigration.slice(
      ledgerMigration.indexOf("create table if not exists public.payment_reconcile_runs"),
      ledgerMigration.indexOf("create index if not exists payment_reconcile_runs_environment_queued_idx"),
    );
    expect(ledgerMigration).toContain("create table if not exists public.payment_reconcile_runs");
    expect(ledgerMigration).toContain("alter table public.payment_reconcile_runs enable row level security");
    expect(ledgerMigration).toContain(
      "revoke all on table public.payment_reconcile_runs from public, anon, authenticated",
    );
    expect(ledgerMigration).toContain(
      "grant select, insert, update on table public.payment_reconcile_runs to service_role",
    );
    expect(ledgerMigration).not.toMatch(/create policy/i);
    expect(tableDefinition).not.toMatch(/\b(email|customer_id|subscription_id|payload|headers|secret)\b/i);
  });

  it("records a dispatch before enqueueing pg_net and stores its correlation id", () => {
    const insertAt = ledgerMigration.indexOf("insert into public.payment_reconcile_runs");
    const httpAt = ledgerMigration.indexOf("select net.http_post");
    const requestAt = ledgerMigration.indexOf("set pg_net_request_id = v_request_id");
    expect(insertAt).toBeGreaterThan(-1);
    expect(httpAt).toBeGreaterThan(insertAt);
    expect(requestAt).toBeGreaterThan(httpAt);
    expect(ledgerMigration).toContain("'run_id', v_run_id");
    expect(ledgerMigration).toContain("timeout_milliseconds := 120000");
  });

  it("fences duplicate delivery before initializing Stripe", () => {
    const beginAt = source.indexOf("activeRunId = await beginReconcileRun");
    const stripeAt = source.indexOf("const stripe = createStripeClient(environment)");
    expect(beginAt).toBeGreaterThan(-1);
    expect(stripeAt).toBeGreaterThan(beginAt);
    expect(source).toContain('error_code === "reconcile_run_not_claimed" ? 409 : 500');
  });

  it("persists only the approved sanitized metrics on success and failure", () => {
    expect(source).toContain('await completeReconcileRun(');
    expect(source).toContain('"completed_with_errors"');
    expect(source).toContain('"failed"');
    for (const metric of [
      "subs_scanned",
      "subs_updated",
      "divergences",
      "effects_recovered",
      "errors_count",
      "response_http_status",
    ]) {
      expect(ledgerMigration).toContain(metric);
    }
    expect(ledgerMigration).toContain("error_code ~ '^[A-Za-z0-9_.-]{1,40}$'");
  });

  it("replaces exactly the two existing cron jobs with the correlated dispatcher", () => {
    expect(cronMigration.match(/select cron\.schedule\(/g)).toHaveLength(2);
    expect(cronMigration).toContain("payments-reconcile-sandbox");
    expect(cronMigration).toContain("payments-reconcile-live");
    expect(cronMigration).toContain("dispatch_payment_reconcile('sandbox')");
    expect(cronMigration).toContain("dispatch_payment_reconcile('live')");
    expect(cronMigration).not.toContain("net.http_post");
    expect(cronMigration).not.toMatch(/https:\/\/[^'\s]+\/functions\/v1\/payments-reconcile/);
  });
});
