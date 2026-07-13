import { describe, expect, it } from "vitest";
import {
  compareLintBaseline,
  formatLintRegression,
  summarizeLintResults,
} from "../../scripts/lint-ratchet.mjs";

const root = "/repo";

function lintResult(filePath: string, rules: string[]) {
  return {
    filePath,
    messages: rules.map((ruleId) => ({ severity: 2, ruleId })),
  };
}

describe("lint ratchet", () => {
  it("summarizes errors by stable file and rule counts", () => {
    expect(summarizeLintResults([
      lintResult("/repo/src/a.ts", ["rule-b", "rule-a", "rule-a"]),
    ], root)).toEqual({
      version: 1,
      totalErrors: 3,
      files: {
        "src/a.ts": { "rule-a": 2, "rule-b": 1 },
      },
    });
  });

  it("allows equal or reduced debt", () => {
    const baseline = {
      version: 1,
      totalErrors: 3,
      files: { "src/a.ts": { "no-any": 3 } },
    };
    const current = {
      version: 1,
      totalErrors: 2,
      files: { "src/a.ts": { "no-any": 2 } },
    };

    expect(compareLintBaseline(baseline, current)).toEqual([]);
  });

  it("blocks increases and new file or rule debt", () => {
    const baseline = {
      version: 1,
      totalErrors: 1,
      files: { "src/a.ts": { "no-any": 1 } },
    };
    const current = {
      version: 1,
      totalErrors: 3,
      files: {
        "src/a.ts": { "no-any": 2, "no-empty": 1 },
      },
    };

    expect(compareLintBaseline(baseline, current)).toEqual([
      { file: "src/a.ts", rule: "no-any", allowed: 1, current: 2, added: 1 },
      { file: "src/a.ts", rule: "no-empty", allowed: 0, current: 1, added: 1 },
    ]);
  });

  it("formats metadata without source content", () => {
    expect(formatLintRegression({
      file: "src/a.ts",
      rule: "no-any",
      allowed: 1,
      current: 2,
      added: 1,
    })).toBe("src/a.ts [no-any]: 2 current, 1 allowed (+1)");
  });
});
