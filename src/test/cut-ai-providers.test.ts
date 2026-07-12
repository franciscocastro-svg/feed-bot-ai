import { afterEach, describe, expect, it } from "vitest";
import { normalizeTimedWords, transcriptionProviderOrder } from "../../worker/aiProviders.js";
import { resolveCutPreset } from "../../worker/cutPresets.js";

const originalOrder = process.env.CUT_TRANSCRIPTION_PROVIDERS;

afterEach(() => {
  if (originalOrder == null) delete process.env.CUT_TRANSCRIPTION_PROVIDERS;
  else process.env.CUT_TRANSCRIPTION_PROVIDERS = originalOrder;
});

describe("Cortes IA provider architecture", () => {
  it("prioritizes word-timestamp transcription by default", () => {
    delete process.env.CUT_TRANSCRIPTION_PROVIDERS;
    expect(transcriptionProviderOrder()).toEqual(["groq", "gemini"]);
  });

  it("normalizes timestamps and moves subtitles slightly earlier", () => {
    const words = normalizeTimedWords([
      { word: "Olá", start: 0.2, end: 0.55 },
      { word: "mundo", start: 0.56, end: 1.1 },
    ], { maxDuration: 2, leadMs: 80 });
    expect(words).toHaveLength(2);
    expect(words[0].start).toBeCloseTo(0.12, 2);
    expect(words[1].end).toBeCloseTo(1.02, 2);
    expect(words[1].start).toBeGreaterThanOrEqual(words[0].end - 0.025);
  });

  it("keeps preset defaults but accepts explicit job overrides", () => {
    expect(resolveCutPreset("clean").subtitleStyle).toBe("clean");
    expect(resolveCutPreset("viral", { zoom_effect: false }).zoomEffect).toBe(false);
  });
});
