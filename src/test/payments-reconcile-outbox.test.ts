import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  canRetryEffect,
  getEffectPolicy,
  retryDelaySeconds,
} from "../../supabase/functions/_shared/webhook-effect-policy";

const source = readFileSync(
  resolve(process.cwd(), "supabase/functions/payments-reconcile/index.ts"),
  "utf8",
);
const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260713234500_phase_1e_a_2_reconcile_cron.sql",
  ),
  "utf8",
);

describe("payments-reconcile outbox policy", () => {
  it("retries only the three reviewed idempotent effects", () => {
    expect(getEffectPolicy("stripe_cancel_after_refund")).toBe("retry");
    expect(getEffectPolicy("meta_start_trial")).toBe("retry");
    expect(getEffectPolicy("meta_purchase")).toBe("retry");
    expect(getEffectPolicy("send_verification_code")).toBe("manual_resend");
    expect(getEffectPolicy("foo_bar")).toBe("unsupported");
    expect(canRetryEffect("meta_purchase", 7)).toBe(true);
    expect(canRetryEffect("meta_purchase", 8)).toBe(false);
  });

  it("uses capped exponential backoff", () => {
    expect(retryDelaySeconds(0)).toBe(60);
    expect(retryDelaySeconds(1)).toBe(120);
    expect(retryDelaySeconds(6)).toBe(3_600);
    expect(retryDelaySeconds(99)).toBe(3_600);
  });

  it("claims atomically with a fenced lease and does not change the legacy claim RPC", () => {
    expect(migration).toContain("claim_payment_webhook_effects_for_reconcile");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("effect.attempt_count < 8");
    expect(migration).toContain("effect.claim_expires_at < now()");
    expect(migration).not.toContain("create or replace function public.try_claim_payment_webhook_effect");
  });

  it("never retries verification e-mail or an unknown effect", () => {
    expect(source).toContain('policy === "manual_resend" ? "skipped" : "failed"');
    expect(source).toContain('"manual_resend_required"');
    expect(source).toContain('"unsupported_effect_type"');
    expect(migration).not.toMatch(/effect\.effect_type in \([\s\S]*send_verification_code/);
  });

  it("checks cancellation state first and reuses the stable Stripe event id for Meta", () => {
    const retrieve = source.indexOf("stripe.subscriptions.retrieve(subscriptionId)");
    const cancel = source.indexOf("stripe.subscriptions.cancel(subscriptionId");
    expect(retrieve).toBeGreaterThan(-1);
    expect(cancel).toBeGreaterThan(retrieve);
    expect(source).toContain('event_id: `stripe_${eventId}`');
  });

  it("versions both cron jobs without embedding values", () => {
    expect(migration).toContain("payments-reconcile-sandbox");
    expect(migration).toContain("payments-reconcile-live");
    expect(migration).toContain("vault.decrypted_secrets");
    expect(migration).toContain("PAYMENTS_RECONCILE_URL_SANDBOX");
    expect(migration).toContain("PAYMENTS_RECONCILE_URL_LIVE");
    expect(migration).not.toMatch(/https:\/\/[^'\s]+\/functions\/v1\/payments-reconcile/);
  });
});
