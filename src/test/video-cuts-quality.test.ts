import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  professionalCandidatePoolSize,
  refineTranscriptCutCandidates,
} from "../../worker/cutQuality.js";

const sentence = (start: number, text: string[]) => text.map((word, index) => ({
  word,
  start: start + index * 0.8,
  end: start + index * 0.8 + 0.45,
}));

describe("Cortes IA 2.0-B professional quality", () => {
  it("snaps a rough suggestion to natural sentence boundaries", () => {
    const words = [
      ...sentence(0.2, ["A", "mudança", "começou", "ontem."]),
      ...sentence(4.2, ["Agora", "o", "resultado", "ficou", "muito", "mais", "claro."]),
    ];
    const result = refineTranscriptCutCandidates([{
      start_seconds: 4.8,
      end_seconds: 9,
      hook_score: 82,
      emotion_score: 70,
      clarity_score: 88,
    }], words, {
      requested: 1,
      videoDuration: 12,
      minDuration: 3,
      maxDuration: 10,
    });

    expect(result.clips).toHaveLength(1);
    expect(result.clips[0].start_seconds).toBeCloseTo(4.2);
    expect(result.clips[0].end_seconds).toBeCloseTo(9.45);
    expect(result.clips[0].selection_quality).toMatchObject({
      natural_start: true,
      natural_end: true,
      completeness_score: 100,
      boundary_adjusted: true,
    });
  });

  it("removes near-duplicate candidates and keeps distinct moments", () => {
    const words = [
      ...sentence(10, ["Primeira", "ideia", "forte", "e", "completa."]),
      ...sentence(40, ["Segunda", "ideia", "diferente", "e", "completa."]),
    ];
    const result = refineTranscriptCutCandidates([
      { start_seconds: 10, end_seconds: 14, viral_score: 96, title: "principal" },
      { start_seconds: 10.4, end_seconds: 14.2, viral_score: 94, title: "duplicado" },
      { start_seconds: 40, end_seconds: 44, viral_score: 86, title: "diferente" },
    ], words, {
      requested: 2,
      videoDuration: 60,
      minDuration: 3,
      maxDuration: 20,
    });

    expect(result.clips.map((clip) => clip.title)).toEqual(["principal", "diferente"]);
    expect(result.trace).toMatchObject({
      candidate_pool: 3,
      selected: 2,
      duplicates_removed: 1,
      additional_ai_calls: 0,
    });
  });

  it("keeps long cuts when the complete idea needs them", () => {
    const words = [
      { word: "Começo", start: 10, end: 10.5 },
      { word: "da", start: 60, end: 60.4 },
      { word: "explicação", start: 100, end: 100.5 },
      { word: "completa.", start: 139, end: 140 },
    ];
    const result = refineTranscriptCutCandidates([{
      start_seconds: 10,
      end_seconds: 140,
      viral_score: 90,
    }], words, {
      requested: 1,
      videoDuration: 200,
      minDuration: 8,
      maxDuration: 180,
    });

    expect(result.clips[0].duration_seconds).toBeGreaterThan(120);
    expect(result.trace.duration_policy).toBe("ai_flexible_8_180");
  });

  it("ranks complete speech above a similarly scored broken fragment", () => {
    const words = [
      ...sentence(0, ["Uma", "fala", "completa."]),
      ...sentence(12, ["trecho", "sem", "final"]),
    ];
    const result = refineTranscriptCutCandidates([
      { start_seconds: 0, end_seconds: 2.1, viral_score: 80, title: "completo" },
      { start_seconds: 12.5, end_seconds: 13.8, viral_score: 80, title: "quebrado" },
    ], words, {
      requested: 2,
      videoDuration: 20,
      minDuration: 1,
      maxDuration: 10,
    });

    expect(result.clips[0].title).toBe("completo");
    expect(result.clips[0].professional_score).toBeGreaterThan(result.clips[1].professional_score);
  });

  it("requests a bounded candidate pool in the same AI call", () => {
    expect(professionalCandidatePoolSize(1)).toBe(3);
    expect(professionalCandidatePoolSize(3)).toBe(6);
    expect(professionalCandidatePoolSize(5)).toBe(8);
  });

  it("integrates quality telemetry without fixing duration or adding migrations", () => {
    const worker = fs.readFileSync(path.join(process.cwd(), "worker/index.js"), "utf8");
    const quality = fs.readFileSync(path.join(process.cwd(), "worker/cutQuality.js"), "utf8");
    expect(worker).toContain("professionalCandidatePoolSize(requested)");
    expect(worker).toContain("refineTranscriptCutCandidates(");
    expect(worker).toContain("editorial_quality: analysis.quality_trace || null");
    expect(worker).toContain("const MIN_NATURAL_CUT_SECONDS = 8");
    expect(worker).toContain("const MAX_NATURAL_CUT_SECONDS = 180");
    expect(quality).toContain('additional_ai_calls: 0');
  });
});
