import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildBingImageSearchUrl,
  buildGoogleImageSearchUrl,
  normalizeBingHits,
  normalizeGoogleHits,
  normalizeOpenverseHits,
  resolveCarouselStockImage,
  resolveProviderChain,
} from "../../worker/carouselStockImages.js";

function cacheFile() {
  return path.join(mkdtempSync(path.join(tmpdir(), "stock-cache-")), "cache.json");
}

describe("provedores de imagem da web", () => {
  it("resolve a cadeia de provedores ignorando valores inválidos", () => {
    expect(resolveProviderChain("pixabay, google , nope,bing")).toEqual(["pixabay", "google", "bing"]);
    expect(resolveProviderChain("")).toEqual(["pixabay", "openverse"]);
  });

  it("aplica filtro de licença nas URLs de busca", () => {
    const google = buildGoogleImageSearchUrl("praia de fortaleza", "key", "cx", "cc_publicdomain");
    expect(google.searchParams.get("searchType")).toBe("image");
    expect(google.searchParams.get("rights")).toBe("cc_publicdomain");
    expect(google.searchParams.get("safe")).toBe("active");

    const bing = buildBingImageSearchUrl("praia de fortaleza", "ShareCommercially");
    expect(bing.searchParams.get("license")).toBe("ShareCommercially");
    expect(bing.searchParams.get("safeSearch")).toBe("Strict");
  });

  it("normaliza resultados de Openverse, Google e Bing", () => {
    expect(normalizeOpenverseHits({ results: [{ id: "abc", title: "sushi plate", url: "https://cdn/x.jpg", foreign_landing_url: "https://page", width: 1200, height: 1400, creator: "Ana", license: "by", license_version: "4.0" }] })[0])
      .toMatchObject({ pageURL: "https://page", largeImageURL: "https://cdn/x.jpg", user: "Ana" });
    expect(normalizeGoogleHits({ items: [{ link: "https://cdn/y.jpg", title: "sushi", image: { contextLink: "https://site", width: 1000, height: 1200 } }] })[0])
      .toMatchObject({ pageURL: "https://site", imageHeight: 1200 });
    expect(normalizeBingHits({ value: [{ contentUrl: "https://cdn/z.jpg", hostPageUrl: "https://host", name: "sushi", width: 900, height: 1100 }] })[0])
      .toMatchObject({ pageURL: "https://host", imageWidth: 900 });
  });

  it("cai para o próximo provedor quando o Pixabay não tem resultado relevante", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: URL) => {
      const href = String(url);
      calls.push(href);
      if (href.includes("pixabay.com")) {
        return { ok: true, json: async () => ({ hits: [] }) };
      }
      return {
        ok: true,
        json: async () => ({
          items: [{
            link: "https://cdn.example/sushi.jpg",
            title: "sushi kaiten restaurante",
            image: { contextLink: "https://blog.example/sushi", width: 1200, height: 1500 },
          }],
        }),
      };
    }) as unknown as typeof fetch;

    const result = await resolveCarouselStockImage({
      query: "sushi kaiten",
      providers: "pixabay,google",
      apiKey: "pixabay-key",
      googleApiKey: "google-key",
      googleCx: "cx",
      googleRights: "",
      cacheFile: cacheFile(),
      fetchImpl,
    });

    expect(calls.some((href) => href.includes("pixabay.com"))).toBe(true);
    expect(result?.audit.provider).toBe("google");
    expect(result?.downloadUrl).toBe("https://cdn.example/sushi.jpg");
    expect(result?.audit.page_url).toBe("https://blog.example/sushi");
  });

  it("ignora provedores sem credencial configurada", async () => {
    const fetchImpl = (async () => ({ ok: true, json: async () => ({ hits: [] }) })) as unknown as typeof fetch;
    const result = await resolveCarouselStockImage({
      query: "sushi kaiten",
      providers: "google",
      googleApiKey: "",
      googleCx: "",
      cacheFile: cacheFile(),
      fetchImpl,
    });
    expect(result).toBeNull();
  });
});
