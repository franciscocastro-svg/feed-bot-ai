import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  compareLintBaseline,
  formatLintRegression,
  runEslintJson,
  summarizeLintResults,
} from "./lint-ratchet.mjs";

const root = process.cwd();
const baselinePath = resolve(root, "quality/eslint-baseline.json");
const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
const current = summarizeLintResults(runEslintJson(root), root);
const regressions = compareLintBaseline(baseline, current);

if (regressions.length > 0) {
  console.error(`Lint ratchet failed with ${regressions.length} regression(s):`);
  regressions.forEach((regression) => console.error(`- ${formatLintRegression(regression)}`));
  console.error("Fix the new errors. Update the baseline only when a reviewed rule or scope change is intentional.");
  process.exitCode = 1;
} else {
  console.log(`Lint ratchet passed (${current.totalErrors} current errors; baseline allows ${baseline.totalErrors}).`);
}
