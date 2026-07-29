import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  accountPublicationPreference,
  newsFormatForPublicationPreference,
  storedMediaTypeForPreference,
} from "../lib/accountPublicationPreference";
import {
  carouselFeedChannel,
  channelsForAccount,
  normalizeAutopilotMediaType,
  type AutopilotChannelConfig,
} from "../../supabase/functions/_shared/autopilot-media-routing";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const channels: AutopilotChannelConfig[] = [
  {
    channel: "feed",
    active: true,
    min_interval_minutes: 20,
    allowed_hours: [8, 12, 18],
    max_per_day: 5,
    keywords: [],
    urgent_keywords: [],
    is_priority: false,
  },
  {
    channel: "reel",
    active: true,
    min_interval_minutes: 20,
    allowed_hours: [12, 18],
    max_per_day: 5,
    keywords: [],
    urgent_keywords: [],
    is_priority: false,
  },
  {
    channel: "story",
    active: true,
    min_interval_minutes: 20,
    allowed_hours: [9, 15],
    max_per_day: 5,
    keywords: [],
    urgent_keywords: [],
    is_priority: false,
  },
];

describe("autopilot carousel routing per Instagram account", () => {
  it("exposes carousel as a friendly option while persisting Meta's Feed channel", () => {
    expect(storedMediaTypeForPreference("carousel")).toBe("feed");
    expect(accountPublicationPreference("feed", "carousel")).toBe("carousel");
    expect(newsFormatForPublicationPreference("carousel", "single")).toBe("carousel");
    expect(newsFormatForPublicationPreference("reel", "carousel")).toBe("single");
  });

  it("inherits the global news preference when the account override is cleared", () => {
    expect(newsFormatForPublicationPreference("", "automatic")).toBe("automatic");
    expect(newsFormatForPublicationPreference("", "carousel")).toBe("carousel");
    expect(newsFormatForPublicationPreference("", null)).toBe("single");
  });

  it("keeps channel activation isolated between Instagram accounts", () => {
    const reelAccount = channelsForAccount(
      channels,
      normalizeAutopilotMediaType("reel", "feed"),
    );
    const feedAccount = channelsForAccount(
      channels,
      normalizeAutopilotMediaType("feed", "reel"),
    );

    expect(reelAccount.find((channel) => channel.channel === "reel")?.active).toBe(true);
    expect(reelAccount.find((channel) => channel.channel === "feed")?.active).toBe(false);
    expect(feedAccount.find((channel) => channel.channel === "feed")?.active).toBe(true);
    expect(feedAccount.find((channel) => channel.channel === "reel")?.active).toBe(false);
    expect(channels.every((channel) => channel.active)).toBe(true);
  });

  it("always schedules a generated carousel as Feed even when the account defaults to Reel", () => {
    const reelAccount = channelsForAccount(channels, "reel");
    const feed = carouselFeedChannel(reelAccount);

    expect(feed.channel).toBe("feed");
    expect(feed.active).toBe(true);
    expect(feed.allowed_hours).toEqual([8, 12, 18]);
  });

  it("wires the account option, profile synchronization and backend routing together", () => {
    const accountSettings = read("src/pages/dashboard/AccountSettings.tsx");
    const autopilot = read("supabase/functions/autopilot/index.ts");

    expect(accountSettings).toContain('<SelectItem value="carousel">');
    expect(accountSettings).toContain("save_creator_profile_with_news_preferences");
    expect(accountSettings).toContain("storedMediaTypeForPreference");
    expect(autopilot).toContain('select("instagram_account_id, default_media_type, default_image_style")');
    expect(autopilot).toContain("accountAutomationById.get(targetIg)");
    expect(autopilot).toContain("carouselFeedChannel(channels)");
  });
});
