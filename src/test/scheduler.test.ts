/**
 * Testes unitários para as funções puras do publish-scheduler.
 *
 * Como a Edge Function roda em Deno e não pode ser importada diretamente,
 * replicamos aqui apenas as funções PURAS (sem I/O, sem Supabase) para
 * garantir que a lógica de negócio central está correta.
 */

import { describe, it, expect } from "vitest";

// ─── Funções extraídas do publish-scheduler/index.ts ───────────────────────
// (Mantemos sincronizadas manualmente; qualquer mudança lá deve refletir aqui)

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
const toBRT = (d: Date) => new Date(d.getTime() - BRT_OFFSET_MS);
const fromBRT = (d: Date) => new Date(d.getTime() + BRT_OFFSET_MS);

function normalizedHours(value: unknown): number[] {
  return Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map(Number)
            .filter((h) => Number.isFinite(h) && h >= 0 && h <= 23)
        )
      ).sort((a, b) => a - b)
    : [];
}

function isAllowedHour(date: Date, allowedHours: number[]) {
  return !allowedHours.length || allowedHours.includes(toBRT(date).getUTCHours());
}

function nextSpacedSlot(desiredMs: number, takenTimes: number[], minGapMs: number) {
  let slot = desiredMs;
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 500) {
    changed = false;
    for (const taken of takenTimes) {
      if (Math.abs(slot - taken) < minGapMs) {
        slot = taken + minGapMs;
        changed = true;
      }
    }
  }
  return slot;
}

function nextAllowedSpacedSlot(
  desiredMs: number,
  takenTimes: number[],
  minGapMs: number,
  allowedHours: number[]
) {
  let slot = desiredMs;
  for (let guard = 0; guard < 1000; guard++) {
    const candBRT = toBRT(new Date(slot));
    const hour = candBRT.getUTCHours();
    if (allowedHours.length && !allowedHours.includes(hour)) {
      const nextHour = allowedHours.find((h) => h > hour) ?? allowedHours[0];
      const nextBRT = new Date(candBRT);
      if (nextHour > hour) nextBRT.setUTCHours(nextHour, 0, 0, 0);
      else {
        nextBRT.setUTCDate(nextBRT.getUTCDate() + 1);
        nextBRT.setUTCHours(nextHour, 0, 0, 0);
      }
      slot = fromBRT(nextBRT).getTime();
      continue;
    }
    const spaced = nextSpacedSlot(slot, takenTimes, minGapMs);
    if (spaced === slot) return slot;
    slot = spaced;
  }
  return slot;
}

const MAX_TRANSIENT_RETRIES = 4;

function isTransientMediaError(message: string): boolean {
  return /2207082|2207001|media upload has failed|temporarily unavailable|service.*unavail|an unknown error|please try again|fetch failed|network error|timeout|demorou|processar (o vídeo|a mídia)|ETIMEDOUT|ECONNRESET|EAI_AGAIN/i.test(
    message
  );
}

function isAppRateLimitMessage(message: string): boolean {
  return /application request limit reached|código 4\b|\/2207051/i.test(message);
}

function isRateLimitError(data: { error?: { code?: number; error_subcode?: number; message?: string } }) {
  const code = data?.error?.code;
  const sub = data?.error?.error_subcode;
  const msg = data?.error?.message || "";
  return code === 9 || sub === 2207042 || /too many actions/i.test(msg);
}

function transientBackoffMinutes(attempt: number): number {
  return [3, 10, 25, 60][Math.min(attempt - 1, 3)] ?? 60;
}

// ─── Testes ────────────────────────────────────────────────────────────────

describe("normalizedHours", () => {
  it("retorna array vazio para não-array", () => {
    expect(normalizedHours(null)).toEqual([]);
    expect(normalizedHours(undefined)).toEqual([]);
    expect(normalizedHours("08")).toEqual([]);
    expect(normalizedHours(8)).toEqual([]);
  });

  it("filtra horas inválidas e mantém apenas 0-23", () => {
    expect(normalizedHours([-1, 0, 8, 12, 23, 24, 100])).toEqual([0, 8, 12, 23]);
  });

  it("deduplica horas repetidas", () => {
    expect(normalizedHours([8, 8, 12, 12, 18])).toEqual([8, 12, 18]);
  });

  it("ordena as horas em ordem crescente", () => {
    expect(normalizedHours([22, 6, 14])).toEqual([6, 14, 22]);
  });

  it("aceita array de strings numéricas", () => {
    expect(normalizedHours(["9", "18", "22"])).toEqual([9, 18, 22]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("isAllowedHour", () => {
  // BRT = UTC-3. Para testar hora 9h BRT, usamos UTC 12h.
  const makeBRTDate = (hourBRT: number) => {
    // Cria uma data UTC que, convertida para BRT, seja hourBRT
    const d = new Date(0);
    d.setUTCHours(hourBRT + 3, 0, 0, 0);
    return d;
  };

  it("permite qualquer hora quando allowedHours está vazio", () => {
    expect(isAllowedHour(makeBRTDate(0), [])).toBe(true);
    expect(isAllowedHour(makeBRTDate(3), [])).toBe(true);
    expect(isAllowedHour(makeBRTDate(23), [])).toBe(true);
  });

  it("permite apenas as horas configuradas", () => {
    const allowed = [9, 14, 20];
    expect(isAllowedHour(makeBRTDate(9), allowed)).toBe(true);
    expect(isAllowedHour(makeBRTDate(14), allowed)).toBe(true);
    expect(isAllowedHour(makeBRTDate(20), allowed)).toBe(true);
    expect(isAllowedHour(makeBRTDate(10), allowed)).toBe(false);
    expect(isAllowedHour(makeBRTDate(0), allowed)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("nextSpacedSlot", () => {
  const MIN_10 = 10 * 60_000;

  it("retorna o desiredMs quando não há slots ocupados", () => {
    const now = Date.now();
    expect(nextSpacedSlot(now, [], MIN_10)).toBe(now);
  });

  it("avança para depois do slot mais próximo quando há colisão", () => {
    const base = 1_000_000;
    const taken = [base]; // slot já ocupado
    const result = nextSpacedSlot(base, taken, MIN_10);
    expect(result).toBeGreaterThanOrEqual(base + MIN_10);
  });

  it("avança em cascata para múltiplos slots consecutivos", () => {
    const base = 1_000_000;
    const taken = [base, base + MIN_10, base + 2 * MIN_10];
    const result = nextSpacedSlot(base, taken, MIN_10);
    expect(result).toBeGreaterThanOrEqual(base + 3 * MIN_10);
  });

  it("não modifica o slot se o taken está fora do gap mínimo", () => {
    const base = 1_000_000;
    const taken = [base - 2 * MIN_10]; // Bem antes, sem conflito
    expect(nextSpacedSlot(base, taken, MIN_10)).toBe(base);
  });

  it("funciona com gap de 60 minutos", () => {
    const GAP_60 = 60 * 60_000;
    const base = 2_000_000;
    const taken = [base];
    const result = nextSpacedSlot(base, taken, GAP_60);
    expect(result).toBeGreaterThanOrEqual(base + GAP_60);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("nextAllowedSpacedSlot", () => {
  const MIN_10 = 10 * 60_000;

  // Cria timestamp UTC que corresponde a hora BRT específica
  const brtHourToUtcMs = (hourBRT: number) => {
    const d = new Date("2024-01-15T00:00:00Z");
    d.setUTCHours(hourBRT + 3, 0, 0, 0);
    return d.getTime();
  };

  it("retorna o slot original quando allowedHours está vazio", () => {
    const slot = brtHourToUtcMs(3); // 3h BRT, fora de qualquer horário comercial
    expect(nextAllowedSpacedSlot(slot, [], MIN_10, [])).toBe(slot);
  });

  it("avança para o próximo horário permitido quando fora da janela", () => {
    const slotOutsideWindow = brtHourToUtcMs(5); // 5h BRT
    const allowed = [9, 14, 20]; // apenas 9h, 14h e 20h
    const result = nextAllowedSpacedSlot(slotOutsideWindow, [], MIN_10, allowed);
    const resultBRT = toBRT(new Date(result));
    expect(resultBRT.getUTCHours()).toBe(9);
  });

  it("avança para o dia seguinte quando não há mais horas disponíveis no dia atual", () => {
    const lateEvening = brtHourToUtcMs(22); // 22h BRT
    const allowed = [9, 14]; // horas já passadas para o dia
    const result = nextAllowedSpacedSlot(lateEvening, [], MIN_10, allowed);
    const resultBRT = toBRT(new Date(result));
    // Deve ser 9h BRT no dia seguinte
    expect(resultBRT.getUTCHours()).toBe(9);
    expect(result).toBeGreaterThan(lateEvening);
  });

  it("respeita tanto o horário permitido quanto o espaçamento mínimo", () => {
    const slot9h = brtHourToUtcMs(9); // 9h BRT
    const taken = [slot9h]; // 9h já está ocupado
    const allowed = [9, 14, 20];
    const result = nextAllowedSpacedSlot(slot9h, taken, MIN_10, allowed);
    expect(result).toBeGreaterThanOrEqual(slot9h + MIN_10);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("transientBackoffMinutes", () => {
  it("retorna 3 min na primeira tentativa", () => {
    expect(transientBackoffMinutes(1)).toBe(3);
  });

  it("retorna 10 min na segunda tentativa", () => {
    expect(transientBackoffMinutes(2)).toBe(10);
  });

  it("retorna 25 min na terceira tentativa", () => {
    expect(transientBackoffMinutes(3)).toBe(25);
  });

  it("retorna 60 min na quarta tentativa", () => {
    expect(transientBackoffMinutes(4)).toBe(60);
  });

  it("fica em 60 min para tentativas além da 4ª (teto)", () => {
    expect(transientBackoffMinutes(5)).toBe(60);
    expect(transientBackoffMinutes(10)).toBe(60);
    expect(transientBackoffMinutes(100)).toBe(60);
  });

  it("teto de 4 retentativas está em sincronia com MAX_TRANSIENT_RETRIES", () => {
    expect(MAX_TRANSIENT_RETRIES).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("isTransientMediaError", () => {
  const transientMessages = [
    "2207082",
    "2207001",
    "Media upload has failed",
    "Service temporarily unavailable",
    "Service is unavail",
    "An unknown error occurred",
    "Please try again later",
    "fetch failed",
    "network error",
    "timeout",
    "Instagram demorou para processar o vídeo",
    "processar a mídia levou muito tempo",
    "ETIMEDOUT",
    "ECONNRESET",
    "EAI_AGAIN",
  ];

  transientMessages.forEach((msg) => {
    it(`classifica "${msg.slice(0, 40)}" como transitório`, () => {
      expect(isTransientMediaError(msg)).toBe(true);
    });
  });

  const permanentMessages = [
    "Token do Instagram expirou",
    "invalid_token",
    "Conta não autorizada",
    "O formato da imagem não é suportado",
    "Caption is too long",
    "TOKEN_EXPIRED: Token do Instagram expirou",
  ];

  permanentMessages.forEach((msg) => {
    it(`NÃO classifica "${msg.slice(0, 40)}" como transitório`, () => {
      expect(isTransientMediaError(msg)).toBe(false);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("isAppRateLimitMessage", () => {
  it('detecta "Application request limit reached"', () => {
    expect(isAppRateLimitMessage("Application request limit reached")).toBe(true);
  });

  it("detecta variação com subcode /2207051 na mensagem", () => {
    expect(isAppRateLimitMessage("Error /2207051: rate limit")).toBe(true);
  });

  it('detecta "código 4" em português', () => {
    expect(isAppRateLimitMessage("Erro código 4: limite atingido")).toBe(true);
  });

  it("NÃO classifica erro de conta (code 9) como app limit", () => {
    expect(isAppRateLimitMessage("too many actions on this account (code 9)")).toBe(false);
  });

  it("NÃO classifica erro de token expirado como app limit", () => {
    expect(isAppRateLimitMessage("Token expired code 190")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("isRateLimitError", () => {
  it("detecta code 9 (account-level rate limit)", () => {
    expect(isRateLimitError({ error: { code: 9 } })).toBe(true);
  });

  it("detecta subcode 2207042", () => {
    expect(isRateLimitError({ error: { error_subcode: 2207042 } })).toBe(true);
  });

  it('detecta mensagem "too many actions"', () => {
    expect(isRateLimitError({ error: { message: "too many actions on account" } })).toBe(true);
  });

  it("retorna false para erros normais", () => {
    expect(isRateLimitError({ error: { code: 190, message: "Token expired" } })).toBe(false);
  });

  it("retorna false para object sem error", () => {
    expect(isRateLimitError({})).toBe(false);
  });

  it("NÃO classifica code 4/2207051 como rate limit de conta (é app-level)", () => {
    // code 4 NÃO deve ser disparado pelo isRateLimitError — só isAppRateLimitMessage
    expect(isRateLimitError({ error: { code: 4, error_subcode: 2207051 } })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("BRT timezone conversion", () => {
  it("toBRT converte corretamente UTC → BRT (UTC-3)", () => {
    // 12:00 UTC → 09:00 BRT
    const utcNoon = new Date("2024-06-01T12:00:00Z");
    const brt = toBRT(utcNoon);
    expect(brt.getUTCHours()).toBe(9);
  });

  it("fromBRT converte corretamente BRT → UTC", () => {
    // 09:00 BRT → 12:00 UTC
    const brt9h = new Date("2024-06-01T09:00:00Z");
    const utc = fromBRT(brt9h);
    expect(utc.getUTCHours()).toBe(12);
  });

  it("round-trip toBRT → fromBRT retorna o valor original", () => {
    const original = new Date("2024-06-01T15:30:00Z");
    expect(fromBRT(toBRT(original)).getTime()).toBe(original.getTime());
  });

  it("round-trip fromBRT → toBRT retorna o valor original", () => {
    const brt = new Date("2024-06-01T08:00:00Z");
    expect(toBRT(fromBRT(brt)).getTime()).toBe(brt.getTime());
  });
});
