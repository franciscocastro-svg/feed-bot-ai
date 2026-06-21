import { describe, expect, it } from "vitest";
import {
  getDefaultTemplateConfig,
  getPresetTemplateConfig,
  getPresetTemplateLayout,
  getTemplateLayoutOptions,
  normalizeTemplateConfig,
  textAnchorForAlign,
  textXForBox,
} from "../../supabase/functions/_shared/template-layouts.js";

describe("professional template layouts", () => {
  it("gives the first four presets genuinely different compositions", () => {
    const layouts = ["news_minimal", "news_breaking", "news_classic", "news_yellow"]
      .map(key => getPresetTemplateLayout(key, "feed"));

    expect(new Set(layouts.map(layout => JSON.stringify(layout))).size).toBe(4);
    expect(layouts[0].photoY).not.toBe(layouts[1].photoY);
    expect(layouts[1].titleY).not.toBe(layouts[2].titleY);
    expect(layouts[2].photoX).not.toBe(layouts[3].photoX);
  });

  it("offers five editable compositions for square and vertical art", () => {
    expect(getTemplateLayoutOptions("feed")).toHaveLength(5);
    expect(getTemplateLayoutOptions("stories")).toHaveLength(5);
    expect(getTemplateLayoutOptions("reels")[0].values.photoH).toBe(1920);
    expect(getPresetTemplateLayout("breaking_news", "stories").titleAlign).toBe("center");
  });

  it("treats Stories as complete reading cards and Reels as covers", () => {
    const story = getDefaultTemplateConfig("stories");
    const reel = getDefaultTemplateConfig("reels");
    const preset = getPresetTemplateConfig("news_minimal", "stories", { badgeText: "LEIA A LEGENDA ->" });

    expect(story.subtitleMaxLines).toBeGreaterThan(reel.subtitleMaxLines);
    expect(story.titleY).not.toBe(reel.titleY);
    expect(preset.badgeText).toBe("RESUMO");
  });

  it("keeps old saved templates compatible while adding professional fields", () => {
    const config = normalizeTemplateConfig({ titleY: 540, subtitleY: 800, badgeY: 980, photoX: 90, photoY: 600, photoW: 420, photoH: 280 }, "feed");
    const defaults = getDefaultTemplateConfig("feed");

    expect(config.titleX).toBe(defaults.titleX);
    expect(config.titleY).toBe(defaults.titleY);
    expect(config.badgeW).toBe(360);
    expect(config.titleAlign).toBe("left");
  });

  it("uses the same text alignment math in canvas and SVG renderers", () => {
    expect(textXForBox(100, 600, "left")).toBe(100);
    expect(textXForBox(100, 600, "center")).toBe(400);
    expect(textXForBox(100, 600, "right")).toBe(700);
    expect(textAnchorForAlign("center")).toBe("middle");
    expect(textAnchorForAlign("right")).toBe("end");
  });

  it("preserves permanent brand elements in saved template configs", () => {
    const brandElements = [
      { id: "category", type: "text", text: "MULHER", x: 70, y: 900, width: 300, fontSize: 34, color: "#FFFFFF" },
      { id: "logo", type: "image", name: "Logo", url: "https://example.com/logo.png", x: 720, y: 900, width: 280, height: 120 },
    ];
    const config = normalizeTemplateConfig({ brandElements }, "feed");

    expect(config.brandElements).toEqual(brandElements);
  });
});
