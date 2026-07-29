export type AutopilotMediaType = "feed" | "story" | "reel";

export type AutopilotChannelConfig = {
  channel: AutopilotMediaType;
  active: boolean;
  min_interval_minutes: number;
  allowed_hours: number[];
  max_per_day: number;
  keywords: string[];
  urgent_keywords: string[];
  is_priority: boolean;
};

const DEFAULT_FEED_CHANNEL: AutopilotChannelConfig = {
  channel: "feed",
  active: true,
  min_interval_minutes: 60,
  allowed_hours: [],
  max_per_day: 5,
  keywords: [],
  urgent_keywords: [],
  is_priority: false,
};

export function normalizeAutopilotMediaType(
  accountValue: unknown,
  globalValue: unknown,
): AutopilotMediaType {
  const value = accountValue || globalValue;
  return value === "story" || value === "reel" ? value : "feed";
}

export function channelsForAccount(
  channels: AutopilotChannelConfig[],
  mediaType: AutopilotMediaType,
): AutopilotChannelConfig[] {
  const resolved = channels.map((channel) => ({
    ...channel,
    active: channel.channel === mediaType,
  }));
  if (resolved.some((channel) => channel.channel === mediaType)) return resolved;
  return [
    ...resolved,
    {
      ...DEFAULT_FEED_CHANNEL,
      channel: mediaType,
    },
  ];
}

export function carouselFeedChannel(
  channels: AutopilotChannelConfig[],
): AutopilotChannelConfig {
  const configuredFeed = channels.find((channel) => channel.channel === "feed");
  return configuredFeed
    ? { ...configuredFeed, active: true }
    : { ...DEFAULT_FEED_CHANNEL };
}
