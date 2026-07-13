import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "supabase/functions/payments-reconcile/index.ts"),
  "utf8",
);
const stripeSource = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/stripe.ts"),
  "utf8",
);
const config = readFileSync(
  resolve(process.cwd(), "supabase/config.toml"),
  "utf8",
);

describe("payments-reconcile environment isolation", () => {
  it("requires an explicit sandbox or live environment after internal auth", () => {
    expect(source).toContain('body.environment !== "sandbox" && body.environment !== "live"');
    expect(source.indexOf("constantTimeEqual(suppliedAuth, expectedAuth)")).toBeLessThan(
      source.indexOf("createStripeClient(environment)"),
    );
  });

  it("selects credentials only through the environment-scoped Stripe factory", () => {
    expect(source).toContain("createStripeClient(environment)");
    expect(source).not.toContain("STRIPE_SANDBOX_API_KEY");
    expect(source).not.toContain("STRIPE_LIVE_API_KEY");
    expect(stripeSource).toContain('env === "sandbox"');
    expect(stripeSource).toContain('getEnv("STRIPE_SANDBOX_API_KEY")');
    expect(stripeSource).toContain('getEnv("STRIPE_LIVE_API_KEY")');
  });

  it("uses internal authentication because platform JWT verification is disabled", () => {
    expect(config).toMatch(/\[functions\.payments-reconcile\]\s+verify_jwt = false/);
    expect(source).toContain('request.headers.get("x-internal-secret")');
    expect(source).toContain("constantTimeEqual");
  });
});
