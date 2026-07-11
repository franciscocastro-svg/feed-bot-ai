import { describe, expect, it } from "vitest";
import { buildAssSubtitleFile } from "../../worker/subtitleStyles.js";

describe("AI cut hook layout", () => {
  it("wraps a long hook into two safe lines", () => {
    const ass = buildAssSubtitleFile([], "classic", "reels", { width: 1080, height: 1920 }, 30, {
      hookText: "O LOGO DA TOYOTA NUNCA FEZ ISSO",
      hookDurationSeconds: 3,
    });

    expect(ass).toContain("\\N");
    expect(ass).toContain("MarginL, MarginR");
    expect(ass).not.toContain("fscx115");
    expect(ass).toContain("fscx102");
  });

  it("keeps short hooks centered without oversized pop", () => {
    const ass = buildAssSubtitleFile([], "classic", "reels", { width: 1080, height: 1920 }, 20, {
      hookText: "OLHA ISSO",
    });

    expect(ass).toContain("OLHA ISSO");
    expect(ass).not.toContain("OLHA\\NISSO");
    expect(ass).not.toContain("fscy115");
  });
});
