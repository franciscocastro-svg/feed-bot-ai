import { describe, expect, it } from "vitest";
import { formatCutTime, isSupportedYoutubeUrl, normalizeYoutubeUrl, splitHashtags, videoCutRequestBounds, viralBadgeTone, viralBadgeLabel, youtubeVideoId } from "@/lib/videoCuts";

describe("video cuts helpers", () => {
  it("accepts public YouTube URL shapes", () => {
    expect(isSupportedYoutubeUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    expect(isSupportedYoutubeUrl("https://youtu.be/dQw4w9WgXcQ?t=10")).toBe(true);
    expect(isSupportedYoutubeUrl("https://m.youtube.com/shorts/dQw4w9WgXcQ")).toBe(true);
    expect(isSupportedYoutubeUrl("https://www.youtube.com/live/dQw4w9WgXcQ")).toBe(true);
    expect(youtubeVideoId("https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=abc")).toBe("dQw4w9WgXcQ");
    expect(normalizeYoutubeUrl("https://youtu.be/dQw4w9WgXcQ?t=10")).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  });

  it("rejects non-YouTube URLs", () => {
    expect(isSupportedYoutubeUrl("https://example.com/video")).toBe(false);
    expect(isSupportedYoutubeUrl("https://studio.youtube.com/video/dQw4w9WgXcQ/edit")).toBe(false);
    expect(isSupportedYoutubeUrl("https://www.youtube.com/playlist?list=PL123")).toBe(false);
    expect(isSupportedYoutubeUrl("https://www.youtube.com/watch?v=curto")).toBe(false);
    expect(isSupportedYoutubeUrl("nota solta")).toBe(false);
  });

  it("calculates daily bounds with reservations", () => {
    const result = videoCutRequestBounds({ used: 2, reserved: 1, limit: 5, maxPerJob: 5 });
    expect(result.remaining).toBe(2);
    expect(result.maxRequest).toBe(2);
  });

  it("caps job size at five cuts even for larger plans", () => {
    const result = videoCutRequestBounds({ used: 0, reserved: 0, limit: 20, maxPerJob: 10 });
    expect(result.maxPerJob).toBe(5);
    expect(result.maxRequest).toBe(5);
  });

  it("formats timestamps and hashtags for the UI", () => {
    expect(formatCutTime(95)).toBe("1:35");
    expect(splitHashtags("futebol, #viral reels")).toEqual(["#futebol", "#viral", "#reels"]);
  });

  it("multiplies quota consumption by selected format count", () => {
    // limit 6, 2 formatos escolhidos → só cabem 3 sugestões (3×2=6)
    const two = videoCutRequestBounds({ used: 0, reserved: 0, limit: 6, maxPerJob: 5, formatsCount: 2 });
    expect(two.maxRequest).toBe(3);
    // 3 formatos → só cabem 2 sugestões (2×3=6)
    const three = videoCutRequestBounds({ used: 0, reserved: 0, limit: 6, maxPerJob: 5, formatsCount: 3 });
    expect(three.maxRequest).toBe(2);
  });

  it("classifies viral score in three tones", () => {
    expect(viralBadgeTone(90)).toBe("high");
    expect(viralBadgeTone(60)).toBe("mid");
    expect(viralBadgeTone(30)).toBe("low");
    expect(viralBadgeTone(null)).toBe("unknown");
    expect(viralBadgeLabel(90)).toContain("Viral");
  });
});
