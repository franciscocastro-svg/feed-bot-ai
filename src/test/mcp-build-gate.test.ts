import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const approvedProjectRef = "gewnaxrhiyylfizgbqdi";

const source = read("src/lib/mcp/index.ts");
const generated = read("supabase/functions/mcp/index.ts");
const gate = read("scripts/check-mcp-build.mjs");
const deploy = read("scripts/deploy-vps.sh");
const packageJson = JSON.parse(read("package.json")) as {
  scripts: Record<string, string>;
};

describe("Gate MCP-BUILD", () => {
  it("mantem o issuer publico deterministico sem depender de VITE", () => {
    expect(source).toContain(`const MCP_SUPABASE_PROJECT_REF = "${approvedProjectRef}"`);
    expect(source).toContain("issuer: MCP_OAUTH_ISSUER");
    expect(generated).toContain(`var MCP_SUPABASE_PROJECT_REF = "${approvedProjectRef}"`);
    expect(generated).toContain(
      "var MCP_OAUTH_ISSUER = `https://${MCP_SUPABASE_PROJECT_REF}.supabase.co/auth/v1`;",
    );

    for (const forbidden of ["project-ref-unset", "VITE_", "define_import_meta_env_default"]) {
      expect(source).not.toContain(forbidden);
      expect(generated).not.toContain(forbidden);
    }
  });

  it("executa build protegido e oferece a matriz reproduzivel B1M", () => {
    expect(packageJson.scripts["check:mcp-build"]).toBe("node scripts/check-mcp-build.mjs");
    expect(packageJson.scripts["check:mcp-build:matrix"]).toContain("--matrix");
    expect(packageJson.scripts.ci).toContain("npm run check:mcp-build");
    expect(gate).toContain("process-project-ref-only");
    expect(gate).toContain("process-unrelated-vite-sentinel");
    expect(gate).toContain("production-env-precedence");
    expect(gate).toContain("PASS_MCP_BUILD_REPRODUCIBLE_CLEAN_WORKTREE");
  });

  it("bloqueia PM2 e rollback por checkout quando a preparacao suja o worktree", () => {
    expect(deploy).toContain("stop_on_prepare_drift");
    expect(deploy).toContain('PREPARE_FAILURE_REASON="tracked_worktree_changed_after_build"');
    expect(deploy).toContain('emit_result "INTERRUPTED" "$PREPARE_FAILURE_REASON"');
    expect(deploy).toContain("o worktree sera preservado para auditoria");
  });
});
