import { describe, expect, it } from "vitest";
import {
  compareEditorialNews,
  editorialNewsScore,
  resolveGlobalPostInterval,
  shouldPrepareNextPost,
} from "../../supabase/functions/_shared/editorial-policy";

const NOW = new Date("2026-07-13T20:00:00-03:00").getTime();

describe("editorial policy", () => {
  it("aplica somente o piso de 10 minutos ao intervalo global", () => {
    expect(resolveGlobalPostInterval(1)).toBe(10);
    expect(resolveGlobalPostInterval(10)).toBe(10);
    expect(resolveGlobalPostInterval(18)).toBe(18);
    expect(resolveGlobalPostInterval(45)).toBe(45);
    expect(resolveGlobalPostInterval("120")).toBe(120);
  });

  it("faz a recência dominar conteúdo muito antigo", () => {
    const fresh = {
      id: "fresh",
      published_at: "2026-07-13T19:55:00-03:00",
      original_title: "Nova informação confirmada movimenta o noticiário nacional",
      original_content: "Informação completa com contexto jornalístico suficiente para publicação.",
      original_image_url: "https://example.com/fresh.jpg",
    };
    const oldViral = {
      id: "old",
      published_at: "2026-07-13T17:00:00-03:00",
      original_title: "Urgente exclusivo chocante viral revela novo escândalo histórico",
      original_content: "Conteúdo antigo com várias palavras de impacto e imagem.",
      original_image_url: "https://example.com/old.jpg",
    };

    expect(editorialNewsScore(fresh, NOW)).toBeGreaterThan(editorialNewsScore(oldViral, NOW));
    expect([oldViral, fresh].sort((a, b) => compareEditorialNews(a, b, NOW))[0].id).toBe("fresh");
  });

  it("permite que uma notícia urgente recente vença uma notícia comum", () => {
    const common = {
      id: "common",
      published_at: "2026-07-13T19:55:00-03:00",
      original_title: "Atualização comum sobre um assunto acompanhado durante o dia",
      original_content: "Texto informativo com imagem e contexto.",
      original_image_url: "https://example.com/common.jpg",
    };
    const urgent = {
      id: "urgent",
      published_at: "2026-07-13T19:45:00-03:00",
      original_title: "Urgente: fonte confirma nova informação exclusiva sobre o caso",
      original_content: "Texto informativo com imagem e contexto.",
      original_image_url: "https://example.com/urgent.jpg",
    };

    expect([common, urgent].sort((a, b) => compareEditorialNews(a, b, NOW))[0].id).toBe("urgent");
  });

  it("prepara conteúdo apenas perto da próxima vaga quando o intervalo é longo", () => {
    const lastPosted = new Date("2026-07-13T18:00:00-03:00").getTime();
    expect(shouldPrepareNextPost(lastPosted, 120, new Date("2026-07-13T19:39:59-03:00").getTime())).toBe(false);
    expect(shouldPrepareNextPost(lastPosted, 120, new Date("2026-07-13T19:40:00-03:00").getTime())).toBe(true);
  });

  it("começa imediatamente quando o intervalo cabe na janela de preparação", () => {
    const lastPosted = new Date("2026-07-13T19:42:00-03:00").getTime();
    expect(shouldPrepareNextPost(lastPosted, 18, NOW)).toBe(true);
  });
});
