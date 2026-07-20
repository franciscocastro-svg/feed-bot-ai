import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestRelativePath = "ops/releases/configurable-editorial-reels-6-20-30.json";

export const expectedArtifacts = {
  source: {
    path: "supabase/migrations/20260720200000_reconcile_editorial_reel_duration.sql",
    sha256: "1cad381b9b7376c90e913b6eddbb7dfba2eb26472563c96b45533cf49b5d20b8",
    sizeBytes: 5148,
  },
  lovable: {
    path: "supabase/migrations/20260720201720_5433215c-5def-4898-abe7-47b384988f98.sql",
    sha256: "e3889670aa31ef53597a6144ae6bd06ccea8b0911b4f5616407beb827d5e08f5",
    sizeBytes: 4583,
  },
};

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeOperationalSql(value) {
  return value
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/u)
    .filter((line) => !/^\s*--/u.test(line))
    .filter((line) => !/^\s*SET\s+lock_timeout\s*=\s*'3s';\s*$/iu.test(line))
    .filter((line) => !/^\s*SET\s+statement_timeout\s*=\s*'120s';\s*$/iu.test(line))
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "")
    .join("\n");
}

function artifactErrors(label, artifact, expected, contents) {
  const errors = [];
  if (artifact?.path !== expected.path) errors.push(`${label}: path divergente`);
  if (artifact?.sha256 !== expected.sha256) errors.push(`${label}: sha256 do manifesto divergente`);
  if (artifact?.sizeBytes !== expected.sizeBytes) errors.push(`${label}: tamanho do manifesto divergente`);
  if (sha256(contents) !== expected.sha256) errors.push(`${label}: arquivo mudou byte a byte`);
  if (Buffer.byteLength(contents) !== expected.sizeBytes) errors.push(`${label}: tamanho do arquivo mudou`);
  return errors;
}

export function validateEditorialMigrationArtifacts({ manifest, sourceSql, lovableSql, migrationFiles }) {
  const errors = [];
  const reconciliation = manifest?.reconciliation;

  if (!reconciliation || reconciliation.migrationApplied !== true) {
    errors.push("manifesto nao registra migrationApplied=true");
  }
  if (reconciliation?.applicationResult !== "PASS_APPLIED_POSTCHECK_GREEN") {
    errors.push("resultado de aplicacao nao esta fechado como PASS_APPLIED_POSTCHECK_GREEN");
  }
  if (reconciliation?.ledgerStatus !== "not-readable-with-current-role") {
    errors.push("estado do ledger deve permanecer explicitamente nao verificavel");
  }
  if (reconciliation?.reapplyAllowed !== false) errors.push("reaplicacao nao esta bloqueada");
  if (!Array.isArray(reconciliation?.pendingMigrations) || reconciliation.pendingMigrations.length !== 0) {
    errors.push("existem migrations editoriais marcadas como pendentes");
  }
  if (reconciliation?.sourceArtifact?.status !== "source-only-do-not-apply") {
    errors.push("artefato fonte nao esta bloqueado para aplicacao");
  }
  if (reconciliation?.lovableArtifact?.status !== "observed-applied-do-not-reapply") {
    errors.push("artefato Lovable nao esta bloqueado para reaplicacao");
  }

  errors.push(
    ...artifactErrors("sourceArtifact", reconciliation?.sourceArtifact, expectedArtifacts.source, sourceSql),
    ...artifactErrors("lovableArtifact", reconciliation?.lovableArtifact, expectedArtifacts.lovable, lovableSql),
  );

  if (!lovableSql.startsWith("SET lock_timeout = '3s';\nSET statement_timeout = '120s';\n")) {
    errors.push("artefato Lovable perdeu os timeouts autorizados");
  }
  if (normalizeOperationalSql(sourceSql) !== normalizeOperationalSql(lovableSql)) {
    errors.push("artefatos deixaram de ser operacionalmente equivalentes");
  }

  const matching = migrationFiles
    .filter((entry) => normalizeOperationalSql(entry.contents) === normalizeOperationalSql(sourceSql))
    .map((entry) => entry.path)
    .sort();
  const expectedMatching = [expectedArtifacts.source.path, expectedArtifacts.lovable.path].sort();
  if (JSON.stringify(matching) !== JSON.stringify(expectedMatching)) {
    errors.push(`grupo de duplicatas inesperado: ${matching.join(",") || "vazio"}`);
  }

  for (const expected of Object.values(expectedArtifacts)) {
    if (!manifest.migrations?.includes(expected.path)) {
      errors.push(`manifesto nao inventaria ${expected.path}`);
    }
  }
  if (manifest.rolloutOrder?.includes("migration")) {
    errors.push("rollout ainda solicita aplicacao de migration");
  }
  if (!manifest.rolloutOrder?.includes("migration-artifact-gate-no-reapply")) {
    errors.push("rollout nao exige o gate de artefatos");
  }
  if (manifest.guardrails?.migrationReapplication !== false) {
    errors.push("guardrail de reaplicacao nao esta fechado");
  }

  return errors;
}

function readMigrationFiles(root) {
  const migrationRoot = join(root, "supabase/migrations");
  return readdirSync(migrationRoot)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => {
      const absolutePath = join(migrationRoot, name);
      const stats = lstatSync(absolutePath);
      if (!stats.isFile() || stats.isSymbolicLink()) {
        throw new Error(`MIGRATION-ARTIFACTS: caminho nao regular: ${name}`);
      }
      return {
        path: relative(root, absolutePath).split("\\").join("/"),
        contents: readFileSync(absolutePath, "utf8"),
      };
    });
}

export function validateProject(root = projectRoot) {
  const manifest = JSON.parse(readFileSync(join(root, manifestRelativePath), "utf8"));
  const sourceSql = readFileSync(join(root, expectedArtifacts.source.path), "utf8");
  const lovableSql = readFileSync(join(root, expectedArtifacts.lovable.path), "utf8");
  return validateEditorialMigrationArtifacts({
    manifest,
    sourceSql,
    lovableSql,
    migrationFiles: readMigrationFiles(root),
  });
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const errors = validateProject();
    if (errors.length > 0) {
      errors.forEach((error) => console.error(`MIGRATION-ARTIFACTS: ${error}`));
      process.exitCode = 1;
    } else {
      console.log("PASS_EDITORIAL_MIGRATION_ARTIFACTS_RECONCILED_NO_REAPPLY");
    }
  } catch (error) {
    console.error(`MIGRATION-ARTIFACTS: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
