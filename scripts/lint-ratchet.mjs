import { spawnSync } from "node:child_process";
import { relative, resolve, sep } from "node:path";

function sortObject(object) {
  return Object.fromEntries(Object.entries(object).sort(([left], [right]) => left.localeCompare(right)));
}

export function summarizeLintResults(results, root = process.cwd()) {
  const files = {};
  let totalErrors = 0;

  for (const result of results) {
    const rules = {};
    for (const message of result.messages || []) {
      if (message.severity !== 2) continue;
      const rule = message.ruleId || "fatal";
      rules[rule] = (rules[rule] || 0) + 1;
      totalErrors += 1;
    }

    if (Object.keys(rules).length === 0) continue;
    const file = relative(root, result.filePath).split(sep).join("/");
    files[file] = sortObject(rules);
  }

  return {
    version: 1,
    totalErrors,
    files: sortObject(files),
  };
}

export function compareLintBaseline(baseline, current) {
  const regressions = [];

  for (const [file, rules] of Object.entries(current.files)) {
    for (const [rule, count] of Object.entries(rules)) {
      const allowed = baseline.files[file]?.[rule] || 0;
      if (count > allowed) {
        regressions.push({ file, rule, allowed, current: count, added: count - allowed });
      }
    }
  }

  return regressions.sort((left, right) =>
    left.file.localeCompare(right.file) || left.rule.localeCompare(right.rule));
}

export function formatLintRegression(regression) {
  return `${regression.file} [${regression.rule}]: ${regression.current} current, ${regression.allowed} allowed (+${regression.added})`;
}

export function runEslintJson(root = process.cwd()) {
  const executable = resolve(root, "node_modules/.bin/eslint");
  const result = spawnSync(executable, [".", "--format", "json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 30 * 1024 * 1024,
  });

  if (result.error) throw result.error;
  if (!result.stdout) {
    throw new Error(result.stderr || "ESLint produced no JSON output");
  }

  let parsed;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new Error(`Could not parse ESLint JSON output: ${result.stderr || "unknown error"}`);
  }

  if (!Array.isArray(parsed)) throw new Error("ESLint JSON output must be an array");
  return parsed;
}
