import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertSafeHttpUrl,
  buildSearchQueryVariants,
  buildSourceFetchUrl,
  canonicalizeArticleUrl,
  filterItemsForSource,
  fetchTextSmart,
  parseAtomItems,
  parseHtmlListing,
  pickLeastLoadedInstagram,
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

  it("rejects redirects from a public source to a private destination", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: "http://127.0.0.1/internal" },
    })));

    await expect(fetchTextSmart("https://example.com/feed"))
      .rejects.toThrow("URL privada");
  });

  it("rejects oversized source responses before parsing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("small", {
      status: 200,
      headers: {
        "content-type": "text/xml",
        "content-length": String(6 * 1024 * 1024),
      },
    })));

    await expect(fetchTextSmart("https://example.com/feed"))
      .rejects.toThrow("limite de tamanho");
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

  it("builds broader query variants for topic sources", () => {
    const variants = buildSearchQueryVariants({
      source_kind: "topic",
      query: "Fofoca",
      include_terms: ["Famosos"],
      exclude_terms: ["BBB"],
      country: "BR",
      language: "pt-BR",
    });

    expect(variants[0]).toContain("Fofoca");
    expect(variants.some((query) => query.includes("famosos celebridades"))).toBe(true);
    expect(variants.every((query) => query.includes("-BBB"))).toBe(true);
  });

  it("filters old, excluded and missing-required items for strict RSS sources", () => {
    const freshDate = new Date().toUTCString();
    const result = filterItemsForSource([
      { title: "Tecnologia brasileira avança em IA", link: "https://example.com/a", description: "startup", pubDate: freshDate },
      { title: "Tecnologia antiga sobre IA", link: "https://example.com/b", description: "startup", pubDate: "Sat, 01 Jan 2000 12:00:00 GMT" },
      { title: "Tecnologia com termo bloqueado", link: "https://example.com/c", description: "fake", pubDate: freshDate },
      { title: "Outro assunto sem termo", link: "https://example.com/d", description: "geral", pubDate: freshDate },
    ], {
      source_kind: "rss",
      niche: "tecnologia",
      include_terms: ["IA"],
      exclude_terms: ["fake"],
    }, "rss", 5);

    expect(result.items).toHaveLength(1);
    expect(result.diagnostics.filtered_old).toBe(1);
    expect(result.diagnostics.filtered_excluded_terms).toBe(1);
    expect(result.diagnostics.filtered_missing_required_terms).toBe(1);
  });

  it("keeps topic search results for a wider window and treats include terms as focus", () => {
    const threeDaysAgo = new Date(Date.now() - 72 * 3600000).toUTCString();
    const result = filterItemsForSource([
      {
        title: "Celebridade anuncia novidade e movimenta as redes",
        link: "https://example.com/celebridade",
        description: "Influencer viralizou com a novidade.",
        pubDate: threeDaysAgo,
      },
    ], {
      source_kind: "topic",
      query: "Fofoca",
      niche: "Tema: Fofoca",
      include_terms: ["Famosos"],
    }, "rss", 5);

    expect(result.items).toHaveLength(1);
    expect(result.diagnostics.items_after_freshness).toBe(1);
    expect(result.diagnostics.filtered_missing_required_terms).toBe(0);
  });

  it("canonicalizes article URLs", () => {
    expect(canonicalizeArticleUrl("https://Example.com/news/story/?utm_source=x&fbclid=abc&id=1#top"))
      .toBe("https://example.com/news/story?id=1");
  });

  it("prioritizes the Instagram account with the smallest active queue", () => {
    const firstPick = pickLeastLoadedInstagram(["ig-a", "ig-b", "ig-c"], {
      "ig-a": 4,
      "ig-b": 0,
      "ig-c": 2,
    });

    expect(firstPick).toBe("ig-b");
    expect(pickLeastLoadedInstagram([], {})).toBeNull();
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

  it("previews topic searches with broad examples when strict freshness rejects all items", async () => {
    const oldDate = new Date(Date.now() - 20 * 24 * 3600000).toUTCString();
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      url: "https://news.google.com/rss/search",
      headers: new Headers({ "content-type": "application/rss+xml; charset=utf-8" }),
      arrayBuffer: async () => new TextEncoder().encode(`
        <rss><channel>
          <item>
            <title>Celebridade anuncia romance e movimenta famosos</title>
            <link>https://example.com/famosos/romance</link>
            <description>Influencer virou assunto entre famosos.</description>
            <pubDate>${oldDate}</pubDate>
          </item>
        </channel></rss>
      `).buffer,
    } as Response)));

    const result = await previewSource({
      source_kind: "topic",
      query: "Fofoca",
      niche: "Tema: Fofoca",
      include_terms: ["Famosos"],
      country: "BR",
      language: "pt-BR",
    });

    expect(result.valid).toBe(true);
    expect(result.diagnostics.relaxed_preview).toBe(true);
    expect(result.sample_items?.[0]?.title).toContain("Celebridade");
  });

  it("previews a discovered feed candidate when the site page has no items", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://example.com/") {
        return {
          ok: true,
          url,
          headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
          arrayBuffer: async () => new TextEncoder().encode(`
            <html>
              <head>
                <link rel="alternate" type="application/rss+xml" href="/feed/" />
              </head>
              <body><main>Bem-vindo</main></body>
            </html>
          `).buffer,
        } as Response;
      }

      return {
        ok: true,
        url: "https://example.com/feed/",
        headers: new Headers({ "content-type": "application/rss+xml; charset=utf-8" }),
        arrayBuffer: async () => new TextEncoder().encode(`
          <rss><channel>
            <item>
              <title>Notícia recente encontrada no feed real</title>
              <link>https://example.com/noticias/feed-real</link>
              <description>Conteúdo de notícias encontrado no RSS.</description>
              <pubDate>${new Date().toUTCString()}</pubDate>
            </item>
          </channel></rss>
        `).buffer,
      } as Response;
    }));

    const result = await previewSource({
      source_kind: "rss",
      url: "https://example.com/",
      niche: "notícias",
    });

    expect(result.valid).toBe(true);
    expect(result.url).toBe("https://example.com/feed/");
    expect(result.sample_items?.[0]?.title).toContain("feed real");
  });

  it("falls back to Google News domain search when a site has no usable items", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://example.com/") {
        return {
          ok: true,
          url,
          headers: new Headers({ "content-type": "text/html; charset=utf-8" }),
          arrayBuffer: async () => new TextEncoder().encode("<html><body>Home sem listagem</body></html>").buffer,
        } as Response;
      }

      if (url.startsWith("https://example.com/")) {
        return {
          ok: true,
          url,
          headers: new Headers({ "content-type": "application/rss+xml; charset=utf-8" }),
          arrayBuffer: async () => new TextEncoder().encode("<rss><channel></channel></rss>").buffer,
        } as Response;
      }

      return {
        ok: true,
        url,
        headers: new Headers({ "content-type": "application/rss+xml; charset=utf-8" }),
        arrayBuffer: async () => new TextEncoder().encode(`
          <rss><channel>
            <item>
              <title>Example lança notícia importante de tecnologia</title>
              <link>https://example.com/noticias/tech</link>
              <description>Notícia de tecnologia publicada hoje.</description>
              <pubDate>${new Date().toUTCString()}</pubDate>
            </item>
          </channel></rss>
        `).buffer,
      } as Response;
    }));

    const result = await previewSource({
      source_kind: "rss",
      name: "Example",
      url: "https://example.com/",
      niche: "tecnologia",
      country: "BR",
      language: "pt-BR",
    });

    expect(result.valid).toBe(true);
    expect(result.url).toContain("news.google.com/rss/search");
    expect(result.diagnostics.resolved_via).toBe("domain_search");
    expect(result.diagnostics.resolved_query).toContain("site:example.com");
  });
});
