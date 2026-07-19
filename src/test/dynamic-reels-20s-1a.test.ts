import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_EDITORIAL_REEL_DURATION_SECONDS,
  EDITORIAL_REEL_DURATION_OPTIONS,
  editorialReelFrameCount,
  normalizeEditorialReelDuration,
  reelMotionFrame,
  STANDARD_NEWS_REEL_DURATION_SECONDS,
} from "@/lib/imageToVideo";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const worker = read("worker/index.js");
const news = read("src/pages/dashboard/News.tsx");
const browserGenerator = read("src/hooks/useReelVideoGenerator.ts");

describe("Reels editoriais configuráveis 6/20/30", () => {
  it("aceita somente 6, 20 ou 30 segundos e mantém 20 como padrão seguro", () => {
    expect(STANDARD_NEWS_REEL_DURATION_SECONDS).toBe(20);
    expect(DEFAULT_EDITORIAL_REEL_DURATION_SECONDS).toBe(20);
    expect(EDITORIAL_REEL_DURATION_OPTIONS).toEqual([6, 20, 30]);
    expect(normalizeEditorialReelDuration(6)).toBe(6);
    expect(normalizeEditorialReelDuration("20")).toBe(20);
    expect(normalizeEditorialReelDuration(30)).toBe(30);
    expect(normalizeEditorialReelDuration(12)).toBe(20);
    expect(normalizeEditorialReelDuration(null)).toBe(20);
    expect(worker).toContain("EDITORIAL_REEL_DURATION_OPTIONS = new Set([6, 20, 30])");
    expect(worker).toContain("DEFAULT_EDITORIAL_REEL_DURATION_SECONDS = 20");
    expect(worker).toContain("Math.abs(duration - expectedDurationSeconds) > 1");
    expect(browserGenerator).toContain('if (p.media_type === "reel") return false');
    expect(browserGenerator).not.toContain("editorial_reel_duration_seconds");
  });

  it("calcula os frames para cada duração e mantém um único movimento progressivo", () => {
    const start = reelMotionFrame(0);
    const middle = reelMotionFrame(0.5);
    const end = reelMotionFrame(1);

    expect(start.zoom).toBe(1);
    expect(middle.zoom).toBeGreaterThan(start.zoom);
    expect(end.zoom).toBeCloseTo(1.04, 5);
    expect(middle.driftX).toBeGreaterThan(start.driftX);
    expect(middle.driftY).toBeLessThan(start.driftY);
    expect(end.driftX).toBeCloseTo(0, 5);
    expect(end.driftY).toBeCloseTo(0, 5);
    expect(editorialReelFrameCount(6)).toBe(180);
    expect(editorialReelFrameCount(20)).toBe(600);
    expect(editorialReelFrameCount(30)).toBe(900);
    expect(worker).toContain("const totalFrames = durationSeconds * STANDARD_NEWS_REEL_FRAME_RATE");
    expect(worker).toContain("const zoomIncrement = (0.04 / totalFrames).toFixed(9)");
    expect(worker).toContain("`-frames:v ${totalFrames}`");
  });

  it("mantém Stories de imagem em 6 segundos e preserva o MP4 original dos Cortes IA", () => {
    expect(news).toContain("imageToReelVideo(sourceUrl, 6)");
    expect(news).toContain("Vídeo 9:16 (6s)");
    expect(worker).toContain('item.content_type === "video_cut"');
    expect(worker).toContain("Corte IA preservado; geração editorial configurável ignorada.");
    expect(news).toContain("duração flexível escolhida pela IA");
  });

  it("explica a duração escolhida sem prometer alcance", () => {
    expect(news).toContain("${editorialReelDuration}s");
    expect(news).toContain("movimento contínuo durante ${editorialReelDuration} segundos");
    expect(news.toLowerCase()).not.toContain("monetização garantida");
    expect(news.toLowerCase()).not.toContain("alcance garantido");
  });
});
