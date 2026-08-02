import { describe, expect, it } from "vitest";
import {
  VIDEO_CUT_REFRESH_GRACE_MS,
  shouldDeferVideoCutRefresh,
} from "../lib/videoCuts";

describe("atualização dos vídeos finais de Cortes IA", () => {
  const now = 100_000;

  it("adia a atualização enquanto o vídeo está realmente tocando", () => {
    expect(shouldDeferVideoCutRefresh({ paused: false, ended: false, now })).toBe(true);
  });

  it("preserva uma pausa recente por uma janela curta", () => {
    expect(shouldDeferVideoCutRefresh({
      paused: true,
      ended: false,
      lastActivityAt: now - VIDEO_CUT_REFRESH_GRACE_MS + 1,
      now,
    })).toBe(true);
  });

  it("volta a atualizar mesmo que o vídeo pausado já tenha sido reproduzido", () => {
    expect(shouldDeferVideoCutRefresh({
      paused: true,
      ended: false,
      lastActivityAt: now - VIDEO_CUT_REFRESH_GRACE_MS,
      now,
    })).toBe(false);
  });

  it("não bloqueia atualização para vídeo encerrado ou nunca reproduzido", () => {
    expect(shouldDeferVideoCutRefresh({ paused: false, ended: true, now })).toBe(false);
    expect(shouldDeferVideoCutRefresh({ paused: true, ended: false, lastActivityAt: 0, now })).toBe(false);
  });
});
