import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const SAFE_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function readVerifyJwt(configToml, name) {
  const section = new RegExp(
    `(?:^|\\n)\\s*\\[functions\\.${escapeRegExp(name)}\\]\\s*\\n([\\s\\S]*?)(?=\\n\\s*\\[|$)`,
  ).exec(configToml)?.[1];
  if (section === undefined) return undefined;

  const value = /^\s*verify_jwt\s*=\s*(true|false)\s*$/m.exec(section)?.[1];
  return value === undefined ? undefined : value === "true";
}

export function validateEdgeFunctionManifest(manifest, options = {}) {
  const root = options.root || process.cwd();
  const fileExists = options.fileExists || ((path) => existsSync(resolve(root, path)));
  const configToml = options.configToml ?? readFileSync(resolve(root, "supabase/config.toml"), "utf8");
  const errors = [];

  if (manifest?.version !== 1) errors.push("manifest version must be 1");
  if (!Array.isArray(manifest?.affectedFunctions) || manifest.affectedFunctions.length === 0) {
    errors.push("affectedFunctions must contain at least one function");
    return errors;
  }

  const names = new Set();
  for (const entry of manifest.affectedFunctions) {
    if (!SAFE_NAME.test(entry?.name || "")) {
      errors.push(`invalid function name: ${entry?.name || "<missing>"}`);
      continue;
    }
    if (names.has(entry.name)) errors.push(`duplicate function: ${entry.name}`);
    names.add(entry.name);

    const expectedPrefix = `supabase/functions/${entry.name}/`;
    for (const key of ["entrypoint", "config", "lock"]) {
      const path = entry[key];
      if (typeof path !== "string" || !path.startsWith(expectedPrefix) || path.includes("..")) {
        errors.push(`${entry.name}.${key} must stay inside ${expectedPrefix}`);
      } else if (!fileExists(path)) {
        errors.push(`${entry.name}.${key} does not exist: ${path}`);
      }
    }

    const configuredVerifyJwt = readVerifyJwt(configToml, entry.name);
    if (configuredVerifyJwt === undefined) {
      errors.push(`${entry.name} is missing verify_jwt in supabase/config.toml`);
    } else if (configuredVerifyJwt !== entry.verifyJwt) {
      errors.push(`${entry.name}.verifyJwt does not match supabase/config.toml`);
    }
  }

  const constraints = manifest.releaseConstraints;
  for (const key of ["databaseMigrations", "frontendPublish", "otherEdgeFunctions", "vpsRuntimeChange"]) {
    if (constraints?.[key] !== false) errors.push(`releaseConstraints.${key} must be false`);
  }

  return errors;
}
