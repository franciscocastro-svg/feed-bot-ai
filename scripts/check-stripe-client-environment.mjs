#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function parseArguments(argv) {
  const options = {
    envFile: ".env.production",
    expectedEnvironment: "live",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];

    if (argument === "--env-file" && value) {
      options.envFile = value;
      index += 1;
      continue;
    }

    if (argument === "--expect" && value) {
      options.expectedEnvironment = value;
      index += 1;
      continue;
    }

    throw new Error(`Unsupported or incomplete argument: ${argument}`);
  }

  if (!["sandbox", "live"].includes(options.expectedEnvironment)) {
    throw new Error("--expect must be either sandbox or live");
  }

  return options;
}

function readClientToken(envFile) {
  const source = readFileSync(resolve(process.cwd(), envFile), "utf8");
  const match = source.match(
    /^\s*VITE_PAYMENTS_CLIENT_TOKEN\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s#]+))\s*$/m,
  );

  if (!match) {
    throw new Error("VITE_PAYMENTS_CLIENT_TOKEN is missing from the env file");
  }

  return (match[1] ?? match[2] ?? match[3] ?? "").trim();
}

function classifyClientToken(clientToken) {
  if (clientToken.startsWith("pk_test_")) return "sandbox";
  if (clientToken.startsWith("pk_live_")) return "live";
  throw new Error(
    "VITE_PAYMENTS_CLIENT_TOKEN must be a Stripe publishable key",
  );
}

try {
  const options = parseArguments(process.argv.slice(2));
  const clientToken = readClientToken(options.envFile);
  const actualEnvironment = classifyClientToken(clientToken);

  if (actualEnvironment !== options.expectedEnvironment) {
    throw new Error(
      `Stripe environment mismatch: expected ${options.expectedEnvironment}, received ${actualEnvironment}`,
    );
  }

  console.log(
    `Stripe client environment preflight: PASS (${actualEnvironment})`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Stripe client environment preflight: FAIL (${message})`);
  process.exitCode = 1;
}
