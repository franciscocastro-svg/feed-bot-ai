import { describe, expect, it } from "vitest";
import { layoutTemplateTextBlock } from "../../supabase/functions/_shared/template-layouts.js";

const measure = (size: number) => (text: string) => text.length * size * 0.54;

describe("encaixe do texto no template", () => {
  it("reduz a fonte para o título caber antes do subtítulo", () => {
    let current = 74;
    const result = layoutTemplateTextBlock({
      text: "NAMORADA DE NEYMAR APARECE EM CLIMA TENSO NA FESTA DA FAMÍLIA EM SANTOS",
      measure: (t: string) => measure(current)(t),
      setFontSize: (size: number) => { current = size; },
      width: 800,
      maxChars: 19,
      maxLines: 5,
      fontSize: 74,
      lineHeightRatio: 1.05,
      availableHeight: 300,
    });
    expect(result.lines.length * result.lineHeight).toBeLessThanOrEqual(300);
    expect(result.fontSize).toBeLessThanOrEqual(74);
  });

  it("corta com reticências quando nem a fonte mínima cabe", () => {
    let current = 40;
    const result = layoutTemplateTextBlock({
      text: "TEXTO MUITO LONGO QUE NÃO CABE DE JEITO NENHUM NESSA CAIXA APERTADA DA MOLDURA",
      measure: (t: string) => measure(current)(t),
      setFontSize: (size: number) => { current = size; },
      width: 400,
      maxChars: 14,
      maxLines: 6,
      fontSize: 40,
      availableHeight: 90,
    });
    expect(result.lines.length).toBeLessThanOrEqual(3);
    expect(result.lines[result.lines.length - 1].endsWith("…")).toBe(true);
  });

  it("mantém título curto no tamanho original", () => {
    let current = 74;
    const result = layoutTemplateTextBlock({
      text: "FOFOCA QUENTE",
      measure: (t: string) => measure(current)(t),
      setFontSize: (size: number) => { current = size; },
      width: 800,
      maxChars: 19,
      maxLines: 5,
      fontSize: 74,
      availableHeight: 400,
    });
    expect(result.fontSize).toBe(74);
    expect(result.lines).toEqual(["FOFOCA QUENTE"]);
  });
});
