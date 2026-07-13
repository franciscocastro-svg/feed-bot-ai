import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260713223000_phase_1e_a_2_containment.sql",
  ),
  "utf8",
);

describe("Phase 1E-A.2 containment migration", () => {
  it("restores the live-only one-argument verification wrapper", () => {
    expect(migration).toMatch(
      /create or replace function public\.verify_email_code\(_code text\)[\s\S]*security invoker/i,
    );
    expect(migration).toMatch(
      /public\.verify_email_code\(_code, 'live'::text\)/i,
    );
    expect(migration).toMatch(
      /revoke execute on function public\.verify_email_code\(text\) from anon/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.verify_email_code\(text\) to authenticated/i,
    );
  });

  it("keeps the deployed webhook on an insert-only effect claim", () => {
    const claimFunction = migration.slice(
      migration.indexOf("create or replace function public.try_claim_payment_webhook_effect"),
      migration.indexOf("comment on function public.try_claim_payment_webhook_effect"),
    );

    expect(claimFunction).toContain("on conflict (provider, environment, event_id, effect_type) do nothing");
    expect(claimFunction).not.toMatch(/claim_expires_at\s*</i);
    expect(claimFunction).not.toMatch(/status\s+in\s*\('processing'/i);
  });

  it("contains the unguarded SECURITY DEFINER access RPC", () => {
    expect(migration).toMatch(
      /revoke execute on function public\.compute_subscription_access\(uuid,text\) from public, anon, authenticated/i,
    );
    expect(migration).toMatch(
      /grant execute on function public\.compute_subscription_access\(uuid,text\) to service_role/i,
    );
  });
});
