import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveStripeClientConfig } from "@/lib/stripe";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Stripe client environment activation", () => {
  it("derives sandbox from a test publishable key", () => {
    expect(resolveStripeClientConfig(" pk_test_example ")).toEqual({
      clientToken: "pk_test_example",
      environment: "sandbox",
    });
  });

  it("derives live from a live publishable key", () => {
    expect(resolveStripeClientConfig("pk_live_example")).toEqual({
      clientToken: "pk_live_example",
      environment: "live",
    });
  });

  it.each([undefined, "", "   ", "sk_live_secret", "invalid"])(
    "fails closed when the client token is missing or invalid",
    (clientToken) => {
      expect(() => resolveStripeClientConfig(clientToken)).toThrow(
        "VITE_PAYMENTS_CLIENT_TOKEN",
      );
    },
  );

  it("uses the build token without a hardcoded key or silent fallback", () => {
    const stripe = read("src/lib/stripe.ts");
    const banner = read("src/components/PaymentTestModeBanner.tsx");
    const limits = read("src/components/admin/PlanLimitsEditor.tsx");

    expect(stripe).toContain("import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN");
    expect(stripe).toContain('clientToken.startsWith("pk_test_")');
    expect(stripe).toContain('clientToken.startsWith("pk_live_")');
    expect(stripe).not.toMatch(
      /["']pk_(?:test|live)_[A-Za-z0-9]{20,}["']/,
    );
    expect(stripe).not.toContain('const environment: StripeEnv = "sandbox"');
    expect(banner).toContain('getStripeEnvironment() !== "sandbox"');
    expect(limits).toContain("environment: getStripeEnvironment()");
  });
});
