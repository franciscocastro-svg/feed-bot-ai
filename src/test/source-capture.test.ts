import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertSafeHttpUrl,
  buildSourceFetchUrl,
  canonicalizeArticleUrl,
  filterItemsForSource,
  parseAtomItems,
  parseHtmlListing,
  parseRssItems,
  previewSource,
} from "../../supabase/functions/_shared/source-capture.ts";

describe("source capture utilities", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses RSS items with image metadata", () => {
    const xml = `
      <rss><channel>
        <item>
          <title><![CDATA[Grande novidade de tecnologia no Brasil]]></title>
          <link>https://example.com/noticias/2026/07/04/tech.html</link>
          <description><![CDATA[Texto com resumo da notícia]]></description>
          <pubDate>Sat, 04 Jul 2026 12:00:00 GMT</pubDate>
          <media:content url="https://example.com/image.jpg" />
        </item>
      </channel></rss>`;

    const items = parseRssItems(xml);

    expect(items).toHaveLength(1);
    expect(items[0].title).toContain("tecnologia");
    expect(items[0].image).toBe("https://example.com/image.jpg");
  });

  it("parses Atom entries", () => {
    const xml = `
      <feed>
        <entry>
          <title>Nova descoberta em inteligência artificial</title>
          <link rel="alternate" href="https://example.com/news/ai" />
          <updated>2026-07-04T12:00:00Z</updated>
          <summary>Resumo do item Atom.</summary>
        </entry>
      </feed>`;

    const items = parseAtomItems(xml);

    expect(items).toHaveLength(1);
    expect(items[0].sourceType).toBe("atom");
    expect(items[0].link).toBe("https://example.com/news/ai");
  });

  it("extracts article links from HTML listings", () => {
    const html = `
      <main>
        <a href="/noticias/2026/07/04/materia-importante.html">
          Matéria importante sobre tecnologia brasileira
        </a>
      </main>`;

    const items = parseHtmlListing(html, "https://example.com/noticias");

    expect(items).toHaveLength(1);
    expect(items[0].link).toBe("https://example.com/noticias/2026/07/04/materia-importante.html");
  });

  it("rejects private URLs", () => {
    expect(() => assertSafeHttpUrl("http://127.0.0.1:54321/feed")).toThrow("URL privada");
    expect(() => assertSafeHttpUrl("https://example.com/feed")).not.toThrow();
  });

  it("builds Google News queries for person and topic sources", () => {
    const url = buildSourceFetchUrl({
      source_kind: "person",
      query: "Neymar",
      include_terms: ["Santos"],
      exclude_terms: ["fake"],
      country: "BR",
      language: "pt-BR",
    });

    expect(url).toContain("news.google.com/rss/search");
    expect(decodeURIComponent(url)).toContain('"Neymar" Santos -fake');
  });

  it("filters old, excluded and missing-required items", () => {
    const freshDate = new Date().toUTCString();
    const result = filterItemsForSource([
      { title: "Tecnologia brasileira avança em IA", link: "https://example.com/a", description: "startup", pubDate: freshDate },
      { title: "Tecnologia antiga sobre IA", link: "https://example.com/b", description: "startup", pubDate: "Sat, 01 Jan 2000 12:00:00 GMT" },
      { title: "Tecnologia com termo bloqueado", link: "https://example.com/c", description: "fake", pubDate: freshDate },
      { title: "Outro assunto sem termo", link: "https://example.com/d", description: "geral", pubDate: freshDate },
    ], {
      source_kind: "topic",
      niche: "tecnologia",
      include_terms: ["IA"],
      exclude_terms: ["fake"],
    }, "rss", 5);

    expect(result.items).toHaveLength(1);
    expect(result.diagnostics.filtered_old).toBe(1);
    expect(result.diagnostics.filtered_excluded_terms).toBe(1);
    expect(result.diagnostics.filtered_missing_required_terms).toBe(1);
  });

  it("canonicalizes article URLs", () => {
    expect(canonicalizeArticleUrl("https://Example.com/news/story/?utm_source=x&fbclid=abc&id=1#top"))
      .toBe("https://example.com/news/story?id=1");
  });

  it("previews a source without database writes", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      url: "https://example.com/feed",
      headers: new Headers({ "content-type": "application/rss+xml; charset=utf-8" }),
      arrayBuffer: async () => new TextEncoder().encode(`
        <rss><channel>
          <item>
            <title>OpenAI anuncia novidade importante de tecnologia</title>
            <link>https://example.com/noticias/openai</link>
            <description>Notícia sobre tecnologia e inteligência artificial.</description>
            <pubDate>${new Date().toUTCString()}</pubDate>
          </item>
        </channel></rss>
      `).buffer,
    } as Response)));

    const result = await previewSource({
      source_kind: "rss",
      url: "https://example.com/feed",
      niche: "tecnologia",
    });

    expect(result.valid).toBe(true);
    expect(result.sample_items?.[0]?.title).toContain("OpenAI");
  });
});
