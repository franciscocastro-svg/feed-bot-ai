import { describe, expect, it } from "vitest";
import {
  isNewsOlderThan,
  isScheduledBeyondFreshnessWindow,
  newsAgeHours,
  PENDING_NEWS_MAX_AGE_HOURS,
  SCHEDULED_NEWS_MAX_AGE_HOURS,
} from "../../supabase/functions/_shared/autopilot-policy.ts";

describe("autopilot freshness policy", () => {
  const now = Date.parse("2026-07-11T12:00:00.000Z");

  it("keeps pending news eligible beyond the old 12 hour cutoff", () => {
    const publishedAt = "2026-07-10T18:00:00.000Z";
    expect(newsAgeHours(publishedAt, now)).toBe(18);
    expect(isNewsOlderThan(publishedAt, PENDING_NEWS_MAX_AGE_HOURS, now)).toBe(false);
  });

  it("expires pending news only after the new 48 hour window", () => {
    expect(isNewsOlderThan("2026-07-09T11:00:00.000Z", PENDING_NEWS_MAX_AGE_HOURS, now)).toBe(true);
  });

  it("allows an already scheduled post to wait up to 72 hours", () => {
    expect(isScheduledBeyondFreshnessWindow(
      "2026-07-10T00:00:00.000Z",
      "2026-07-12T23:59:00.000Z",
    )).toBe(false);
    expect(isScheduledBeyondFreshnessWindow(
      "2026-07-10T00:00:00.000Z",
      "2026-07-13T00:01:00.000Z",
    )).toBe(true);
    expect(SCHEDULED_NEWS_MAX_AGE_HOURS).toBe(72);
  });

  it("does not expire rows with missing or invalid dates", () => {
    expect(isNewsOlderThan(null, PENDING_NEWS_MAX_AGE_HOURS, now)).toBe(false);
    expect(isScheduledBeyondFreshnessWindow("invalid", "2026-07-11T12:00:00.000Z")).toBe(false);
  });
});
