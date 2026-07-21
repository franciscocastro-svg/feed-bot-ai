import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createCutReuseContext,
  cutReuseTrace,
  cutSegmentReuseKey,
  remapTranscriptToKeptSegments,
  sliceSourceTranscript,
} from "../../worker/cutReuse.js";

describe("Cortes IA 2.0-A efficiency reuse", () => {
  it("shares preparation for the same interval across output formats", () => {
    const reels = cutSegmentReuseKey({
      id: "reels-output",
      format: "reels",
      start_seconds: 12,
      duration_seconds: 38,
    }, true);
    const square = cutSegmentReuseKey({
      id: "square-output",
      format: "feed_square",
      start_seconds: 12,
      duration_seconds: 38,
    }, true);
    expect(reels).toBe(square);
    expect(reels).toContain("trim");
  });

  it("slices the full transcript and makes timestamps relative to the clip", () => {
    const result = sliceSourceTranscript([
      { word: "começo", start: 9.9, end: 10.2 },
      { word: "ideia", start: 12, end: 13 },
      { word: "fora", start: 20, end: 20.4 },
    ], 10, 20);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ word: "começo", start: 0 });
    expect(result[0].end).toBeCloseTo(0.2);
    expect(result[1]).toEqual({ word: "ideia", start: 2, end: 3 });
  });

  it("remaps subtitle timestamps after deterministic silence removal", () => {
    const result = remapTranscriptToKeptSegments([
      { word: "antes", start: 0.2, end: 0.5 },
      { word: "silêncio", start: 1.1, end: 1.4 },
      { word: "depois", start: 2.2, end: 2.5 },
    ], [
      { start: 0, end: 1 },
      { start: 2, end: 3 },
    ], 2);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ word: "antes", start: 0.2, end: 0.5 });
    expect(result[1]).toMatchObject({ word: "depois", end: 1.5 });
    expect(result[1].start).toBeCloseTo(1.2);
  });

  it("reports reuse and provider calls without requiring a database migration", () => {
    const context = createCutReuseContext([], {
      calls: 2,
      providers: { groq: 2 },
      duration_ms: 450,
    });
    context.metrics.segmentPreparations = 1;
    context.metrics.segmentReuses = 2;
    context.metrics.sourceTranscriptReuses = 3;
    context.metrics.focusAnalyses = 1;
    context.metrics.focusReuses = 2;
    context.metrics.outputs = 3;
    expect(cutReuseTrace(context)).toEqual({
      source_transcription: {
        calls: 2,
        providers: { groq: 2 },
        duration_ms: 450,
        reused_for_outputs: 3,
      },
      rendering_reuse: {
        segment_preparations: 1,
        segment_reuses: 2,
        clip_transcription_calls: 0,
        focus_analyses: 1,
        focus_reuses: 2,
        outputs: 3,
      },
    });
  });

  it("keeps flexible AI-selected duration and integrates reuse into the worker", () => {
    const worker = fs.readFileSync(path.join(process.cwd(), "worker/index.js"), "utf8");
    expect(worker).toContain("const MIN_NATURAL_CUT_SECONDS = 8");
    expect(worker).toContain("const MAX_NATURAL_CUT_SECONDS = 180");
    expect(worker).toContain("createCutReuseContext(transcriptWords, sourceTranscriptionTrace)");
    expect(worker).toContain("cutReuseTrace(cutReuseContext)");
    expect(worker).toContain('clip.transcription_provider = "source_reuse"');
  });
});
