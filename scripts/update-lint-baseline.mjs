import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { runEslintJson, summarizeLintResults } from "./lint-ratchet.mjs";

const root = process.cwd();
const baselinePath = resolve(root, "quality/eslint-baseline.json");
const baseline = summarizeLintResults(runEslintJson(root), root);

mkdirSync(dirname(baselinePath), { recursive: true });
writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
console.log(`Updated lint baseline with ${baseline.totalErrors} errors.`);
