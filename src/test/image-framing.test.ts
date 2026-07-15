import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  containDestinationRect,
  coverSourceRect,
  protectedPhotoSvg,
} from "../../supabase/functions/_shared/image-framing.js";

const readProjectFile = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("smart editorial image framing", () => {
  it("calculates a centered cover crop for the background layer", () => {
    const rect = coverSourceRect(1600, 900, 1080, 1920);
    expect(rect.x).toBeCloseTo(546.875);
    expect(rect.y).toBeCloseTo(0);
    expect(rect.width).toBeCloseTo(506.25);
    expect(rect.height).toBeCloseTo(900);
  });

  it("keeps the complete foreground image inside a vertical frame", () => {
    const rect = containDestinationRect(1600, 900, 0, 0, 1080, 1920);
    expect(rect.x).toBeCloseTo(0);
    expect(rect.y).toBeCloseTo(656.25);
    expect(rect.width).toBeCloseTo(1080);
    expect(rect.height).toBeCloseTo(607.5);
  });

  it("builds a protected SVG with a softened cover and uncropped foreground", () => {
    const svg = protectedPhotoSvg({
      href: "data:image/jpeg;base64,abc",
      x: 0,
      y: 528,
      width: 1080,
      height: 552,
      id: "feed-photo",
    });

    expect(svg).toContain('preserveAspectRatio="xMidYMid slice"');
    expect(svg).toContain('preserveAspectRatio="xMidYMid meet"');
    expect(svg).toContain("feGaussianBlur");
    expect(svg).toContain("feed-photo-clip");
    expect(svg).not.toContain("undefined");
  });

  it("does not pre-crop source photos before automatic rendering", () => {
    const processNews = readProjectFile("supabase/functions/process-news/index.ts");
    expect(processNews).toContain("protectedPhotoSvg");
    expect(processNews).toContain("id: \"feed-photo\"");
    expect(processNews).toContain("id: \"reel-photo\"");
    expect(processNews).not.toContain("w=1080&h=1080&fit=cover&output=jpg&q=85");
  });

  it("uses protected framing in browser and VPS worker renderers", () => {
    const post = readProjectFile("src/lib/composePostCanvas.ts");
    const story = readProjectFile("src/lib/composeStoryCanvas.ts");
    const worker = readProjectFile("worker/index.js");
    expect(post).toContain("drawProtectedPhoto(ctx, photoImg");
    expect(story).toContain("drawProtectedPhoto(ctx, photoImg");
    expect(worker).toContain("drawProtectedImage(ctx, photoImg");
  });
});
