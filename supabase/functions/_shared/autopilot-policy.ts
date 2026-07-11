export const PENDING_NEWS_MAX_AGE_HOURS = 48;
export const SCHEDULED_NEWS_MAX_AGE_HOURS = 72;

export function newsAgeHours(value?: string | null, nowMs = Date.now()): number | null {
  if (!value) return null;
  const publishedAt = new Date(value).getTime();
  if (!Number.isFinite(publishedAt)) return null;
  return Math.max(0, (nowMs - publishedAt) / 3_600_000);
}

export function isNewsOlderThan(
  value: string | null | undefined,
  maxAgeHours: number,
  nowMs = Date.now(),
): boolean {
  const age = newsAgeHours(value, nowMs);
  return age !== null && age > maxAgeHours;
}

export function isScheduledBeyondFreshnessWindow(
  publishedAt: string | null | undefined,
  scheduledFor: string | null | undefined,
  maxAgeHours = SCHEDULED_NEWS_MAX_AGE_HOURS,
): boolean {
  if (!publishedAt || !scheduledFor) return false;
  const publishedMs = new Date(publishedAt).getTime();
  const scheduledMs = new Date(scheduledFor).getTime();
  if (!Number.isFinite(publishedMs) || !Number.isFinite(scheduledMs)) return false;
  return scheduledMs > publishedMs + maxAgeHours * 3_600_000;
}
