import { describe, expect, it } from "vitest";
import { formatFinding, scanText } from "../../scripts/secret-scanner.mjs";

describe("secret scanner", () => {
  it("detects high-confidence tokens without retaining their values", () => {
    const token = ["ghp", "A".repeat(36)].join("_");
    const findings = scanText("fixture.env", `TOKEN=${token}`);

    expect(findings).toEqual([
      { file: "fixture.env", line: 1, rule: "github-token" },
    ]);
    expect(JSON.stringify(findings)).not.toContain(token);
  });

  it("detects populated sensitive assignments and private keys", () => {
    const assignment = `SUPABASE_SERVICE_ROLE_KEY=${"s".repeat(32)}`;
    const privateKey = ["-----BEGIN", "PRIVATE KEY-----"].join(" ");
    const findings = scanText("worker/.env", `${assignment}\n${privateKey}`);

    expect(findings.map((finding) => finding.rule)).toEqual([
      "sensitive-assignment:SUPABASE_SERVICE_ROLE_KEY",
      "private-key",
    ]);
  });

  it("allows empty examples, public frontend values and documented placeholders", () => {
    const text = [
      "VITE_SUPABASE_PUBLISHABLE_KEY=public-browser-value",
      "SUPABASE_SERVICE_ROLE_KEY=SUA_SERVICE_ROLE_KEY",
      "GEMINI_API_KEY=",
      "GROQ_API_KEY=${GROQ_API_KEY}",
    ].join("\n");

    expect(scanText(".env.example", text)).toEqual([]);
  });

  it("formats only location and rule metadata", () => {
    expect(formatFinding({ file: "a.env", line: 7, rule: "github-token" }))
      .toBe("a.env:7 [github-token]");
  });
});
