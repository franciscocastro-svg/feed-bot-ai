import { describe, expect, it } from "vitest";
import {
  ALLOWED_ADVISORY,
  evaluateAuditReport,
} from "../../scripts/check-production-audit.mjs";

function advisory(overrides: Record<string, unknown> = {}) {
  return {
    source: 1124282,
    name: ALLOWED_ADVISORY.name,
    dependency: ALLOWED_ADVISORY.dependency,
    title: ALLOWED_ADVISORY.title,
    url: ALLOWED_ADVISORY.url,
    severity: "high",
    range: ">=7.12.0 <8.3.0",
    ...overrides,
  };
}

describe("production dependency audit gate", () => {
  it("waives only the approved React Router RSC advisory and its dependent record", () => {
    const result = evaluateAuditReport({
      vulnerabilities: {
        "react-router": {
          severity: "high",
          via: [advisory()],
        },
        "react-router-dom": {
          severity: "high",
          via: ["react-router"],
        },
      },
    });

    expect(result.blocked).toEqual([]);
    expect(result.waivedPackages).toEqual(["react-router", "react-router-dom"]);
  });

  it.each(["moderate", "high", "critical"])(
    "continues blocking every other %s advisory",
    (severity) => {
      const result = evaluateAuditReport({
        vulnerabilities: {
          postcss: {
            severity,
            via: [
              advisory({
                name: "postcss",
                dependency: "postcss",
                title: "Different production vulnerability",
                url: "https://github.com/advisories/GHSA-example-other",
                severity,
              }),
            ],
          },
        },
      });

      expect(result.waivedPackages).toEqual([]);
      expect(result.blocked).toHaveLength(1);
      expect(result.blocked[0].packageName).toBe("postcss");
    },
  );

  it("fails closed when an indirect vulnerability cannot be resolved", () => {
    const result = evaluateAuditReport({
      vulnerabilities: {
        "example-wrapper": {
          severity: "high",
          via: ["missing-package"],
        },
      },
    });

    expect(result.waivedPackages).toEqual([]);
    expect(result.blocked[0].reasons[0]).toContain("missing vulnerability record");
  });

  it("does not block low-severity advisories at the existing moderate threshold", () => {
    const result = evaluateAuditReport({
      vulnerabilities: {
        "low-risk-package": {
          severity: "low",
          via: [
            advisory({
              name: "low-risk-package",
              dependency: "low-risk-package",
              title: "Low severity issue",
              url: "https://github.com/advisories/GHSA-example-low",
              severity: "low",
            }),
          ],
        },
      },
    });

    expect(result).toEqual({ blocked: [], waivedPackages: [] });
  });
});
