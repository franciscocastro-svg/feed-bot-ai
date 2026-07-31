import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { resolveStripeClientConfig } from "@/lib/stripe";
import { authorizeAdminSection } from "../../supabase/functions/_shared/admin-authorization";

const read = (path: string) =>
  readFileSync(join(process.cwd(), path), "utf8");

describe("admin Stripe price authorization", () => {
  it("allows an authenticated administrator with the plans permission", async () => {
    const checkPermission = vi.fn().mockResolvedValue(true);
    const result = await authorizeAdminSection(
      {
        getAuthenticatedUserId: vi.fn().mockResolvedValue("admin-user-id"),
        checkPermission,
      },
      "plans",
    );

    expect(result).toEqual({ ok: true, userId: "admin-user-id" });
    expect(checkPermission).toHaveBeenCalledWith("plans");
  });

  it("fails closed when the authenticated user lacks permission", async () => {
    const result = await authorizeAdminSection(
      {
        getAuthenticatedUserId: vi.fn().mockResolvedValue("regular-user-id"),
        checkPermission: vi.fn().mockResolvedValue(false),
      },
      "plans",
    );

    expect(result).toEqual({
      ok: false,
      status: 403,
      code: "forbidden",
    });
  });

  it("rejects a missing session without checking permissions", async () => {
    const checkPermission = vi.fn();
    const result = await authorizeAdminSection(
      {
        getAuthenticatedUserId: vi.fn().mockResolvedValue(null),
        checkPermission,
      },
      "plans",
    );

    expect(result).toEqual({
      ok: false,
      status: 401,
      code: "unauthorized",
    });
    expect(checkPermission).not.toHaveBeenCalled();
  });

  it("fails closed when the permission RPC fails", async () => {
    const result = await authorizeAdminSection(
      {
        getAuthenticatedUserId: vi.fn().mockResolvedValue("admin-user-id"),
        checkPermission: vi.fn().mockRejectedValue(new Error("database detail")),
      },
      "plans",
    );

    expect(result).toEqual({
      ok: false,
      status: 503,
      code: "permission_check_failed",
    });
  });

  it("uses the caller JWT for auth and the permission RPC", () => {
    const source = read(
      "supabase/functions/admin-sync-stripe-price/index.ts",
    );

    expect(source).toContain("Deno.env.get(\"SUPABASE_ANON_KEY\")");
    expect(source).toContain(
      "global: { headers: { Authorization: authorizationHeader } }",
    );
    expect(source).toContain("userClient.auth.getUser()");
    expect(source).toContain(
      'userClient.rpc("admin_has_permission"',
    );
    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(source).not.toMatch(/\bbody\.(?:user|userId|user_id)\b/);
  });

  it("keeps operational logs sanitized", () => {
    const source = read(
      "supabase/functions/admin-sync-stripe-price/index.ts",
    );

    expect(source).toContain('scope: "admin-sync-stripe-price"');
    expect(source).not.toMatch(/console\.(?:error|warn)\([^)]*,\s*(?:e|error)\b/);
    expect(source).not.toMatch(/console\.(?:error|warn)\([^)]*(?:token|email|key)/i);
  });
});

describe("preview Stripe configuration", () => {
  it("fails closed when VITE_PAYMENTS_CLIENT_TOKEN is missing", () => {
    expect(() => resolveStripeClientConfig(undefined)).toThrow(
      "VITE_PAYMENTS_CLIENT_TOKEN is required",
    );
  });
});
