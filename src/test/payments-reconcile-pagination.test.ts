import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "supabase/functions/payments-reconcile/index.ts"),
  "utf8",
);

describe("payments-reconcile pagination", () => {
  it("uses a bounded 500-row page and an ordered created_at/id cursor", () => {
    expect(source).toContain("const PAGE_SIZE = 500");
    expect(source).toContain('.order("created_at", { ascending: true })');
    expect(source).toContain('.order("id", { ascending: true })');
    expect(source).toContain("created_at.gt.${cursor.createdAt}");
    expect(source).toContain("id.gt.${cursor.id}");
    expect(source).toContain(".limit(PAGE_SIZE)");
  });

  it("selects only required subscription columns and never performs SELECT star", () => {
    expect(source).toContain(
      '"id,user_id,environment,plan,status,stripe_subscription_id,current_period_end,cancel_at_period_end,refund_state,created_at"',
    );
    expect(source).not.toMatch(/\.select\(\s*["'`]\*["'`]\s*\)/);
    expect(source).toContain('.eq("terminal_state", false)');
    expect(source).toContain('.not("stripe_subscription_id", "is", null)');
  });

  it("bounds runtime and external concurrency", () => {
    expect(source).toContain("const MAX_RUNTIME_MS = 110_000");
    expect(source).toContain("const SUBSCRIPTION_CONCURRENCY = 10");
    expect(source).toContain("while (Date.now() - startedAt < MAX_RUNTIME_MS)");
  });

  it("compares period timestamps by instant instead of wire formatting", () => {
    expect(source).toContain("function sameInstant");
    expect(source).toContain("Date.parse(left)");
    expect(source).toContain("!sameInstant(local.current_period_end, remote.periodEnd)");
  });
});
