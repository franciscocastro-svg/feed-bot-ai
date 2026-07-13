import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260713231500_phase_1e_a_2_rpc_fix.sql",
  ),
  "utf8",
);

describe("Phase 1E-A.2/i-b RPC correction migration", () => {
  it("enforces self-only access before granting authenticated execution", () => {
    expect(migration).toMatch(/v_caller_id uuid := auth\.uid\(\)/i);
    expect(migration).toMatch(/v_caller_role text := coalesce\(auth\.jwt\(\) ->> 'role'/i);
    expect(migration).toMatch(/v_caller_id <> _user_id[\s\S]{0,100}raise exception 'forbidden'/i);
    expect(migration).toMatch(/grant execute on function public\.compute_subscription_access\(uuid,text\) to authenticated, service_role/i);
  });

  it("allows only active, trialing, or bounded past_due states", () => {
    expect(migration).toContain("r.status not in ('active', 'trialing', 'past_due')");
    expect(migration).toContain("now() - interval '72 hours'");
    expect(migration).toContain("r.status <> 'past_due'");
    expect(migration).toContain("coalesce(r.plan, 'free') in ('free', 'expired')");
    expect(migration).not.toContain("grace_until_period_end");
  });

  it("fenced-completes the webhook ledger inside the mutation transaction", () => {
    expect(migration).toMatch(/select public\.complete_payment_webhook_event\([\s\S]*p_request_id[\s\S]*\) into v_completed/i);
    expect(migration).toMatch(/v_completed is distinct from true[\s\S]{0,100}raise exception 'webhook_fence_lost'/i);
  });

  it("only replaces a terminal current row with a new subscription", () => {
    expect(migration).toMatch(/v_current\.status in \('canceled', 'unpaid', 'incomplete_expired'\)/i);
    expect(migration).toMatch(/v_current\.refund_state = 'full'/i);
    expect(migration).toMatch(/found and coalesce\(p_terminal, false\) = false/i);
    expect(migration).toMatch(/raise exception 'active_subscription_conflict'/i);
  });

  it("leaves the temporary effect-claim containment untouched", () => {
    expect(migration).not.toContain("create or replace function public.try_claim_payment_webhook_effect");
    expect(migration).not.toContain("cron.schedule");
  });
});
