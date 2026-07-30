import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Stripe Phase 2 sandbox deployment", () => {
  it("does not let the build environment switch checkout to live", () => {
    const stripe = read("src/lib/stripe.ts");
    const banner = read("src/components/PaymentTestModeBanner.tsx");
    const limits = read("src/components/admin/PlanLimitsEditor.tsx");

    expect(stripe).toContain('const environment: StripeEnv = "sandbox"');
    expect(stripe).toContain('"pk_test_');
    expect(stripe).not.toContain("VITE_PAYMENTS_CLIENT_TOKEN");
    expect(banner).toContain('getStripeEnvironment() !== "sandbox"');
    expect(limits).toContain("environment: getStripeEnvironment()");
  });
});
