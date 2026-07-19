export const EDITORIAL_REEL_DURATION_OPTIONS = [6, 20, 30] as const;

export type EditorialReelDurationSeconds = typeof EDITORIAL_REEL_DURATION_OPTIONS[number];

export const DEFAULT_EDITORIAL_REEL_DURATION_SECONDS: EditorialReelDurationSeconds = 20;
export const EDITORIAL_REEL_FRAME_RATE = 30;

export function normalizeEditorialReelDuration(value: unknown): EditorialReelDurationSeconds {
  const duration = Number(value);
  return EDITORIAL_REEL_DURATION_OPTIONS.includes(duration as EditorialReelDurationSeconds)
    ? duration as EditorialReelDurationSeconds
    : DEFAULT_EDITORIAL_REEL_DURATION_SECONDS;
}

export function editorialReelFrameCount(value: unknown): number {
  return normalizeEditorialReelDuration(value) * EDITORIAL_REEL_FRAME_RATE;
}
