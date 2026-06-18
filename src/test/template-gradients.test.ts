import { describe, expect, it, vi } from "vitest";
import {
  PRESET_GRADIENTS,
  drawTemplateGradient,
  normalizeTemplateGradient,
  resolveTemplateGradient,
  templateGradientCss,
  templateGradientSvg,
} from "../../supabase/functions/_shared/template-gradients.js";

describe("template preset gradients", () => {
  it("defines a unique production background for every library preset", () => {
    expect(Object.keys(PRESET_GRADIENTS)).toHaveLength(32);
    expect(PRESET_GRADIENTS.news_breaking).not.toEqual(PRESET_GRADIENTS.econ_bull);
    expect(PRESET_GRADIENTS.tec_ai.angle).toBe(135);
    expect(PRESET_GRADIENTS.soc_derby.angle).toBe(90);
  });

  it("uses a saved custom gradient before the preset fallback", () => {
    const custom = {
      angle: 45,
      stops: [
        { color: "#112233", offset: 0 },
        { color: "#AABBCC", offset: 1 },
      ],
    };

    expect(resolveTemplateGradient("news_breaking", { backgroundGradient: custom })).toEqual(custom);
    expect(templateGradientCss("news_breaking", { backgroundGradient: custom }))
      .toBe("linear-gradient(45deg, #112233 0%, #AABBCC 100%)");
  });

  it("sanitizes colors and clamps stop positions", () => {
    expect(normalizeTemplateGradient({
      angle: "invalid",
      stops: [
        { color: "red\" onload=\"alert(1)", offset: -4 },
        { color: "#ABCDEF", offset: 3 },
      ],
    })).toEqual({
      angle: 180,
      stops: [
        { color: "#18181B", offset: 0 },
        { color: "#ABCDEF", offset: 1 },
      ],
    });
  });

  it("paints the same resolved stops on canvas", () => {
    const addColorStop = vi.fn();
    const fillRect = vi.fn();
    const ctx = {
      createLinearGradient: vi.fn(() => ({ addColorStop })),
      fillStyle: null,
      fillRect,
    } as unknown as CanvasRenderingContext2D;

    drawTemplateGradient(ctx, "tec_dark", null, 1080, 1920);

    expect(addColorStop).toHaveBeenNthCalledWith(1, 0, "#0A0A0A");
    expect(addColorStop).toHaveBeenNthCalledWith(2, 1, "#7C3AED");
    expect(fillRect).toHaveBeenCalledWith(0, 0, 1080, 1920);
  });

  it("emits a complete SVG background for Edge rendering", () => {
    const svg = templateGradientSvg("rel_peace", null, 1080, 1920);

    expect(svg).toContain("<linearGradient");
    expect(svg).toContain('stop-color="#DBEAFE"');
    expect(svg).toContain('stop-color="#1E40AF"');
    expect(svg).toContain('y2="1920"');
    expect(svg).toContain('<rect width="1080" height="1920"');
  });
});
