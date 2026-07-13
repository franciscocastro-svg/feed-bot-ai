import { describe, expect, it } from "vitest";
import { planStableQueueSlots } from "../../supabase/functions/_shared/scheduled-queue";

const at = (time: string) => new Date(`2026-07-13T${time}-03:00`).getTime();
const MIN_18 = 18 * 60_000;

describe("planStableQueueSlots", () => {
  it("preserva o post antigo e desloca os posteriores em cascata", () => {
    const result = planStableQueueSlots([
      {
        id: "post-antigo",
        scheduledForMs: at("20:12:00"),
        createdAtMs: at("11:45:10"),
        minIntervalMs: MIN_18,
        allowedHours: [],
        earliestAtMs: at("20:12:38"),
      },
      {
        id: "post-novo",
        scheduledForMs: at("20:30:00"),
        createdAtMs: at("19:55:36"),
        minIntervalMs: MIN_18,
        allowedHours: [],
      },
    ]);

    expect(result.map(({ id, slotMs }) => [id, slotMs])).toEqual([
      ["post-antigo", at("20:12:38")],
      ["post-novo", at("20:30:38")],
    ]);
  });

  it("não joga o post vencido para depois de um post futuro", () => {
    const [oldest, newest] = planStableQueueSlots([
      {
        id: "post-antigo",
        scheduledForMs: at("20:12:00"),
        minIntervalMs: MIN_18,
        allowedHours: [],
        earliestAtMs: at("20:12:38"),
      },
      {
        id: "post-novo",
        scheduledForMs: at("20:30:00"),
        minIntervalMs: MIN_18,
        allowedHours: [],
      },
    ]);

    expect(oldest.id).toBe("post-antigo");
    expect(oldest.slotMs).toBeLessThan(newest.slotMs);
    expect(newest.slotMs - oldest.slotMs).toBe(MIN_18);
  });

  it("mantém horários futuros que já respeitam o intervalo", () => {
    const result = planStableQueueSlots([
      {
        id: "a",
        scheduledForMs: at("20:12:00"),
        minIntervalMs: MIN_18,
        allowedHours: [],
      },
      {
        id: "b",
        scheduledForMs: at("20:45:00"),
        minIntervalMs: MIN_18,
        allowedHours: [],
      },
    ]);

    expect(result.map((item) => item.slotMs)).toEqual([at("20:12:00"), at("20:45:00")]);
  });

  it("usa a maior distância quando canais da mesma conta têm intervalos diferentes", () => {
    const result = planStableQueueSlots([
      {
        id: "story",
        scheduledForMs: at("20:00:00"),
        minIntervalMs: 10 * 60_000,
        allowedHours: [],
      },
      {
        id: "reel",
        scheduledForMs: at("20:05:00"),
        minIntervalMs: MIN_18,
        allowedHours: [],
      },
    ]);

    expect(result[1].slotMs).toBe(at("20:18:00"));
  });

  it("mantém a ordem ao avançar para a próxima hora permitida", () => {
    const result = planStableQueueSlots([
      {
        id: "a",
        scheduledForMs: at("20:55:00"),
        minIntervalMs: MIN_18,
        allowedHours: [21, 22],
        earliestAtMs: at("20:56:00"),
      },
      {
        id: "b",
        scheduledForMs: at("21:05:00"),
        minIntervalMs: MIN_18,
        allowedHours: [21, 22],
      },
    ]);

    expect(result.map((item) => item.slotMs)).toEqual([at("21:00:00"), at("21:18:00")]);
  });
});
