import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  capDailyPublications,
  resolveAccountChannelSettings,
  type AccountAutomationSettings,
  type AccountChannelSettingsOverride,
} from "../../supabase/functions/_shared/account-channel-settings";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const globalSettings = {
  default_media_type: "reel",
  max_posts_per_day: 30,
  min_post_interval_minutes: 20,
  preferred_post_hours: [8, 12, 18],
};

const globalChannels = [
  {
    channel: "feed" as const,
    active: true,
    min_interval_minutes: 60,
    allowed_hours: [9, 15, 21],
    max_per_day: 5,
    keywords: ["notícia"],
    urgent_keywords: [],
    is_priority: false,
  },
];

describe("account and channel settings synchronization", () => {
  it("caps each Instagram account independently at the commercial plan limit", () => {
    expect(capDailyPublications(70, 20)).toBe(20);
    expect(capDailyPublications(12, 30)).toBe(12);
    expect(capDailyPublications(-1, 40)).toBe(40);
    expect(capDailyPublications(25, -1)).toBe(25);
    expect(capDailyPublications(-1, -1)).toBe(-1);
  });

  it("keeps the global channel as fallback when the account has no overrides", () => {
    const resolved = resolveAccountChannelSettings({
      globalSettings,
      globalChannels,
    });
    const feed = resolved.channels.find((channel) => channel.channel === "feed")!;

    expect(feed.min_interval_minutes).toBe(60);
    expect(feed.allowed_hours).toEqual([9, 15, 21]);
    expect(feed.max_per_day).toBe(5);
    expect(feed.sources.min_interval_minutes).toBe("global_channel");
    expect(feed.sources.allowed_hours).toBe("global_channel");
  });

  it("makes an account rhythm and hours automatically win over global channels", () => {
    const accountSettings: AccountAutomationSettings = {
      instagram_account_id: "account-a",
      min_post_interval_minutes: 45,
      preferred_post_hours: [10, 14, 20],
      max_posts_per_day: 12,
      default_media_type: "story",
    };
    const resolved = resolveAccountChannelSettings({
      globalSettings,
      accountSettings,
      globalChannels,
    });

    expect(resolved.minIntervalAcrossAccount).toBe(45);
    expect(resolved.maxPostsPerDay).toBe(12);
    expect(resolved.defaultMediaType).toBe("story");
    for (const channel of resolved.channels) {
      expect(channel.min_interval_minutes).toBe(45);
      expect(channel.allowed_hours).toEqual([10, 14, 20]);
      expect(channel.max_per_day).toBe(12);
      expect(channel.sources.min_interval_minutes).toBe("account");
      expect(channel.sources.allowed_hours).toBe("account");
    }
  });

  it("allows a channel override but never bypasses the account safety interval", () => {
    const accountSettings: AccountAutomationSettings = {
      instagram_account_id: "account-a",
      min_post_interval_minutes: 45,
      preferred_post_hours: [10, 14, 20],
      max_posts_per_day: 12,
    };
    const accountChannels: AccountChannelSettingsOverride[] = [{
      instagram_account_id: "account-a",
      channel: "feed",
      active: false,
      min_interval_minutes: 20,
      allowed_hours: [11, 19],
      max_per_day: 4,
      keywords: [],
      urgent_keywords: ["urgente"],
      is_priority: true,
    }];
    const resolved = resolveAccountChannelSettings({
      globalSettings,
      accountSettings,
      globalChannels,
      accountChannels,
    });
    const feed = resolved.channels.find((channel) => channel.channel === "feed")!;

    expect(feed.active).toBe(false);
    expect(feed.min_interval_minutes).toBe(45);
    expect(feed.allowed_hours).toEqual([11, 19]);
    expect(feed.max_per_day).toBe(4);
    expect(feed.sources.active).toBe("account_channel");
    expect(feed.sources.min_interval_minutes).toBe("account_channel");
  });

  it("keeps two Instagram accounts isolated", () => {
    const accountA = resolveAccountChannelSettings({
      globalSettings,
      accountSettings: {
        instagram_account_id: "account-a",
        min_post_interval_minutes: 30,
        preferred_post_hours: [9, 13],
      },
      globalChannels,
    });
    const accountB = resolveAccountChannelSettings({
      globalSettings,
      accountSettings: {
        instagram_account_id: "account-b",
        min_post_interval_minutes: 90,
        preferred_post_hours: [16, 22],
      },
      globalChannels,
    });

    expect(accountA.minIntervalAcrossAccount).toBe(30);
    expect(accountA.channels[0].allowed_hours).toEqual([9, 13]);
    expect(accountB.minIntervalAcrossAccount).toBe(90);
    expect(accountB.channels[0].allowed_hours).toEqual([16, 22]);
  });

  it("propagates a later global change only to accounts that still inherit", () => {
    const before = resolveAccountChannelSettings({
      globalSettings,
      globalChannels: [],
    });
    const after = resolveAccountChannelSettings({
      globalSettings: {
        ...globalSettings,
        min_post_interval_minutes: 55,
        preferred_post_hours: [7, 17],
      },
      globalChannels: [],
    });
    const customized = resolveAccountChannelSettings({
      globalSettings: {
        ...globalSettings,
        min_post_interval_minutes: 55,
        preferred_post_hours: [7, 17],
      },
      accountSettings: {
        instagram_account_id: "account-a",
        min_post_interval_minutes: 35,
        preferred_post_hours: [11, 23],
      },
      globalChannels: [],
    });

    expect(before.minIntervalAcrossAccount).toBe(20);
    expect(before.channels[0].min_interval_minutes).toBe(20);
    expect(after.minIntervalAcrossAccount).toBe(55);
    expect(after.channels[0].min_interval_minutes).toBe(55);
    expect(after.channels[0].allowed_hours).toEqual([7, 17]);
    expect(customized.minIntervalAcrossAccount).toBe(35);
    expect(customized.channels[0].allowed_hours).toEqual([11, 23]);
  });

  it("wires the same resolver into scheduling, publishing and account-aware UI", () => {
    const autopilot = read("supabase/functions/autopilot/index.ts");
    const publisher = read("supabase/functions/publish-scheduler/index.ts");
    const channelConfig = read("src/pages/dashboard/ChannelConfig.tsx");
    const accountSettings = read("src/pages/dashboard/AccountSettings.tsx");
    const migration = read(
      "supabase/migrations/20260729103000_account_channel_settings_sync.sql",
    );

    expect(autopilot).toContain("resolveAccountChannelSettings");
    expect(autopilot).toContain('.from("account_channel_settings")');
    expect(publisher).toContain("resolveAccountChannelSettings");
    expect(publisher).toContain('.from("account_channel_settings")');
    expect(channelConfig).toContain("Padrão global de todas as contas");
    expect(channelConfig).toContain("Voltar a herdar da conta");
    expect(channelConfig).toContain("Voltar a herdar do global");
    expect(accountSettings).toContain("/dashboard/channels/feed?account=");
    expect(publisher).toContain("if (!postCfg.active)");
    expect(publisher).not.toContain("Date.now() + minIntervalMin * 60_000");
    expect(publisher).not.toContain("const stepMs = minIntervalMin * 60_000");
    expect(migration).toContain("UNIQUE (user_id, instagram_account_id, channel)");
    expect(migration).toContain('CREATE POLICY "own account channel settings"');
  });
});
