import { describe, expect, it } from "vitest";
import { formatCutTime, isSupportedYoutubeUrl, splitHashtags, videoCutRequestBounds } from "@/lib/videoCuts";

describe("video cuts helpers", () => {
  it("accepts public YouTube URL shapes", () => {
    expect(isSupportedYoutubeUrl("https://www.youtube.com/watch?v=abc")).toBe(true);
    expect(isSupportedYoutubeUrl("https://youtu.be/abc")).toBe(true);
    expect(isSupportedYoutubeUrl("https://m.youtube.com/watch?v=abc")).toBe(true);
  });

  it("rejects non-YouTube URLs", () => {
    expect(isSupportedYoutubeUrl("https://example.com/video")).toBe(false);
    expect(isSupportedYoutubeUrl("https://studio.youtube.com/video/abc/edit")).toBe(false);
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
});
