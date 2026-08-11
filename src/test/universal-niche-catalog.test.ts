import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const nicheSource = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/niche-discovery.ts"),
  "utf8",
);
const discoverSource = readFileSync(
  resolve(process.cwd(), "supabase/functions/discover-rss/index.ts"),
  "utf8",
);
const captureSource = readFileSync(
  resolve(process.cwd(), "supabase/functions/_shared/source-capture.ts"),
  "utf8",
);

const ORIGINAL_PROFILE_KEYS = [
  "tecnologia", "economia", "forex", "cripto", "esportes", "politica",
  "mundo", "saude", "fitness", "entretenimento", "direito", "beleza",
];

const ORIGINAL_FEED_KEYS = [
  "tecnologia", "economia", "cripto", "esportes", "politica", "mundo",
  "saude", "entretenimento",
];

const NEW_PROFILE_KEYS = [
  "viagem", "gastronomia", "pets", "moda", "automoveis", "games", "cinema",
  "musica", "educacao", "carreira", "imoveis", "agro", "ciencia",
  "meio-ambiente", "empreendedorismo", "marketing", "religiao", "maternidade",
  "decoracao", "odontologia", "psicologia", "seguros", "construcao", "energia",
  "varejo", "logistica", "seguranca-publica", "cultura-pop",
];

function profileKeys(): string[] {
  return [...nicheSource.matchAll(/\{\s*key:\s*"([^"]+)",\s*label:/g)].map((m) => m[1]);
}

describe("catálogo universal de temas", () => {
  it("mantém os perfis originais intactos e sem duplicidade", () => {
    const keys = profileKeys();
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of ORIGINAL_PROFILE_KEYS) {
      expect(keys).toContain(key);
    }
    // Os 12 perfis originais continuam sendo os primeiros da lista, na ordem.
    expect(keys.slice(0, ORIGINAL_PROFILE_KEYS.length)).toEqual(ORIGINAL_PROFILE_KEYS);
  });

  it("adiciona os novos temas", () => {
    const keys = profileKeys();
    for (const key of NEW_PROFILE_KEYS) {
      expect(keys).toContain(key);
    }
  });

  it("mantém os feeds curados originais", () => {
    for (const key of ORIGINAL_FEED_KEYS) {
      expect(discoverSource).toContain(`      ${key}: [`);
    }
    expect(discoverSource).toContain("https://g1.globo.com/rss/g1/tecnologia/");
    expect(discoverSource).toContain("https://rss.uol.com.br/feed/esporte.xml");
  });

  it("todo tema novo tem catálogo curado de feeds ou cai em monitoramento por tema", () => {
    for (const key of NEW_PROFILE_KEYS) {
      const hasFeeds = discoverSource.includes(`      ${key}: [`)
        || discoverSource.includes(`      "${key}": [`);
      expect(hasFeeds, `tema sem feeds curados: ${key}`).toBe(true);
    }
  });

  it("aplica janela de frescor maior apenas para nichos de cadência semanal sem configuração própria", () => {
    expect(captureSource).toContain("SLOW_NICHE_MIN_WINDOW_HOURS = 168");
    expect(captureSource).toContain("slowNicheWindowHours");
    // Configuração explícita da fonte continua tendo precedência.
    expect(captureSource).toContain("Number.isFinite(configured) && configured > 0\n    ? baseWindow");
  });
});
