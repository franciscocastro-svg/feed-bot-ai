export type DiscoveryItem = {
  title?: string | null;
  description?: string | null;
};

export type NicheDiscoveryProfile = {
  input: string;
  key: string;
  label: string;
  terms: string[];
  query: string;
  recognized: boolean;
};

type KnownProfile = Omit<NicheDiscoveryProfile, "input" | "recognized"> & { aliases: string[] };

const STOP_WORDS = new Set([
  "para", "com", "sem", "sobre", "mercado", "noticias", "noticia", "brasil", "brasileiro", "brasileira",
]);

const KNOWN_PROFILES: KnownProfile[] = [
  { key: "tecnologia", label: "Tecnologia", aliases: ["tecnologia", "tech", "inovacao", "inteligencia artificial", "ia"], terms: ["tecnologia", "inovacao", "software", "aplicativo", "inteligencia artificial", "startup"], query: "tecnologia OR inovacao OR software OR startup" },
  { key: "economia", label: "Economia", aliases: ["economia", "financas", "investimentos", "mercado financeiro"], terms: ["economia", "financas", "investimento", "bolsa", "juros", "inflacao"], query: "economia OR financas OR investimentos OR bolsa" },
  { key: "forex", label: "Forex e câmbio", aliases: ["forex", "cambio", "mercado cambial", "xauusd", "dolar"], terms: ["forex", "cambio", "cambial", "moeda", "dolar", "euro", "xauusd"], query: "forex OR cambio OR mercado cambial OR dolar OR xauusd" },
  { key: "cripto", label: "Criptomoedas", aliases: ["cripto", "criptomoeda", "bitcoin", "ethereum", "web3"], terms: ["cripto", "criptomoeda", "bitcoin", "ethereum", "blockchain", "web3"], query: "criptomoeda OR bitcoin OR ethereum OR blockchain" },
  { key: "esportes", label: "Esportes", aliases: ["esporte", "esportes", "futebol", "atleta", "copa"], terms: ["esporte", "futebol", "atleta", "campeonato", "copa", "time"], query: "esportes OR futebol OR atleta OR campeonato" },
  { key: "politica", label: "Política", aliases: ["politica", "governo", "eleicoes", "congresso"], terms: ["politica", "governo", "congresso", "senado", "eleicao", "ministro"], query: "politica OR governo OR congresso OR eleicoes" },
  { key: "mundo", label: "Mundo", aliases: ["mundo", "internacional", "geopolitica"], terms: ["internacional", "mundo", "geopolitica", "guerra", "diplomacia"], query: "internacional OR mundo OR geopolitica" },
  { key: "saude", label: "Saúde", aliases: ["saude", "medicina", "bem estar", "nutricao"], terms: ["saude", "medicina", "doenca", "tratamento", "nutricao", "bem estar"], query: "saude OR medicina OR nutricao OR bem-estar" },
  { key: "fitness", label: "Fitness e academia", aliases: ["fitness", "academia", "musculacao", "treino", "personal trainer"], terms: ["fitness", "academia", "musculacao", "treino", "exercicio", "atividade fisica"], query: "fitness OR academia OR musculacao OR treino OR exercicio" },
  { key: "entretenimento", label: "Entretenimento", aliases: ["entretenimento", "fofoca", "famosos", "celebridades", "novela"], terms: ["entretenimento", "famoso", "celebridade", "novela", "reality", "televisao"], query: "entretenimento OR famosos OR celebridades OR novela" },
  { key: "direito", label: "Direito", aliases: ["direito", "advocacia", "juridico", "juridica"], terms: ["direito", "advocacia", "juridico", "justica", "tribunal", "lei"], query: "direito OR advocacia OR juridico OR justica" },
  { key: "beleza", label: "Beleza", aliases: ["beleza", "estetica", "maquiagem", "skincare"], terms: ["beleza", "estetica", "maquiagem", "skincare", "cosmetico"], query: "beleza OR estetica OR maquiagem OR skincare" },
];

export function normalizeNicheText(value: string): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function uniqueTerms(values: string[]): string[] {
  return [...new Set(values.map(normalizeNicheText).filter((value) => value.length >= 2))];
}

export function resolveNicheDiscoveryProfile(value: string): NicheDiscoveryProfile {
  const input = String(value || "").trim();
  const normalized = normalizeNicheText(input);
  const paddedInput = ` ${normalized} `;
  const known = KNOWN_PROFILES.find((profile) =>
    profile.aliases.some((alias) => {
      const normalizedAlias = normalizeNicheText(alias);
      return normalized === normalizedAlias || paddedInput.includes(` ${normalizedAlias} `);
    })
  );

  if (known) {
    return {
      input,
      key: known.key,
      label: known.label,
      terms: uniqueTerms(known.terms),
      query: known.query,
      recognized: true,
    };
  }

  const tokens = normalized
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
  const terms = uniqueTerms([normalized, ...tokens]).slice(0, 8);
  return {
    input,
    key: normalized.replace(/\s+/g, "-") || "nicho",
    label: input || "Nicho",
    terms,
    query: input,
    recognized: false,
  };
}

export function googleNewsTopicUrl(query: string, country = "BR", language = "pt-BR"): string {
  const gl = country.toUpperCase();
  const ceidLanguage = gl === "BR" ? "pt-419" : language.split("-")[0] || "en";
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query.trim())}&hl=${encodeURIComponent(language)}&gl=${encodeURIComponent(gl)}&ceid=${encodeURIComponent(`${gl}:${ceidLanguage}`)}`;
}

export function measureNicheRelevance(items: DiscoveryItem[], profile: NicheDiscoveryProfile) {
  const terms = uniqueTerms(profile.terms);
  const matchingItems = items.filter((item) => {
    const text = normalizeNicheText(`${item.title || ""} ${item.description || ""}`);
    return terms.some((term) => text.includes(term));
  });
  return {
    total: items.length,
    matching: matchingItems.length,
    ratio: items.length > 0 ? matchingItems.length / items.length : 0,
    relevant: matchingItems.length > 0,
  };
}
