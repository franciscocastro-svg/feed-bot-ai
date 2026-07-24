import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  carouselPromptContract,
  normalizeTopicCarousel,
} from "../../supabase/functions/_shared/topic-carousel";
import {
  buildPixabaySearchUrl,
  normalizeStockImageQuery,
  resolveCarouselStockImage,
} from "../../worker/carouselStockImages.js";
import {
  EDITORIAL_CAROUSEL_HEIGHT,
  EDITORIAL_CAROUSEL_WIDTH,
  normalizeEditorialCarouselSlide,
} from "../../worker/editorialCarousel.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  while (temporaryDirectories.length) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

function makeSlides() {
  return Array.from({ length: 6 }, (_, index) => ({
    title: index === 0 ? "Um gancho que prende" : `Ideia concreta ${index}`,
    body: index === 0 ? "" : `Este é o conteúdo factual do slide ${index + 1}.`,
    emphasis: index === 1 ? ["conteúdo factual", "trecho inexistente"] : [],
    image_mode: index < 3 ? "stock" : "text",
    image_query: index < 3 ? `business concept ${index}` : null,
    image_alt: index < 3 ? "Fotografia editorial genérica" : null,
  }));
}

describe("Carrossel Editorial 2A", () => {
  it("mantém compatibilidade, limita fotos reais e força CTA textual", () => {
    const result = normalizeTopicCarousel(makeSlides(), "Título");
    expect(result).toHaveLength(6);
    expect(result.filter((slide) => slide.image_mode === "stock")).toHaveLength(2);
    expect(result[1].emphasis).toEqual(["conteúdo factual"]);
    expect(result.at(-1)).toMatchObject({
      role: "cta",
      image_mode: "text",
      image_query: null,
      image_alt: null,
    });

    const legacy = normalizeTopicCarousel(
      makeSlides().map(({ title, body }) => ({ title, body })),
      "Título",
    );
    expect(legacy.every((slide) => slide.image_mode === "text")).toBe(true);
  });

  it("instrui a IA a pedir apenas imagens genéricas e nunca expor fonte na legenda", () => {
    const contract = carouselPromptContract();
    expect(contract).toContain('image_mode":"text ou stock');
    expect(contract).toContain("no máximo 2 slides");
    expect(contract).toContain("nunca peça pessoa pública, marca, logotipo");
    expect(contract).toContain("Não escreva fonte, URL, crédito");
  });

  it("produz 1080x1350 e impede imagem no CTA", () => {
    expect(EDITORIAL_CAROUSEL_WIDTH).toBe(1080);
    expect(EDITORIAL_CAROUSEL_HEIGHT).toBe(1350);
    expect(normalizeEditorialCarouselSlide(
      { title: "Fechamento", body: "Comente", image_mode: "stock" },
      5,
      6,
    )).toMatchObject({ role: "cta", image_mode: "text" });
  });

  it("monta uma busca Pixabay segura sem colocar a chave nos metadados", async () => {
    expect(normalizeStockImageQuery("  finance   growth!  ")).toBe("finance growth");
    expect(normalizeStockImageQuery("https://example.com/photo")).toBeNull();
    const requestUrl = buildPixabaySearchUrl("finance growth", "secret-key");
    expect(requestUrl.origin).toBe("https://pixabay.com");
    expect(requestUrl.searchParams.get("orientation")).toBe("vertical");
    expect(requestUrl.searchParams.get("safesearch")).toBe("true");

    const cacheDir = mkdtempSync(join(tmpdir(), "carousel-stock-test-"));
    temporaryDirectories.push(cacheDir);
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      hits: [{
        id: 42,
        imageWidth: 2400,
        imageHeight: 3200,
        largeImageURL: "https://cdn.example.test/asset.jpg",
        pageURL: "https://pixabay.com/photos/example-42/",
        user: "photographer",
      }],
    }), { status: 200 }));
    const result = await resolveCarouselStockImage({
      query: "finance growth",
      apiKey: "secret-key",
      cacheFile: join(cacheDir, "cache.json"),
      fetchImpl,
      now: Date.parse("2026-07-24T12:00:00Z"),
    });

    expect(result?.downloadUrl).toBe("https://cdn.example.test/asset.jpg");
    expect(result?.audit).toMatchObject({
      provider: "pixabay",
      asset_id: 42,
      contributor: "photographer",
      query: "finance growth",
    });
    expect(JSON.stringify(result?.audit)).not.toContain("secret-key");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("usa cache por 24h e faz fallback textual sem chave ou sem resultado", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "carousel-stock-cache-test-"));
    temporaryDirectories.push(cacheDir);
    const cacheFile = join(cacheDir, "cache.json");
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      hits: [{
        id: 77,
        imageWidth: 2000,
        imageHeight: 2200,
        largeImageURL: "https://cdn.example.test/cached.jpg",
        pageURL: "https://pixabay.com/photos/cached-77/",
        user: "author",
      }],
    }), { status: 200 }));
    const first = await resolveCarouselStockImage({
      query: "team collaboration",
      apiKey: "key",
      cacheFile,
      fetchImpl,
      now: 1_000_000,
    });
    const second = await resolveCarouselStockImage({
      query: "team collaboration",
      apiKey: "key",
      cacheFile,
      fetchImpl,
      now: 1_000_500,
    });
    expect(second).toEqual(first);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(readFileSync(cacheFile, "utf8")).not.toContain('"key"');

    await expect(resolveCarouselStockImage({
      query: "team collaboration",
      apiKey: "",
      fetchImpl: vi.fn(),
    })).resolves.toBeNull();
  });

  it("integra o renderer sem alterar a legenda pública", () => {
    const worker = readFileSync(join(process.cwd(), "worker/index.js"), "utf8");
    expect(worker).toContain("resolveCarouselStockImage");
    expect(worker).toContain("drawEditorialCarouselSlide");
    expect(worker).toContain("EDITORIAL_CAROUSEL_HEIGHT");
    expect(worker).toContain("carousel_slides: resolvedSlides");
    expect(worker).not.toContain("caption: resolvedSlides");
  });
});
