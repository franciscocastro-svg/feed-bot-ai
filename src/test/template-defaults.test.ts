import { describe, expect, it } from "vitest";
import { resolveAccountTemplateDefaults } from "@/lib/templateDefaults";

const templates = [
  { id: "feed-global", format: "feed" },
  { id: "feed-fuxico", format: "feed" },
  { id: "story-global", format: "stories" },
  { id: "reel-dolariza", format: "reels" },
];

describe("account template defaults", () => {
  it("keeps an account override isolated and inherits the other formats", () => {
    const result = resolveAccountTemplateDefaults(
      templates,
      { default_feed_template_id: "feed-global", default_story_template_id: "story-global" },
      { default_feed_template_id: "feed-fuxico" },
      true,
    );
    expect(result.ids).toEqual({ feed: "feed-fuxico", stories: "story-global", reels: null });
    expect(result.sources).toEqual({ feed: "account", stories: "global", reels: null });
  });

  it("does not reuse another account's override", () => {
    const result = resolveAccountTemplateDefaults(
      templates,
      { default_feed_template_id: "feed-global", default_story_template_id: "story-global" },
      { default_reel_template_id: "reel-dolariza" },
      true,
    );
    expect(result.ids).toEqual({ feed: "feed-global", stories: "story-global", reels: "reel-dolariza" });
  });

  it("ignores an id that belongs to the wrong format", () => {
    const result = resolveAccountTemplateDefaults(
      templates,
      { default_feed_template_id: "feed-global" },
      { default_story_template_id: "feed-fuxico" },
      true,
    );
    expect(result.ids.stories).toBeNull();
  });
});
