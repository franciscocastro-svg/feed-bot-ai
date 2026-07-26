import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nextAllowedPublicationAt } from "../../supabase/functions/_shared/editorial-policy";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("autopilot immediate account refill", () => {
  it("prepares immediately while keeping each account's publication floor independent", () => {
    const now = new Date("2026-07-26T16:00:00-03:00").getTime();
    const fuxicoLastPost = new Date("2026-07-26T15:55:00-03:00").getTime();
    const techLastPost = new Date("2026-07-26T15:20:00-03:00").getTime();

    expect(nextAllowedPublicationAt(fuxicoLastPost, 22, now))
      .toBe(new Date("2026-07-26T16:17:00-03:00").getTime());
    expect(nextAllowedPublicationAt(techLastPost, 22, now))
      .toBe(new Date("2026-07-26T16:01:00-03:00").getTime());
  });

  it("does not use the publication interval as a preparation gate", () => {
    const autopilot = read("supabase/functions/autopilot/index.ts");

    expect(autopilot).not.toContain("shouldPrepareNextPost");
    expect(autopilot).not.toContain("canPrepareAccount");
    expect(autopilot).toContain("const allTakenByIg = new Map<string, Date[]>();");
    expect(autopilot).toContain("const takenByChByIg = new Map");
    expect(autopilot).toContain("nextAllowedPublicationAt(");
  });

  it("keeps explicit multi-account routing without requiring a single-account fallback", () => {
    const autopilot = read("supabase/functions/autopilot/index.ts");
    const generateTopic = read("supabase/functions/generate-from-topic/index.ts");

    expect(autopilot).not.toContain("if (fallbackAccountId) {\n          for (const it of rankedReady)");
    expect(autopilot).toContain("instagram_account_id: topicAccountId");
    expect(autopilot).toContain("explicit_account_required = validIgIds.size > 1");
    expect(generateTopic).toContain("requestedInstagramAccountId");
    expect(generateTopic).toContain("candidate.instagram_account_id === requestedActiveAccountId");
  });
});
