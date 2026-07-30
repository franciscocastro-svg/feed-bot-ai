import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  captionHandles,
  finalizeEditorialCaption,
  sanitizeEditorialCaptionBody,
} from "../../supabase/functions/_shared/caption-integrity";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Legendas 2.0-A — identidade, qualidade e engajamento", () => {
  it("removes crossed and repeated accounts and keeps the publishing account once", () => {
    const contaminated = [
      "Ciro Gomes confirmou uma nova aliança no Ceará. A decisão movimentou o cenário político.",
      "Segue o @dolarizenews para não perder o próximo movimento.",
      'Fechar convidando pra ação: "Salva esse pra não esquecer", "Compartilha", "Comenta" e "Segue o @dolarizenews".',
      "👉 SIGA @dolarizanews para mais notícias do dia.",
      "Fonte: Portal Exemplo",
      "https://example.com/noticia",
    ].join("\n\n");

    const result = finalizeEditorialCaption(contaminated, {
      accountHandle: "@dolarizanews",
      signatureBlocks: ["O dólar não perdoa quem dorme no ponto."],
      hashtagsLine: "#economia #politica #ceara",
    });

    expect(result).toContain("Ciro Gomes confirmou uma nova aliança no Ceará.");
    expect(result).toContain("O dólar não perdoa quem dorme no ponto.");
    expect(result).not.toContain("@dolarizenews");
    expect(result).not.toContain("Portal Exemplo");
    expect(result).not.toContain("https://");
    expect(captionHandles(result)).toEqual(["dolarizanews"]);
    expect(result.match(/@dolarizanews/gi)).toHaveLength(1);
    expect(result.match(/💬/g)).toHaveLength(1);
  });

  it("is idempotent and never multiplies CTA, handle or hashtags at publish time", () => {
    const first = finalizeEditorialCaption(
      "A medida entra em vigor nesta semana e afeta consumidores de todo o país.",
      {
        accountHandle: "dolarizanews",
        hashtagsLine: "#economia #Brasil #economia #mercado",
      },
    );
    const second = finalizeEditorialCaption(first, {
      accountHandle: "dolarizanews",
      hashtagsLine: "#economia #Brasil #mercado",
    });

    expect(second).toBe(first);
    expect(captionHandles(second)).toEqual(["dolarizanews"]);
    expect(second.match(/#economia/gi)).toHaveLength(1);
  });

  it("keeps factual content while hiding public source, image credit and URLs", () => {
    const result = sanitizeEditorialCaptionBody([
      "Segundo o portal Jornal Agora, a votação terminou com 42 votos favoráveis.",
      "A decisão passa a valer em agosto.",
      "Crédito da imagem: Agência Exemplo",
      "Imagem retirada de https://example.com/foto.jpg.",
    ].join("\n\n"));

    expect(result).toContain("a votação terminou com 42 votos favoráveis.");
    expect(result).toContain("A decisão passa a valer em agosto.");
    expect(result).not.toMatch(/Jornal Agora|Agência Exemplo|example\.com/i);
  });

  it("limits hashtags and preserves a single engagement block", () => {
    const result = finalizeEditorialCaption("Notícia com contexto suficiente para o leitor.", {
      accountHandle: "conta.oficial",
      hashtagsLine: "#um #dois #tres #quatro #cinco #seis #sete #oito #nove #dez",
    });
    expect(result.match(/#[\p{L}\p{N}_]+/gu)).toHaveLength(8);
    expect(result.match(/💬/g)).toHaveLength(1);
    expect(result.match(/@conta\.oficial/g)).toHaveLength(1);
  });

  it("deduplicates repeated sentences and a signature already present in the body", () => {
    const result = finalizeEditorialCaption(
      [
        "A medida foi confirmada nesta manhã.",
        "Aprenda, aplique e evolua.",
        "Aprenda, aplique e evolua. 👀",
      ].join("\n\n"),
      {
        accountHandle: "conta.oficial",
        signatureBlocks: ["Aprenda, aplique e evolua."],
        variationSeed: "news-duplicate",
      },
    );

    expect(result.match(/Aprenda, aplique e evolua/gi)).toHaveLength(1);
  });

  it("applies creator CTA guidance with stable per-account variations", () => {
    const results = Array.from({ length: 16 }, (_, index) =>
      finalizeEditorialCaption(
        "A decisão muda o planejamento de pequenos negócios.",
        {
          accountHandle: "negocios.oficial",
          ctaStyle: "Finalize com uma pergunta prática sobre como aplicar a informação.",
          variationSeed: `negocios.oficial:news-${index}`,
        },
      )
    );

    expect(new Set(results).size).toBeGreaterThan(1);
    for (const result of results) {
      expect(captionHandles(result)).toEqual(["negocios.oficial"]);
      expect(result).toMatch(
        /Como você aplicaria essa informação na prática|Qual ação prática|O que você colocaria em prática|Que mudança concreta/i,
      );
    }
  });

  it("remains idempotent with creator signature and CTA preferences", () => {
    const options = {
      accountHandle: "conta.oficial",
      signatureBlocks: ["Informação clara, decisão consciente."],
      ctaStyle: "Pergunte qual dúvida o leitor quer ver respondida.",
      variationSeed: "conta.oficial:news-42",
      hashtagsLine: "#economia #mercado",
    };
    const first = finalizeEditorialCaption(
      "A nova regra entra em vigor na próxima semana.",
      options,
    );
    const second = finalizeEditorialCaption(first, options);

    expect(second).toBe(first);
    expect(second.match(/Informação clara, decisão consciente/gi)).toHaveLength(1);
    expect(captionHandles(second)).toEqual(["conta.oficial"]);
  });

  it("isolates AI cache by account and applies the final guard before publication", () => {
    const processNews = read("supabase/functions/process-news/index.ts");
    const publisher = read("supabase/functions/publish-scheduler/index.ts");

    expect(processNews).toContain("a: String(item?.instagram_account_id || \"\")");
    expect(processNews).toContain("h: normalizeInstagramHandle(item?._caption_account_handle)");
    expect(processNews).toContain("v: 9");
    expect(processNews).toContain("Nao inclua nenhum @handle");
    expect(processNews).toContain("finalizeEditorialCaption");
    expect(publisher).toContain("finalizeEditorialCaption");
    expect(publisher).toContain("buildSafePublishCaption(");
    expect(publisher).toContain("loadEffectiveCreatorProfile");
    expect(publisher).toContain("creatorProfile");
  });
});
