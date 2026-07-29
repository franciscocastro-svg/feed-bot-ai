import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  normalizeCarouselSlideCount,
  normalizeNewsFormatPreference,
} from "../../supabase/functions/_shared/creator-profile";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const processNews = read("supabase/functions/process-news/index.ts");
const newsUi = read("src/pages/dashboard/News.tsx");
const profileUi = read("src/pages/dashboard/CreatorProfile.tsx");
const migration = read("supabase/migrations/20260728193000_news_to_carousel_preferences.sql");
const worker = read("worker/index.js");

describe("Notícias em carrossel por Perfil do Criador", () => {
  it("mantém clientes atuais em post único e restringe as novas preferências", () => {
    expect(normalizeNewsFormatPreference(undefined)).toBe("single");
    expect(normalizeNewsFormatPreference("carousel")).toBe("carousel");
    expect(normalizeNewsFormatPreference("automatic")).toBe("automatic");
    expect(normalizeNewsFormatPreference("valor-inválido")).toBe("single");
    expect(normalizeCarouselSlideCount(5)).toBe(5);
    expect(normalizeCarouselSlideCount("7")).toBe(7);
    expect(normalizeCarouselSlideCount(12)).toBe(6);
  });

  it("salva formato e quantidade por Instagram com validação no banco", () => {
    expect(migration).toContain("news_format_preference text NOT NULL DEFAULT 'single'");
    expect(migration).toContain("CHECK (news_format_preference IN ('single', 'carousel', 'automatic'))");
    expect(migration).toContain("CHECK (carousel_slide_count BETWEEN 5 AND 7)");
    expect(migration).toContain("save_creator_profile_with_news_preferences");
    expect(migration).toContain("WHERE id = _account_id");
    expect(migration).toContain("AND user_id = owner_id");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("REVOKE ALL ON FUNCTION");
    expect(profileUi).toContain("Sempre transformar em carrossel");
    expect(profileUi).toContain("Automático conforme a matéria");
    expect(profileUi).toContain("A capa sempre traz imagem e o fato principal");
  });

  it("permite conversão manual com claim atômico e restaura a notícia se falhar", () => {
    expect(newsUi).toContain("Transformar em carrossel");
    expect(newsUi).toContain("convert_to_carousel: true");
    expect(newsUi).toContain('["feed", "carrossel", "story", "reel"]');
    expect(processNews).toContain("convert_to_carousel = false");
    expect(processNews).toContain('? claimQuery.eq("status", "processed")');
    expect(processNews).toContain("normalizeNewsCarouselSlides");
    expect(processNews).toContain("numericClaimsAreSupported");
    expect(processNews).toContain("Não foi possível transformar em carrossel");
    expect(processNews).toContain('status: "processed"');
  });

  it("usa a imagem original da notícia na capa antes do banco de imagens", () => {
    const originalImageCheck = worker.indexOf(
      'slide.role === "cover" && item.content_type !== "topic" && item.original_image_url',
    );
    const stockLookup = worker.indexOf(
      'if (!image && slide.image_mode === "stock" && resolvedStockImages < maxStockImages)',
      originalImageCheck,
    );
    expect(originalImageCheck).toBeGreaterThan(-1);
    expect(stockLookup).toBeGreaterThan(originalImageCheck);
    expect(worker).toContain("image_asset: stockImage?.audit || null");
    expect(worker).toContain("A capa do carrossel precisa de uma imagem relevante");
  });
});
