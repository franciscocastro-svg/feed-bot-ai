import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const generatedMcpRelativePath = "supabase/functions/mcp/index.ts";
const sourceMcpRelativePath = "src/lib/mcp/index.ts";
const generatedMcpPath = join(projectRoot, generatedMcpRelativePath);
const sourceMcpPath = join(projectRoot, sourceMcpRelativePath);
const approvedProjectRef = "gewnaxrhiyylfizgbqdi";
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const matrixRequested = process.argv.includes("--matrix");

function fail(message) {
  throw new Error(`MCP-BUILD: ${message}`);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertMcpContract(source, generated) {
  const sourceText = source.toString("utf8");
  const generatedText = generated.toString("utf8");

  if (!sourceText.includes(`const MCP_SUPABASE_PROJECT_REF = "${approvedProjectRef}"`)) {
    fail("fonte MCP nao fixa o project ref publico aprovado");
  }
  if (
    !generatedText.includes(`var MCP_SUPABASE_PROJECT_REF = "${approvedProjectRef}"`) ||
    !generatedText.includes(
      "var MCP_OAUTH_ISSUER = `https://${MCP_SUPABASE_PROJECT_REF}.supabase.co/auth/v1`;",
    )
  ) {
    fail("bundle MCP nao contem o project ref e o issuer deterministico aprovados");
  }

  for (const forbidden of ["project-ref-unset", "VITE_", "define_import_meta_env_default"]) {
    if (sourceText.includes(forbidden) || generatedText.includes(forbidden)) {
      fail(`fonte ou bundle MCP contem marcador proibido: ${forbidden}`);
    }
  }

  const mode = lstatSync(generatedMcpPath).mode & 0o777;
  if (mode !== 0o644) fail(`modo inesperado do bundle MCP: ${mode.toString(8)}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? projectRoot,
    encoding: "utf8",
    env: options.env ?? process.env,
    maxBuffer: 32 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail(`${command} ${args.join(" ")} falhou com codigo ${result.status ?? "desconhecido"}`);
  }
  return `${result.stdout ?? ""}${result.stderr ?? ""}`;
}

function trackedStatus(cwd) {
  return run("git", ["status", "--porcelain=v1", "--untracked-files=no"], { cwd });
}

function sanitizedEnvironment(additions = {}) {
  const environment = { ...process.env };
  for (const key of Object.keys(environment)) {
    if (key.startsWith("VITE_")) delete environment[key];
  }
  return { ...environment, ...additions };
}

function copyProject(destination) {
  const excludedRoots = new Set([".git", "dist", "node_modules"]);
  cpSync(projectRoot, destination, {
    recursive: true,
    filter(source) {
      const relativePath = relative(projectRoot, source);
      if (!relativePath) return true;
      const firstSegment = relativePath.split(sep)[0];
      if (excludedRoots.has(firstSegment)) return false;
      return !basename(source).startsWith(".env");
    },
  });
  symlinkSync(join(projectRoot, "node_modules"), join(destination, "node_modules"), "dir");
}

function fingerprintTree(root) {
  const entries = [];

  function visit(directory) {
    for (const name of readdirSync(directory).sort()) {
      if (name === "dist" || name === "node_modules" || name === ".git") continue;
      const absolutePath = join(directory, name);
      const relativePath = relative(root, absolutePath).split(sep).join("/");
      const stats = lstatSync(absolutePath);
      const mode = (stats.mode & 0o777).toString(8);
      if (stats.isDirectory()) {
        entries.push(`d ${mode} ${relativePath}`);
        visit(absolutePath);
      } else if (stats.isSymbolicLink()) {
        entries.push(`l ${mode} ${relativePath} ${readlinkSync(absolutePath)}`);
      } else {
        entries.push(`f ${mode} ${relativePath} ${sha256(readFileSync(absolutePath))}`);
      }
    }
  }

  visit(root);
  return entries.join("\n");
}

function runBuild(cwd, environment) {
  return run(npmCommand, ["run", "build"], { cwd, env: environment });
}

function verifySingleBuild() {
  const sourceBefore = readFileSync(sourceMcpPath);
  const generatedBefore = readFileSync(generatedMcpPath);
  const statusBefore = trackedStatus(projectRoot);

  runBuild(projectRoot, process.env);

  const sourceAfter = readFileSync(sourceMcpPath);
  const generatedAfter = readFileSync(generatedMcpPath);
  const statusAfter = trackedStatus(projectRoot);

  if (!sourceBefore.equals(sourceAfter)) fail("build alterou a fonte MCP");
  if (!generatedBefore.equals(generatedAfter)) fail("build alterou o bundle MCP rastreado");
  if (statusBefore !== statusAfter) fail("build alterou o estado de arquivos rastreados");
  assertMcpContract(sourceAfter, generatedAfter);
}

function verifyMatrix() {
  const expectedSource = readFileSync(sourceMcpPath);
  const expectedGenerated = readFileSync(generatedMcpPath);
  const scenarios = [
    {
      name: "process-project-ref-only",
      env: { VITE_SUPABASE_PROJECT_ID: approvedProjectRef },
      files: {},
      sentinels: [],
    },
    {
      name: "process-unrelated-vite-sentinel",
      env: {
        VITE_MCP_BUILD_SENTINEL: "process-mcp-build-sentinel",
        VITE_SUPABASE_PROJECT_ID: approvedProjectRef,
      },
      files: {},
      sentinels: ["process-mcp-build-sentinel"],
    },
    {
      name: "production-env-precedence",
      env: {},
      files: {
        ".env.production": [
          `VITE_SUPABASE_PROJECT_ID=${approvedProjectRef}`,
          "VITE_MCP_BUILD_SENTINEL=production-mcp-build-sentinel",
          "",
        ].join("\n"),
        ".env.production.local": "VITE_MCP_BUILD_SENTINEL=local-mcp-build-sentinel\n",
      },
      sentinels: ["production-mcp-build-sentinel", "local-mcp-build-sentinel"],
    },
  ];

  for (const scenario of scenarios) {
    const scenarioRoot = mkdtempSync(join(tmpdir(), "fluxfeed-mcp-build-"));
    try {
      copyProject(scenarioRoot);
      for (const [fileName, contents] of Object.entries(scenario.files)) {
        writeFileSync(join(scenarioRoot, fileName), contents, { mode: 0o600 });
      }

      const fingerprintBefore = fingerprintTree(scenarioRoot);
      const logs = runBuild(scenarioRoot, sanitizedEnvironment(scenario.env));
      const fingerprintAfter = fingerprintTree(scenarioRoot);
      const sourceAfter = readFileSync(join(scenarioRoot, sourceMcpRelativePath));
      const generatedAfter = readFileSync(join(scenarioRoot, generatedMcpRelativePath));

      if (fingerprintBefore !== fingerprintAfter) {
        fail(`cenario ${scenario.name} alterou arquivos fora de dist`);
      }
      if (!expectedSource.equals(sourceAfter) || !expectedGenerated.equals(generatedAfter)) {
        fail(`cenario ${scenario.name} nao reproduziu o MCP versionado`);
      }
      for (const sentinel of scenario.sentinels) {
        if (logs.includes(sentinel) || generatedAfter.includes(sentinel)) {
          fail(`cenario ${scenario.name} vazou sentinela VITE`);
        }
      }
      console.log(`PASS_MCP_BUILD_SCENARIO=${scenario.name}`);
    } finally {
      rmSync(scenarioRoot, { recursive: true, force: true });
    }
  }
}

try {
  verifySingleBuild();
  if (matrixRequested) verifyMatrix();
  console.log("PASS_MCP_BUILD_REPRODUCIBLE_CLEAN_WORKTREE");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
