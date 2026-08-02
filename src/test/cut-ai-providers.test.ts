import { afterEach, describe, expect, it } from "vitest";
import {
  geminiTranscriptionTimeoutMs,
  normalizeTimedWords,
  parseGeminiTimedWordsResponse,
  transcriptionProviderOrder,
  transcriptionSegmentSeconds,
} from "../../worker/aiProviders.js";
import { resolveCutPreset } from "../../worker/cutPresets.js";

const originalOrder = process.env.CUT_TRANSCRIPTION_PROVIDERS;

afterEach(() => {
  if (originalOrder == null) delete process.env.CUT_TRANSCRIPTION_PROVIDERS;
  else process.env.CUT_TRANSCRIPTION_PROVIDERS = originalOrder;
});

describe("Cortes IA provider architecture", () => {
  it("uses Gemini as the default transcription provider", () => {
    delete process.env.CUT_TRANSCRIPTION_PROVIDERS;
    expect(transcriptionProviderOrder()).toEqual(["gemini"]);
  });

  it("keeps Gemini requests bounded to smaller audio segments", () => {
    expect(transcriptionSegmentSeconds({})).toBe(120);
    expect(transcriptionSegmentSeconds({ CUT_TRANSCRIPTION_SEGMENT_SECONDS: "30" })).toBe(60);
    expect(transcriptionSegmentSeconds({ CUT_TRANSCRIPTION_SEGMENT_SECONDS: "900" })).toBe(300);
    expect(geminiTranscriptionTimeoutMs({})).toBe(90_000);
  });

  it("parses a complete Gemini word timestamp response", () => {
    const result = parseGeminiTimedWordsResponse('[{"word":"Olá","start":0.1,"end":0.5}]');
    expect(result).toEqual({
      words: [{ word: "Olá", start: 0.1, end: 0.5 }],
      validJson: true,
      recovered: false,
    });
  });

  it("recovers complete timestamp objects from a truncated Gemini response", () => {
    const result = parseGeminiTimedWordsResponse('texto truncado {"word":"uma","start":1,"end":1.3},{"word":"ideia","start":1.4,"end":2');
    expect(result.validJson).toBe(false);
    expect(result.recovered).toBe(true);
    expect(result.words).toEqual([{ word: "uma", start: 1, end: 1.3 }]);
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
