import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  carouselPromptContract,
  normalizeTopicCarousel,
} from "../../supabase/functions/_shared/topic-carousel";
import {
  buildPixabaySearchUrl,
  MIN_STOCK_RELEVANCE_SCORE,
  normalizeStockImageQuery,
  resolveCarouselStockImage,
  scorePixabayHit,
  STOCK_CACHE_VERSION,
} from "../../worker/carouselStockImages.js";
import {
  EDITORIAL_CAROUSEL_HEIGHT,
  EDITORIAL_CAROUSEL_WIDTH,
  normalizeEditorialCarouselSlide,
} from "../../worker/editorialCarousel.js";

const temporaryDirectories: string[] = [];
const editorialRenderer = readFileSync(join(process.cwd(), "worker/editorialCarousel.js"), "utf8");

afterEach(() => {
  while (temporaryDirectories.length) {
    rmSync(temporaryDirectories.pop()!, { recursive: true, force: true });
  }
});

function makeSlides() {
  return Array.from({ length: 6 }, (_, index) => ({
    title: index === 0 ? "Um gancho que prende" : `Ideia concreta ${index}`,
    body: index === 0
      ? "O dado mais importante aparece já na capa."
      : `Este é o conteúdo factual do slide ${index + 1}.`,
    emphasis: index === 1 ? ["conteúdo factual", "trecho inexistente"] : [],
    image_mode: index > 0 && index < 3 ? "stock" : "text",
    image_query: index > 0 && index < 3 ? `business concept ${index}` : null,
    image_queries: index > 0 && index < 3
      ? [`business concept ${index}`, `team meeting whiteboard ${index}`]
      : [],
    image_alt: index > 0 && index < 3 ? "Fotografia editorial genérica" : null,
  }));
}

describe("Carrossel Editorial 2A", () => {
  it("promove a única foto para a capa e força os demais slides a texto", () => {
    const result = normalizeTopicCarousel(makeSlides(), "Título");
    expect(result).toHaveLength(6);
    expect(result.filter((slide) => slide.image_mode === "stock")).toHaveLength(1);
    expect(result[0]).toMatchObject({
      role: "cover",
      image_mode: "stock",
      image_query: "business concept 1",
      image_queries: ["business concept 1", "team meeting whiteboard 1"],
    });
    expect(result.slice(1).every((slide) => slide.image_mode === "text")).toBe(true);
    expect(result[1].emphasis).toEqual(["conteúdo factual"]);
    expect(result.at(-1)).toMatchObject({
      role: "cta",
      image_mode: "text",
      image_query: null,
      image_alt: null,
    });

    const withoutSafeVisualQuery = normalizeTopicCarousel(
      makeSlides().map(({ title, body }) => ({ title, body })),
      "Título",
    );
    expect(withoutSafeVisualQuery[0]).toMatchObject({
      image_mode: "text",
      image_query: null,
      image_queries: [],
    });
    expect(withoutSafeVisualQuery.every((slide) => slide.image_mode === "text")).toBe(true);
  });

  it("instrui a IA a criar consultas concretas usando pauta e Perfil de Criador", () => {
    const contract = carouselPromptContract();
    expect(contract).toContain('image_mode":"text ou stock');
    expect(contract).toContain('"image_queries"');
    expect(contract).toContain("24 a 38 palavras por slide");
    expect(contract).toContain("tema, a pauta, o título, o nicho, o público e o Perfil de Criador");
    expect(contract).toContain("3 a 6 palavras concretas em inglês");
    expect(contract).toContain("notebook, café, mesa ou escritório");
    expect(contract).toContain('image_mode="text", image_query=null');
    expect(contract).toContain("informação mais impactante");
    expect(contract).toContain("Nunca peça pessoa pública, marca, logotipo");
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
    expect(normalizeEditorialCarouselSlide(
      { title: "Capa", body: "Impacto", image_mode: "text" },
      0,
      6,
    )).toMatchObject({ role: "cover", image_mode: "text" });
    expect(normalizeEditorialCarouselSlide(
      {
        title: "Capa",
        body: "Impacto",
        image_mode: "stock",
        image_query: "praying hands open bible",
      },
      0,
      6,
    )).toMatchObject({ role: "cover", image_mode: "stock" });
  });

  it("limita o texto e só preserva destaques que existem no conteúdo", () => {
    const normalized = normalizeEditorialCarouselSlide({
      title: "Uma frase editorial curta com um destaque importante para o leitor e texto excedente",
      body: "Este é um corpo curto com dado essencial. A segunda frase fecha a ideia sem criar uma parede de texto.".repeat(3),
      emphasis: ["dado essencial", "trecho inventado"],
      image_mode: "text",
    }, 1, 6);

    expect(normalized.title.length).toBeLessThanOrEqual(72);
    expect(normalized.body.length).toBeLessThanOrEqual(190);
    expect(normalized.emphasis).toEqual(["dado essencial"]);
  });

  it("centraliza verticalmente o conjunto editorial nos slides sem imagem", () => {
    expect(editorialRenderer).toContain("const headerCenterY = hasImage ? 238 : 360");
    expect(editorialRenderer).toContain('slide.role === "cta" ? 560 : 540');
  });

  it("monta uma busca Pixabay segura sem colocar a chave nos metadados", async () => {
    expect(normalizeStockImageQuery("  finance   growth!  ")).toBe("finance growth");
    expect(normalizeStockImageQuery("https://example.com/photo")).toBeNull();
    const requestUrl = buildPixabaySearchUrl("finance growth", "secret-key");
    expect(requestUrl.origin).toBe("https://pixabay.com");
    expect(requestUrl.searchParams.get("orientation")).toBe("vertical");
    expect(requestUrl.searchParams.get("safesearch")).toBe("true");
    expect(requestUrl.searchParams.get("per_page")).toBe("30");

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
        tags: "finance, growth, chart",
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
      cache_version: STOCK_CACHE_VERSION,
      matched_terms: ["finance"],
    });
    expect(result?.audit.relevance_score).toBeGreaterThanOrEqual(MIN_STOCK_RELEVANCE_SCORE);
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
        tags: "team, collaboration, meeting",
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
    expect(readFileSync(cacheFile, "utf8")).toContain(`pixabay:${STOCK_CACHE_VERSION}:team collaboration`);

    await expect(resolveCarouselStockImage({
      query: "team collaboration",
      apiKey: "",
      fetchImpl: vi.fn(),
    })).resolves.toBeNull();
  });

  it("pontua todos os resultados e rejeita a foto popular genérica sem relação", async () => {
    const generic = {
      id: 1,
      imageWidth: 2400,
      imageHeight: 3200,
      largeImageURL: "https://cdn.example.test/coffee.jpg",
      pageURL: "https://pixabay.com/photos/laptop-coffee-office-1/",
      tags: "laptop, coffee, office, desk",
      user: "generic",
    };
    const thematic = {
      id: 2,
      imageWidth: 2400,
      imageHeight: 3200,
      largeImageURL: "https://cdn.example.test/prayer.jpg",
      pageURL: "https://pixabay.com/photos/prayer-bible-sunrise-2/",
      tags: "prayer, hands, bible, sunrise",
      user: "thematic",
    };
    expect(scorePixabayHit(generic, "praying hands open bible").score)
      .toBe(Number.NEGATIVE_INFINITY);
    expect(scorePixabayHit(thematic, "praying hands open bible").score)
      .toBeGreaterThanOrEqual(MIN_STOCK_RELEVANCE_SCORE);

    const cacheDir = mkdtempSync(join(tmpdir(), "carousel-stock-ranking-test-"));
    temporaryDirectories.push(cacheDir);
    const result = await resolveCarouselStockImage({
      query: "praying hands open bible",
      queries: ["open bible morning sunrise"],
      apiKey: "key",
      cacheFile: join(cacheDir, "cache.json"),
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({
        hits: [generic, thematic],
      }), { status: 200 })),
    });
    expect(result?.audit.asset_id).toBe(2);
    expect(result?.audit.matched_terms).toEqual(expect.arrayContaining(["hands", "bible"]));
  });

  it("usa capa tipográfica quando nenhuma busca alternativa tem correspondência segura", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "carousel-stock-negative-cache-test-"));
    temporaryDirectories.push(cacheDir);
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      hits: [{
        id: 3,
        imageWidth: 2400,
        imageHeight: 3200,
        largeImageURL: "https://cdn.example.test/generic.jpg",
        pageURL: "https://pixabay.com/photos/office-laptop-coffee-3/",
        tags: "office, laptop, coffee, desk",
        user: "generic",
      }],
    }), { status: 200 }));
    const options = {
      query: "praying hands open bible",
      queries: ["open bible morning sunrise"],
      apiKey: "key",
      cacheFile: join(cacheDir, "cache.json"),
      fetchImpl,
      now: 2_000_000,
    };
    await expect(resolveCarouselStockImage(options)).resolves.toBeNull();
    await expect(resolveCarouselStockImage({
      ...options,
      now: 2_000_500,
    })).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("integra o renderer sem alterar a legenda pública", () => {
    const worker = readFileSync(join(process.cwd(), "worker/index.js"), "utf8");
    expect(worker).toContain("resolveCarouselStockImage");
    expect(worker).toContain("drawEditorialCarouselSlide");
    expect(worker).toContain("EDITORIAL_CAROUSEL_HEIGHT");
    expect(worker).toContain("carousel_slides: resolvedSlides");
    expect(worker).toContain('path.join(__dirname, "assets", "verified-badge.png")');
    expect(worker).toContain("verifiedBadge");
    const verifiedBadgePath = join(process.cwd(), "worker/assets/verified-badge.png");
    expect(existsSync(verifiedBadgePath)).toBe(true);
    expect(statSync(verifiedBadgePath).size).toBeGreaterThan(1_000);
    expect(worker).not.toContain("caption: resolvedSlides");
    expect(worker).toContain("const maxStockImages = 1");
    expect(worker).toContain("nenhuma imagem temática segura foi encontrada; usando capa tipográfica");
    expect(worker).not.toContain("A capa do carrossel precisa de uma imagem relevante");
    expect(worker).toContain("const WORKER_POLL_INTERVAL_MS = 5_000");
    expect(worker).toContain("setTimeout(resolve, WORKER_POLL_INTERVAL_MS)");
  });
});
