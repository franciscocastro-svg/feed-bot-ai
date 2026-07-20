import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  expectedArtifacts,
  normalizeOperationalSql,
  validateEditorialMigrationArtifacts,
} from "../../scripts/check-editorial-migration-artifacts.mjs";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

type ReleaseManifest = {
  migrations: string[];
  reconciliation: {
    migrationApplied: boolean;
    reapplyAllowed: boolean;
    pendingMigrations: string[];
  };
  rolloutOrder: string[];
  guardrails: {
    migrationReapplication: boolean;
  };
};

const manifest = JSON.parse(
  read("ops/releases/configurable-editorial-reels-6-20-30.json"),
) as ReleaseManifest;
const sourceSql = read(expectedArtifacts.source.path);
const lovableSql = read(expectedArtifacts.lovable.path);
const migrationFiles = fs
  .readdirSync(path.join(root, "supabase/migrations"))
  .filter((name) => name.endsWith(".sql"))
  .map((name) => ({
    path: `supabase/migrations/${name}`,
    contents: read(`supabase/migrations/${name}`),
  }));

const validate = (overrides: Record<string, unknown> = {}) =>
  validateEditorialMigrationArtifacts({
    manifest: structuredClone(manifest),
    sourceSql,
    lovableSql,
    migrationFiles,
    ...overrides,
  });

describe("Gate dos artefatos da migration editorial", () => {
  it("reconhece somente o par aprovado e bloqueia reaplicacao", () => {
    expect(validate()).toEqual([]);
    expect(normalizeOperationalSql(sourceSql)).toBe(normalizeOperationalSql(lovableSql));
    expect(manifest.reconciliation.pendingMigrations).toEqual([]);
    expect(manifest.reconciliation.reapplyAllowed).toBe(false);
  });

  it("falha quando qualquer artefato muda byte a byte", () => {
    expect(validate({ sourceSql: `${sourceSql}\n-- drift` })).toContain(
      "sourceArtifact: arquivo mudou byte a byte",
    );
    expect(validate({ lovableSql: lovableSql.replace("120s", "121s") })).toEqual(
      expect.arrayContaining([
        "lovableArtifact: arquivo mudou byte a byte",
        "artefato Lovable perdeu os timeouts autorizados",
        "artefatos deixaram de ser operacionalmente equivalentes",
      ]),
    );
  });

  it("falha com uma terceira copia operacional", () => {
    expect(
      validate({
        migrationFiles: [
          ...migrationFiles,
          { path: "supabase/migrations/20990101000000_duplicate.sql", contents: sourceSql },
        ],
      }),
    ).toEqual(expect.arrayContaining([expect.stringContaining("grupo de duplicatas inesperado")]));
  });

  it("falha se manifesto voltar a permitir ou solicitar aplicacao", () => {
    const changed = structuredClone(manifest);
    changed.reconciliation.migrationApplied = false;
    changed.reconciliation.reapplyAllowed = true;
    changed.reconciliation.pendingMigrations = [expectedArtifacts.source.path];
    changed.rolloutOrder = ["migration", ...changed.rolloutOrder];
    changed.guardrails.migrationReapplication = true;

    expect(validate({ manifest: changed })).toEqual(
      expect.arrayContaining([
        "manifesto nao registra migrationApplied=true",
        "reaplicacao nao esta bloqueada",
        "existem migrations editoriais marcadas como pendentes",
        "rollout ainda solicita aplicacao de migration",
        "guardrail de reaplicacao nao esta fechado",
      ]),
    );
  });
});
