import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const migration = read(
  "supabase/migrations/20260714170000_phase_1e_a_2_checkout_dual_env_hotfix.sql",
);
const checkoutReturn = read("src/pages/CheckoutReturn.tsx");
const protectedRoute = read("src/components/ProtectedRoute.tsx");
const subscriptionHook = read("src/hooks/useSubscriptionStatus.tsx");
const verifyPage = read("src/pages/VerifyEmail.tsx");
const verifyFunction = read("supabase/functions/verify-code/index.ts");
const sendFunction = read("supabase/functions/send-verification-code/index.ts");
const webhook = read("supabase/functions/payments-webhook/index.ts");
const admin = read("src/pages/dashboard/Admin.tsx");

describe("Phase 1E-A.2/ii-c checkout activation hotfix", () => {
  it("removes only the legacy global uniqueness after the environment preflight", () => {
    const preflightAt = migration.indexOf("group by user_id, environment");
    const partialIndexAt = migration.indexOf("create unique index if not exists uq_user_subscriptions_current");
    const legacyDropAt = migration.indexOf("drop constraint if exists user_subscriptions_user_id_key");

    expect(preflightAt).toBeGreaterThan(-1);
    expect(partialIndexAt).toBeGreaterThan(preflightAt);
    expect(legacyDropAt).toBeGreaterThan(partialIndexAt);
    const schemaChanges = migration.slice(0, migration.indexOf("create or replace function public.verify_email_code"));
    expect(schemaChanges).not.toMatch(/delete\s+from\s+public\.user_subscriptions/i);
    expect(schemaChanges).not.toMatch(/update\s+public\.user_subscriptions\s+set/i);
  });

  it("keeps checkout and application access scoped to the configured Stripe environment", () => {
    for (const source of [checkoutReturn, protectedRoute, subscriptionHook]) {
      expect(source).toContain("getStripeEnvironment");
    }
    expect(checkoutReturn).toContain('.eq("environment", environment)');
    expect(checkoutReturn).toContain('.eq("terminal_state", false)');
    expect(protectedRoute).toContain('"compute_subscription_access"');
    expect(protectedRoute).toContain("_environment: environment");
    expect(subscriptionHook).toContain("_environment: getStripeEnvironment()");
  });

  it("passes and validates environment during code send and verification", () => {
    expect(verifyPage.match(/environment: getStripeEnvironment\(\)/g)).toHaveLength(2);
    expect(verifyFunction).toContain("_environment: environment");
    expect(sendFunction).toContain('.eq("environment", environment)');
    expect(sendFunction).toContain('.eq("terminal_state", false)');
    expect(migration).toContain("extensions.digest(_code, 'sha256')");
    expect(migration).not.toContain("update auth.users");
    expect(migration).toContain("when verification_attempts + 1 >= 5 then 0");
  });

  it("records the e-mail effect only after the provider accepted delivery", () => {
    const deliverAt = webhook.indexOf("await deliverVerificationCode(userId, env)");
    const effectAt = webhook.indexOf(
      'tryClaimEffect(env, event.id, "send_verification_code", requestId)',
      deliverAt,
    );
    expect(deliverAt).toBeGreaterThan(-1);
    expect(effectAt).toBeGreaterThan(deliverAt);
    expect(webhook).toContain("if (!response.ok || payload?.ok !== true)");
    expect(webhook).toContain("JSON.stringify({ user_id: userId, environment: env })");
  });

  it("serializes duplicate e-mail deliveries and rolls back a failed reservation", () => {
    expect(sendFunction).toContain("last_code_sent_at: reservedAt");
    expect(sendFunction).toContain('if (isInternal) return json({ ok: true, already: true })');
    expect(sendFunction).toContain("last_code_sent_at: sub.last_code_sent_at");
    expect(sendFunction).toContain("verification_email_delivery_failed");
    expect(sendFunction).not.toContain("body.slice(");
  });

  it("stops admin writes from relying on the removed user-only conflict target", () => {
    expect(admin).not.toContain('onConflict: "user_id"');
    expect(admin).toContain('.eq("environment", getStripeEnvironment())');
    expect(admin).toContain('.eq("terminal_state", false)');
    expect(migration).toContain("left join lateral");
  });
});
