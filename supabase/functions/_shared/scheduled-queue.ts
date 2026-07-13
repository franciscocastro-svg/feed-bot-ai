export type StableQueueItem = {
  id: string;
  scheduledForMs: number;
  createdAtMs?: number;
  minIntervalMs: number;
  allowedHours: number[];
  earliestAtMs?: number;
};

export type StableQueueSlot = StableQueueItem & {
  slotMs: number;
};

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
const toBRT = (date: Date) => new Date(date.getTime() - BRT_OFFSET_MS);
const fromBRT = (date: Date) => new Date(date.getTime() + BRT_OFFSET_MS);

function normalizedHours(value: number[]): number[] {
  return Array.from(new Set(value.filter((hour) => Number.isFinite(hour) && hour >= 0 && hour <= 23)))
    .sort((a, b) => a - b);
}

function nextAllowedHour(desiredMs: number, allowedHours: number[]): number {
  const hours = normalizedHours(allowedHours);
  if (!hours.length) return desiredMs;

  let slot = desiredMs;
  for (let guard = 0; guard < 48; guard++) {
    const candidateBRT = toBRT(new Date(slot));
    const hour = candidateBRT.getUTCHours();
    if (hours.includes(hour)) return slot;

    const nextHour = hours.find((allowedHour) => allowedHour > hour) ?? hours[0];
    const nextBRT = new Date(candidateBRT);
    if (nextHour > hour) nextBRT.setUTCHours(nextHour, 0, 0, 0);
    else {
      nextBRT.setUTCDate(nextBRT.getUTCDate() + 1);
      nextBRT.setUTCHours(nextHour, 0, 0, 0);
    }
    slot = fromBRT(nextBRT).getTime();
  }

  return slot;
}

/**
 * Reflows an account queue without allowing newer posts to overtake older ones.
 *
 * `earliestAtMs` is normally set only on posts currently blocked by the account
 * cooldown. Later posts keep their original desired time, but move forward when
 * needed to preserve the interval from the preceding queue item.
 */
export function planStableQueueSlots(items: StableQueueItem[]): StableQueueSlot[] {
  const ordered = [...items].sort((a, b) => {
    const bySchedule = a.scheduledForMs - b.scheduledForMs;
    if (bySchedule !== 0) return bySchedule;
    const byCreation = (a.createdAtMs ?? 0) - (b.createdAtMs ?? 0);
    if (byCreation !== 0) return byCreation;
    return a.id.localeCompare(b.id);
  });

  const planned: StableQueueSlot[] = [];
  for (const item of ordered) {
    const currentGapMs = Math.max(60_000, item.minIntervalMs);
    const previous = planned[planned.length - 1];
    const adjacentGapMs = previous
      ? Math.max(currentGapMs, Math.max(60_000, previous.minIntervalMs))
      : 0;
    const previousFloorMs = previous ? previous.slotMs + adjacentGapMs : Number.NEGATIVE_INFINITY;
    const desiredMs = Math.max(
      item.scheduledForMs,
      item.earliestAtMs ?? Number.NEGATIVE_INFINITY,
      previousFloorMs,
    );
    const slotMs = nextAllowedHour(desiredMs, item.allowedHours);
    planned.push({ ...item, slotMs });
  }

  return planned;
}
