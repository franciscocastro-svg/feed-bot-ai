import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeTemplateConfig } from "../../supabase/functions/_shared/template-layouts.js";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const page = read("src/pages/dashboard/Templates.tsx");
const browserPost = read("src/lib/composePostCanvas.ts");
const browserStory = read("src/lib/composeStoryCanvas.ts");
const worker = read("worker/index.js");

describe("Template Studio 2A.3.1 transparent overlay importer", () => {
  it("keeps legacy templates as backgrounds and accepts only the explicit overlay value", () => {
    expect(normalizeTemplateConfig({}, "stories").backgroundLayer).toBe("base");
    expect(normalizeTemplateConfig({ backgroundLayer: "overlay" }, "stories").backgroundLayer).toBe("overlay");
    const invalidConfig = Object.fromEntries([["backgroundLayer", "invalid"]]) as Parameters<typeof normalizeTemplateConfig>[0];
    expect(normalizeTemplateConfig(invalidConfig, "stories").backgroundLayer).toBe("base");
  });

  it("offers explicit background and transparent-frame imports with alpha validation", () => {
    expect(page).toContain("Usar como fundo");
    expect(page).toContain("Usar como moldura");
    expect(page).toContain("detectPngTransparency");
    expect(page).toContain("Molduras precisam ser PNG com transparência");
    expect(page).toContain("Este PNG não possui transparência suficiente para funcionar como moldura");
    expect(page).toContain('backgroundLayer: uploadLayerRef.current');
  });

  it("preserves PNG alpha in browser renderers", () => {
    expect(browserPost).toContain('usesOverlayFrame ? "png" : "jpg"');
    expect(browserStory).toContain('usesOverlayFrame ? "png" : "jpg"');
  });

  it("draws photo before the transparent frame in browser and VPS worker", () => {
    for (const source of [browserPost, browserStory]) {
      const photo = source.indexOf("if (cfg.showPhoto && item.original_image_url)");
      const frame = source.indexOf("if (usesOverlayFrame && templateBackground)", photo);
      expect(photo).toBeGreaterThan(-1);
      expect(frame).toBeGreaterThan(photo);
    }
    const workerPhoto = worker.indexOf("if (cfg.showPhoto)");
    const workerFrame = worker.indexOf("if (usesOverlayFrame && templateBackground)", workerPhoto);
    expect(workerPhoto).toBeGreaterThan(-1);
    expect(workerFrame).toBeGreaterThan(workerPhoto);
  });

  it("keeps preview and editor layer order aligned with the renderers", () => {
    expect(page).toContain('cfg.backgroundLayer === "overlay"');
    expect(page).toContain('alt="Moldura transparente do template"');
    expect(page).toContain('value={cfg.backgroundLayer}');
    expect(page).toContain("Moldura — foto fica atrás do PNG transparente");
  });
});
