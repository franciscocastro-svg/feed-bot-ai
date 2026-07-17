import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  reelMotionFrame,
  STANDARD_NEWS_REEL_DURATION_SECONDS,
} from "@/lib/imageToVideo";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const worker = read("worker/index.js");
const news = read("src/pages/dashboard/News.tsx");
const browserGenerator = read("src/hooks/useReelVideoGenerator.ts");

describe("Reels Dinâmicos 20s — 1A", () => {
  it("fixa Reels editoriais em 20 segundos no navegador e no worker", () => {
    expect(STANDARD_NEWS_REEL_DURATION_SECONDS).toBe(20);
    expect(worker).toContain("STANDARD_NEWS_REEL_DURATION_SECONDS = 20");
    expect(worker).toContain("duration < 19 || duration > 21");
    expect(browserGenerator).toContain("STANDARD_NEWS_REEL_DURATION_SECONDS");
    expect(browserGenerator).not.toContain("imageToReelVideo(sourceUrl, 6, audioUrl)");
  });

  it("usa movimento progressivo único em vez de uma imagem estática ou loop visual curto", () => {
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
    expect(worker).toContain("zoompan=z='min(zoom+0.000067,1.04)'");
    expect(worker).toContain("STANDARD_NEWS_REEL_TOTAL_FRAMES");
  });

  it("mantém Stories de imagem em 6 segundos e preserva o MP4 original dos Cortes IA", () => {
    expect(news).toContain("imageToReelVideo(sourceUrl, 6)");
    expect(news).toContain("Vídeo 9:16 (6s)");
    expect(worker).toContain('item.content_type === "video_cut"');
    expect(worker).toContain("Corte IA preservado; geração editorial de 20s ignorada.");
  });

  it("explica a duração e o movimento sem prometer monetização", () => {
    expect(news).toContain("Vídeo dinâmico 9:16, 20s");
    expect(news).toContain("movimento contínuo durante 20 segundos");
    expect(news.toLowerCase()).not.toContain("monetização garantida");
  });
});
