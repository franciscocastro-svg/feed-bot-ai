import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { validateEdgeFunctionManifest } from "./edge-function-manifest.mjs";

const root = process.cwd();
const manifestPath = resolve(root, "ops/edge-functions-critical.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const errors = validateEdgeFunctionManifest(manifest, { root });

if (errors.length > 0) {
  console.error("Edge Function manifest validation failed:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

for (const entry of manifest.affectedFunctions) {
  console.log(`Checking ${entry.name}...`);
  const result = spawnSync(
    "deno",
    ["check", "--frozen", "--lock", entry.lock, "--config", entry.config, entry.entrypoint],
    { cwd: root, stdio: "inherit" },
  );

  if (result.error?.code === "ENOENT") {
    console.error("Deno is not installed or is not available on PATH.");
    process.exit(1);
  }
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`Edge Function checks passed (${manifest.affectedFunctions.length} functions).`);
