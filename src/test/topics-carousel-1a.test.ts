import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeTopicCarousel } from "../../supabase/functions/_shared/topic-carousel";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/20260717153000_topics_carousel_1a.sql");
const generateTopic = read("supabase/functions/generate-from-topic/index.ts");
const generatePrompt = read("supabase/functions/generate-from-prompt/index.ts");
const worker = read("worker/index.js");
const publisher = read("supabase/functions/publish-scheduler/index.ts");
const autopilot = read("supabase/functions/autopilot/index.ts");
const news = read("src/pages/dashboard/News.tsx");

const slides = Array.from({ length: 6 }, (_, index) => ({
  title: index === 0 ? "Gancho principal" : `Ideia ${index}`,
  body: index === 0 ? "" : `Explicação concreta do slide ${index + 1}`,
}));

describe("Pautas 1A — geração completa de carrosséis", () => {
  it("normaliza capa, desenvolvimento e CTA em uma sequência ordenada", () => {
    const result = normalizeTopicCarousel(slides, "Título", "Comente sua dúvida");
    expect(result).toHaveLength(6);
    expect(result[0]).toMatchObject({ position: 1, role: "cover" });
    expect(result.at(-1)).toMatchObject({ position: 6, role: "cta" });
    expect(result.at(-1)?.body).toBe("Explicação concreta do slide 6");
  });

  it("rejeita respostas incompletas antes de criar conteúdo quebrado", () => {
    expect(() => normalizeTopicCarousel(slides.slice(0, 4), "Título")).toThrow("entre 5 e 7 slides");
    expect(() => normalizeTopicCarousel([...slides.slice(0, 2), { title: "", body: "texto" }, ...slides.slice(3)], "Título"))
      .toThrow("sem título");
  });

  it("persiste o contrato e só considera pronto depois de todas as imagens", () => {
    expect(migration).toContain("carousel_slides jsonb");
    expect(migration).toContain("carousel_media_urls text[]");
    expect(migration).toContain("jsonb_array_length(carousel_slides) BETWEEN 5 AND 7");
    for (const source of [generateTopic, generatePrompt]) {
      expect(source).toContain("normalizeTopicCarousel");
      expect(source).toContain("carousel_media_urls: null");
      expect(source).toContain('editorial_ready: format !== "carrossel"');
    }
    expect(worker).toContain("composeAndUploadCarouselNode");
    expect(worker).toContain("carousel_media_urls: urls");
    expect(worker).toContain("urls.length !== slides.length");
    expect(worker).toContain("allowMissingPhoto: true");
    expect(worker).toContain("opts.allowMissingPhoto && !item.original_image_url");
  });

  it("publica um carrossel nativo e nunca reduz silenciosamente para uma imagem", () => {
    expect(publisher).toContain("publishCarouselToInstagram");
    expect(publisher).toContain('media_type: "CAROUSEL"');
    expect(publisher).toContain("is_carousel_item: true");
    expect(publisher).toContain("isCarouselContent ? (isCarousel ? carouselUrls[0] : null)");
  });

  it("força Feed no automático e oferece prévia textual ou visual no painel", () => {
    expect(autopilot).toContain('channel.channel === "feed" && channel.active');
    expect(news).toContain("Carrosséis só podem ser agendados no Feed");
    expect(news).toContain("previewing.carousel_media_urls.map");
    expect(news).toContain("previewing.carousel_slides.map");
    expect(news).toContain("carrossel nativo de");
  });
});
