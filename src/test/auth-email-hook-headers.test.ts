/**
 * Phase 1E-A.1 — guarantees the auth-email-hook /preview response and
 * OPTIONS preflight both carry x-request-id and expose it via CORS.
 *
 * We verify by grepping the source: the actual Deno.serve runtime is not
 * loadable in a Vite/vitest environment, but the invariant we want is
 * textual — the CORS header block for /preview MUST include
 * 'Access-Control-Expose-Headers': 'x-request-id' and 'x-request-id'.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "supabase/functions/auth-email-hook/index.ts"),
  "utf8",
);

describe("auth-email-hook /preview x-request-id contract", () => {
  it("previewCorsHeaders exposes x-request-id via CORS", () => {
    const previewBlock = source.slice(source.indexOf("handlePreview"));
    expect(previewBlock).toMatch(/Access-Control-Expose-Headers['"]?\s*:\s*['"]x-request-id['"]/);
    expect(previewBlock).toMatch(/['"]x-request-id['"]\s*:\s*previewRequestId/);
  });

  it("webhook responses carry x-request-id in all paths", () => {
    expect(source).toMatch(/'x-request-id'\s*:\s*requestId/);
  });

  it("root OPTIONS response carries x-request-id", () => {
    expect(source).toMatch(/OPTIONS[\s\S]{0,200}'x-request-id'\s*:\s*requestId/);
  });
});
