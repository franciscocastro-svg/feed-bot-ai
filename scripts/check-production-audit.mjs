import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const BLOCKING_SEVERITIES = new Set(["moderate", "high", "critical"]);
const SOURCE_EXTENSIONS = new Set([".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx"]);

/**
 * Temporary, narrowly scoped waiver.
 *
 * GHSA-qwww-vcr4-c8h2 affects React Router's React Server Components (RSC)
 * action handling. This repository is a Vite client SPA and does not use RSC
 * or Server Actions. The source scan below makes the waiver fail closed if
 * those APIs are introduced. Remove this waiver as soon as a compatible fixed
 * React Router release is available.
 */
export const ALLOWED_ADVISORY = Object.freeze({
  id: "GHSA-qwww-vcr4-c8h2",
  url: "https://github.com/advisories/GHSA-qwww-vcr4-c8h2",
  name: "react-router",
  dependency: "react-router",
  title: "React Router: RSC Mode CSRF Bypass Allows Action Execution Before 400 Response",
});

const RSC_USAGE_PATTERNS = [
  /\bRSCRouter\b/,
  /\bServerRouter\b/,
  /\bcreateCallServer\b/,
  /\bcreateServerReference\b/,
  /\bdecodeAction\b/,
  /\bdecodeReply\b/,
  /from\s+["']react-router(?:-dom)?\/(?:rsc|dom\/server|server)["']/,
  /from\s+["']@react-router\/(?:node|serve)["']/,
];

function isBlockingSeverity(severity) {
  return BLOCKING_SEVERITIES.has(String(severity || "").toLowerCase());
}

function matchesAllowedAdvisory(advisory) {
  return (
    advisory?.url === ALLOWED_ADVISORY.url &&
    advisory?.name === ALLOWED_ADVISORY.name &&
    advisory?.dependency === ALLOWED_ADVISORY.dependency &&
    advisory?.title === ALLOWED_ADVISORY.title
  );
}

function resolveAdvisories(packageName, vulnerabilities, visiting = new Set()) {
  if (visiting.has(packageName)) {
    return [{ kind: "unresolved", reason: `circular dependency reference at ${packageName}` }];
  }

  const vulnerability = vulnerabilities[packageName];
  if (!vulnerability) {
    return [{ kind: "unresolved", reason: `missing vulnerability record for ${packageName}` }];
  }

  const nextVisiting = new Set(visiting);
  nextVisiting.add(packageName);
  const resolved = [];

  for (const via of Array.isArray(vulnerability.via) ? vulnerability.via : []) {
    if (typeof via === "string") {
      resolved.push(...resolveAdvisories(via, vulnerabilities, nextVisiting));
    } else if (via && typeof via === "object" && isBlockingSeverity(via.severity)) {
      resolved.push({ kind: "advisory", advisory: via });
    }
  }

  if (resolved.length === 0 && isBlockingSeverity(vulnerability.severity)) {
    resolved.push({
      kind: "unresolved",
      reason: `no blocking advisory details for ${packageName}`,
    });
  }

  return resolved;
}

export function evaluateAuditReport(report) {
  const vulnerabilities =
    report && typeof report.vulnerabilities === "object" && report.vulnerabilities
      ? report.vulnerabilities
      : {};
  const blocked = [];
  const waivedPackages = [];

  for (const [packageName, vulnerability] of Object.entries(vulnerabilities)) {
    if (!isBlockingSeverity(vulnerability?.severity)) continue;

    const resolved = resolveAdvisories(packageName, vulnerabilities);
    const isExclusivelyAllowed =
      resolved.length > 0 &&
      resolved.every(
        (entry) => entry.kind === "advisory" && matchesAllowedAdvisory(entry.advisory),
      );

    if (isExclusivelyAllowed) {
      waivedPackages.push(packageName);
    } else {
      blocked.push({
        packageName,
        severity: vulnerability?.severity || "unknown",
        reasons: resolved.map((entry) =>
          entry.kind === "advisory"
            ? `${entry.advisory?.url || entry.advisory?.title || "unknown advisory"}`
            : entry.reason,
        ),
      });
    }
  }

  return { blocked, waivedPackages };
}

function listApplicationSourceFiles(rootDirectory) {
  const sourceRoot = join(rootDirectory, "src");
  const files = [];

  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (
        entry.isDirectory() &&
        ["test", "tests", "__tests__", "node_modules", "dist"].includes(entry.name)
      ) {
        continue;
      }

      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (SOURCE_EXTENSIONS.has(extname(entry.name))) {
        files.push(absolutePath);
      }
    }
  }

  visit(sourceRoot);
  return files;
}

export function findReactRouterRscUsage(rootDirectory = process.cwd()) {
  const resolvedRoot = resolve(rootDirectory);
  const findings = [];

  for (const filePath of listApplicationSourceFiles(resolvedRoot)) {
    const contents = readFileSync(filePath, "utf8");
    const matchedPattern = RSC_USAGE_PATTERNS.find((pattern) => pattern.test(contents));
    if (matchedPattern) {
      findings.push({
        file: relative(resolvedRoot, filePath),
        pattern: matchedPattern.source,
      });
    }
  }

  return findings;
}

function runAudit() {
  const result = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) throw result.error;
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(
      `npm audit could not complete (exit ${result.status ?? "unknown"}): ${result.stderr.trim()}`,
    );
  }

  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`npm audit returned invalid JSON: ${error.message}`);
  }
}

function main() {
  const report = runAudit();
  const { blocked, waivedPackages } = evaluateAuditReport(report);

  if (blocked.length > 0) {
    console.error("Production dependency audit failed. Blocking advisories:");
    for (const item of blocked) {
      console.error(`- ${item.packageName} (${item.severity}): ${item.reasons.join(", ")}`);
    }
    process.exitCode = 1;
    return;
  }

  if (waivedPackages.length > 0) {
    const rscFindings = findReactRouterRscUsage();
    if (rscFindings.length > 0) {
      console.error(
        `${ALLOWED_ADVISORY.id} cannot be waived because possible RSC/Server Action usage was found:`,
      );
      for (const finding of rscFindings) {
        console.error(`- ${finding.file} (${finding.pattern})`);
      }
      process.exitCode = 1;
      return;
    }

    console.log(
      `Production dependency audit passed with temporary waiver ${ALLOWED_ADVISORY.id}.`,
    );
    console.log(`Affected dependency records: ${waivedPackages.sort().join(", ")}.`);
    console.log("RSC/Server Action usage: not detected in application source.");
    return;
  }

  console.log("Production dependency audit passed with no blocking advisories.");
}

const executedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (executedPath === fileURLToPath(import.meta.url)) {
  main();
}
