import { describe, expect, it } from "vitest";
import { validateEdgeFunctionManifest } from "../../scripts/edge-function-manifest.mjs";

const validManifest = {
  version: 1,
  affectedFunctions: [
    {
      name: "payments-webhook",
      entrypoint: "supabase/functions/payments-webhook/index.ts",
      config: "supabase/functions/payments-webhook/deno.json",
      lock: "supabase/functions/payments-webhook/deno.lock",
      verifyJwt: false,
    },
  ],
  releaseConstraints: {
    databaseMigrations: false,
    frontendPublish: false,
    otherEdgeFunctions: false,
    vpsRuntimeChange: false,
  },
};

const configToml = `
[functions.payments-webhook]
verify_jwt = false
`;

describe("Edge Function deployment manifest", () => {
  it("accepts an isolated, internally consistent deployment", () => {
    expect(validateEdgeFunctionManifest(validManifest, {
      fileExists: () => true,
      configToml,
    })).toEqual([]);
  });

  it("rejects paths outside the declared function", () => {
    const manifest = structuredClone(validManifest);
    manifest.affectedFunctions[0].entrypoint = "supabase/functions/other/index.ts";

    expect(validateEdgeFunctionManifest(manifest, {
      fileExists: () => true,
      configToml,
    })).toContain(
      "payments-webhook.entrypoint must stay inside supabase/functions/payments-webhook/",
    );
  });

  it("rejects JWT drift and expanded release scope", () => {
    const manifest = structuredClone(validManifest);
    manifest.affectedFunctions[0].verifyJwt = true;
    manifest.releaseConstraints.frontendPublish = true;

    expect(validateEdgeFunctionManifest(manifest, {
      fileExists: () => true,
      configToml,
    })).toEqual([
      "payments-webhook.verifyJwt does not match supabase/config.toml",
      "releaseConstraints.frontendPublish must be false",
    ]);
  });

  it("validates the repository manifest and referenced files", async () => {
    const manifest = (await import("../../ops/edge-functions-critical.json")).default;
    expect(validateEdgeFunctionManifest(manifest)).toEqual([]);
  });
});
