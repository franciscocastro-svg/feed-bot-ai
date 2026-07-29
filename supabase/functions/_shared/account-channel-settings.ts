export type PublicationChannel = "feed" | "story" | "reel";

export type SettingsSource =
  | "account_channel"
  | "account"
  | "global_channel"
  | "global"
  | "system";

export type GlobalAutomationSettings = {
  default_media_type?: string | null;
  max_posts_per_day?: number | null;
  min_post_interval_minutes?: number | null;
  preferred_post_hours?: number[] | null;
};

export type AccountAutomationSettings = {
  instagram_account_id?: string | null;
  default_media_type?: string | null;
  max_posts_per_day?: number | null;
  min_post_interval_minutes?: number | null;
  preferred_post_hours?: number[] | null;
};

export type ChannelSettingsOverride = {
  channel: PublicationChannel;
  active?: boolean | null;
  min_interval_minutes?: number | null;
  allowed_hours?: number[] | null;
  max_per_day?: number | null;
  keywords?: string[] | null;
  urgent_keywords?: string[] | null;
  is_priority?: boolean | null;
};

export type AccountChannelSettingsOverride = ChannelSettingsOverride & {
  instagram_account_id: string;
};

export type EffectiveChannelSettings = {
  channel: PublicationChannel;
  active: boolean;
  min_interval_minutes: number;
  allowed_hours: number[];
  max_per_day: number;
  keywords: string[];
  urgent_keywords: string[];
  is_priority: boolean;
  sources: {
    active: SettingsSource;
    min_interval_minutes: SettingsSource;
    allowed_hours: SettingsSource;
    max_per_day: SettingsSource;
    keywords: SettingsSource;
    urgent_keywords: SettingsSource;
    is_priority: SettingsSource;
  };
};

export type EffectiveAccountChannelSettings = {
  minIntervalAcrossAccount: number;
  allowedHoursAcrossAccount: number[];
  maxPostsPerDay: number;
  defaultMediaType: "feed" | "story" | "reel";
  channels: EffectiveChannelSettings[];
};

const DEFAULT_ALLOWED_HOURS = [
  8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
];

export const DEFAULT_CHANNEL_SETTINGS: Record<
  PublicationChannel,
  Omit<EffectiveChannelSettings, "sources">
> = {
  feed: {
    channel: "feed",
    active: true,
    min_interval_minutes: 60,
    allowed_hours: DEFAULT_ALLOWED_HOURS,
    max_per_day: 5,
    keywords: [],
    urgent_keywords: [],
    is_priority: false,
  },
  story: {
    channel: "story",
    active: true,
    min_interval_minutes: 30,
    allowed_hours: [...DEFAULT_ALLOWED_HOURS, 22],
    max_per_day: 10,
    keywords: [],
    urgent_keywords: ["urgente", "exclusivo", "morre", "prisão", "vaza"],
    is_priority: true,
  },
  reel: {
    channel: "reel",
    active: true,
    min_interval_minutes: 120,
    allowed_hours: [12, 18, 21],
    max_per_day: 3,
    keywords: [],
    urgent_keywords: [],
    is_priority: false,
  },
};

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function positiveInteger(value: unknown, fallback: number, minimum = 1): number {
  const parsed = finiteNumber(value);
  if (parsed === null) return fallback;
  if (parsed < 0) return -1;
  return Math.max(minimum, Math.floor(parsed));
}

/**
 * Applies the commercial daily limit to one Instagram account.
 *
 * The configured value may come from the global profile or from an account
 * override. A finite plan limit is always the upper bound; -1 means unlimited.
 */
export function capDailyPublications(
  configuredLimit: unknown,
  planLimit: unknown,
  fallback = 5,
): number {
  const configured = positiveInteger(configuredLimit, fallback);
  const plan = positiveInteger(planLimit, fallback);
  if (plan < 0) return configured;
  if (configured < 0) return plan;
  return Math.min(configured, plan);
}

function normalizedInterval(value: unknown, fallback: number): number {
  const parsed = finiteNumber(value);
  return parsed === null ? fallback : Math.max(10, Math.floor(parsed));
}

export function normalizeAllowedHours(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .map(Number)
      .filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23),
  )).sort((a, b) => a - b);
}

function normalizeWords(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value.map((word) => String(word).trim().toLowerCase()).filter(Boolean),
  ));
}

function normalizedMediaType(
  accountValue?: string | null,
  globalValue?: string | null,
): "feed" | "story" | "reel" {
  const selected = accountValue || globalValue || "feed";
  return selected === "story" || selected === "reel" ? selected : "feed";
}

function hasNumber(value: unknown): boolean {
  return finiteNumber(value) !== null;
}

function sourceForNullable<T>(
  accountChannelValue: T | null | undefined,
  globalChannelValue: T | null | undefined,
): SettingsSource {
  if (accountChannelValue !== null && accountChannelValue !== undefined) {
    return "account_channel";
  }
  if (globalChannelValue !== null && globalChannelValue !== undefined) {
    return "global_channel";
  }
  return "system";
}

export function resolveAccountChannelSettings(input: {
  globalSettings?: GlobalAutomationSettings | null;
  accountSettings?: AccountAutomationSettings | null;
  globalChannels?: ChannelSettingsOverride[] | null;
  accountChannels?: AccountChannelSettingsOverride[] | null;
}): EffectiveAccountChannelSettings {
  const globalSettings = input.globalSettings || {};
  const accountSettings = input.accountSettings || {};
  const globalChannels = new Map(
    (input.globalChannels || []).map((row) => [row.channel, row]),
  );
  const accountChannels = new Map(
    (input.accountChannels || []).map((row) => [row.channel, row]),
  );

  const accountHasInterval = hasNumber(accountSettings.min_post_interval_minutes);
  const globalInterval = normalizedInterval(
    globalSettings.min_post_interval_minutes,
    10,
  );
  const accountInterval = accountHasInterval
    ? normalizedInterval(accountSettings.min_post_interval_minutes, globalInterval)
    : globalInterval;

  const accountHours = normalizeAllowedHours(accountSettings.preferred_post_hours);
  const globalHours = normalizeAllowedHours(globalSettings.preferred_post_hours);
  const effectiveGeneralHours = accountHours.length
    ? accountHours
    : globalHours.length ? globalHours : DEFAULT_ALLOWED_HOURS;

  const accountHasDailyCap = hasNumber(accountSettings.max_posts_per_day);
  const globalDailyCap = positiveInteger(globalSettings.max_posts_per_day, 5);
  const accountDailyCap = accountHasDailyCap
    ? positiveInteger(accountSettings.max_posts_per_day, globalDailyCap)
    : globalDailyCap;

  const channels = (["feed", "story", "reel"] as PublicationChannel[]).map(
    (channel): EffectiveChannelSettings => {
      const system = DEFAULT_CHANNEL_SETTINGS[channel];
      const globalChannel = globalChannels.get(channel);
      const accountChannel = accountChannels.get(channel);

      const selectedInterval = hasNumber(accountChannel?.min_interval_minutes)
        ? normalizedInterval(accountChannel?.min_interval_minutes, accountInterval)
        : accountHasInterval
          ? accountInterval
          : hasNumber(globalChannel?.min_interval_minutes)
            ? normalizedInterval(globalChannel?.min_interval_minutes, accountInterval)
            : hasNumber(globalSettings.min_post_interval_minutes)
              ? globalInterval
              : system.min_interval_minutes;
      const minInterval = Math.max(accountInterval, selectedInterval);
      const minIntervalSource: SettingsSource =
        hasNumber(accountChannel?.min_interval_minutes)
          ? "account_channel"
          : accountHasInterval
            ? "account"
            : hasNumber(globalChannel?.min_interval_minutes)
              ? "global_channel"
              : hasNumber(globalSettings.min_post_interval_minutes)
                ? "global"
                : "system";

      const accountChannelHours = normalizeAllowedHours(accountChannel?.allowed_hours);
      const globalChannelHours = normalizeAllowedHours(globalChannel?.allowed_hours);
      const allowedHours = accountChannelHours.length
        ? accountChannelHours
        : accountHours.length
          ? accountHours
          : globalChannelHours.length
            ? globalChannelHours
            : effectiveGeneralHours.length
              ? effectiveGeneralHours
              : system.allowed_hours;
      const allowedHoursSource: SettingsSource = accountChannelHours.length
        ? "account_channel"
        : accountHours.length
          ? "account"
          : globalChannelHours.length
            ? "global_channel"
            : globalHours.length
              ? "global"
              : "system";

      const selectedChannelCap = hasNumber(accountChannel?.max_per_day)
        ? positiveInteger(accountChannel?.max_per_day, accountDailyCap)
        : accountHasDailyCap
          ? accountDailyCap
          : hasNumber(globalChannel?.max_per_day)
            ? positiveInteger(globalChannel?.max_per_day, accountDailyCap)
            : hasNumber(globalSettings.max_posts_per_day)
              ? globalDailyCap
              : system.max_per_day;
      const maxPerDay = accountDailyCap < 0
        ? selectedChannelCap
        : selectedChannelCap < 0
          ? accountDailyCap
          : Math.min(accountDailyCap, selectedChannelCap);
      const maxPerDaySource: SettingsSource = hasNumber(accountChannel?.max_per_day)
        ? "account_channel"
        : accountHasDailyCap
          ? "account"
          : hasNumber(globalChannel?.max_per_day)
            ? "global_channel"
            : hasNumber(globalSettings.max_posts_per_day)
              ? "global"
              : "system";

      const keywords = accountChannel?.keywords !== null &&
          accountChannel?.keywords !== undefined
        ? normalizeWords(accountChannel.keywords)
        : globalChannel?.keywords !== null && globalChannel?.keywords !== undefined
          ? normalizeWords(globalChannel.keywords)
          : system.keywords;
      const urgentKeywords = accountChannel?.urgent_keywords !== null &&
          accountChannel?.urgent_keywords !== undefined
        ? normalizeWords(accountChannel.urgent_keywords)
        : globalChannel?.urgent_keywords !== null &&
            globalChannel?.urgent_keywords !== undefined
          ? normalizeWords(globalChannel.urgent_keywords)
          : system.urgent_keywords;

      return {
        channel,
        active: accountChannel?.active ?? globalChannel?.active ?? system.active,
        min_interval_minutes: minInterval,
        allowed_hours: allowedHours,
        max_per_day: maxPerDay,
        keywords,
        urgent_keywords: urgentKeywords,
        is_priority:
          accountChannel?.is_priority ??
          globalChannel?.is_priority ??
          system.is_priority,
        sources: {
          active: sourceForNullable(accountChannel?.active, globalChannel?.active),
          min_interval_minutes: minIntervalSource,
          allowed_hours: allowedHoursSource,
          max_per_day: maxPerDaySource,
          keywords: sourceForNullable(
            accountChannel?.keywords,
            globalChannel?.keywords,
          ),
          urgent_keywords: sourceForNullable(
            accountChannel?.urgent_keywords,
            globalChannel?.urgent_keywords,
          ),
          is_priority: sourceForNullable(
            accountChannel?.is_priority,
            globalChannel?.is_priority,
          ),
        },
      };
    },
  );

  return {
    minIntervalAcrossAccount: accountInterval,
    allowedHoursAcrossAccount: effectiveGeneralHours,
    maxPostsPerDay: accountDailyCap,
    defaultMediaType: normalizedMediaType(
      accountSettings.default_media_type,
      globalSettings.default_media_type,
    ),
    channels,
  };
}
