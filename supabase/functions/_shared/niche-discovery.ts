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
  {
    key: "entretenimento",
    label: "Entretenimento",
    aliases: ["entretenimento", "fofoca", "famosos", "celebridades", "novela"],
    terms: [
      "entretenimento", "famoso", "celebridade", "novela", "reality", "televisao", "tv",
      "artista", "ator", "atriz", "cantor", "cantora", "influenciador", "humorista", "show",
      "musica", "relacionamento", "casal",
    ],
    query: "entretenimento OR famosos OR celebridades OR novela",
  },
  { key: "direito", label: "Direito", aliases: ["direito", "advocacia", "juridico", "juridica"], terms: ["direito", "advocacia", "juridico", "justica", "tribunal", "lei"], query: "direito OR advocacia OR juridico OR justica" },
  { key: "beleza", label: "Beleza", aliases: ["beleza", "estetica", "maquiagem", "skincare"], terms: ["beleza", "estetica", "maquiagem", "skincare", "cosmetico"], query: "beleza OR estetica OR maquiagem OR skincare" },
  // ---------------------------------------------------------------------------
  // Catálogo universal de temas (aditivo). Nenhum perfil acima foi alterado.
  // ---------------------------------------------------------------------------
  { key: "viagem", label: "Viagem e turismo", aliases: ["viagem", "viagens", "turismo", "agencia de viagens", "destinos", "mochilao"], terms: ["viagem", "turismo", "destino", "passagem", "hotel", "roteiro", "voo", "aeroporto"], query: "viagem OR turismo OR destinos OR passagens aereas" },
  { key: "gastronomia", label: "Gastronomia", aliases: ["gastronomia", "culinaria", "receitas", "restaurante", "chef", "comida", "cozinha"], terms: ["gastronomia", "receita", "culinaria", "restaurante", "chef", "prato", "cozinha"], query: "gastronomia OR receitas OR restaurantes OR culinaria" },
  { key: "pets", label: "Pets e animais", aliases: ["pet", "pets", "animais", "petshop", "veterinaria", "cachorro", "gato"], terms: ["pet", "cachorro", "gato", "animal", "veterinario", "racao", "tutor"], query: "pets OR cachorros OR gatos OR veterinaria" },
  { key: "moda", label: "Moda", aliases: ["moda", "fashion", "vestuario", "roupas", "estilo"], terms: ["moda", "fashion", "colecao", "look", "estilo", "desfile", "tendencia"], query: "moda OR fashion OR tendencias de moda" },
  { key: "automoveis", label: "Automóveis", aliases: ["automovel", "automoveis", "carros", "carro", "automotivo", "motos", "veiculos"], terms: ["carro", "automovel", "veiculo", "moto", "motor", "lancamento", "seminovo"], query: "carros OR automoveis OR lancamentos automotivos" },
  { key: "games", label: "Games", aliases: ["games", "game", "jogos", "gamer", "videogame", "esports"], terms: ["game", "jogo", "console", "playstation", "xbox", "nintendo", "gamer", "esports"], query: "games OR jogos OR videogame OR esports" },
  { key: "cinema", label: "Cinema e séries", aliases: ["cinema", "filmes", "series", "streaming", "netflix"], terms: ["filme", "serie", "cinema", "estreia", "streaming", "netflix", "trailer"], query: "cinema OR filmes OR series OR streaming" },
  { key: "musica", label: "Música", aliases: ["musica", "sertanejo", "funk", "rock", "show", "artista musical"], terms: ["musica", "album", "single", "show", "turne", "cantor", "banda"], query: "musica OR shows OR lancamentos musicais" },
  { key: "educacao", label: "Educação", aliases: ["educacao", "escola", "enem", "vestibular", "professor", "ensino"], terms: ["educacao", "escola", "enem", "vestibular", "aluno", "professor", "universidade"], query: "educacao OR enem OR vestibular OR escolas" },
  { key: "carreira", label: "Carreira e empregos", aliases: ["carreira", "emprego", "empregos", "rh", "recursos humanos", "vagas"], terms: ["carreira", "emprego", "vaga", "contratacao", "salario", "curriculo", "recrutamento"], query: "carreira OR empregos OR vagas OR mercado de trabalho" },
  { key: "imoveis", label: "Imóveis", aliases: ["imoveis", "imovel", "imobiliaria", "corretor", "aluguel", "financiamento imobiliario"], terms: ["imovel", "imobiliario", "aluguel", "apartamento", "condominio", "financiamento", "corretor"], query: "imoveis OR mercado imobiliario OR aluguel" },
  { key: "agro", label: "Agronegócio", aliases: ["agro", "agronegocio", "agricultura", "pecuaria", "fazenda", "soja"], terms: ["agro", "agricultura", "safra", "soja", "milho", "pecuaria", "produtor rural"], query: "agronegocio OR agricultura OR safra OR pecuaria" },
  { key: "ciencia", label: "Ciência", aliases: ["ciencia", "cientifico", "pesquisa", "astronomia", "espaco"], terms: ["ciencia", "pesquisa", "estudo", "cientista", "espaco", "universo", "descoberta"], query: "ciencia OR pesquisa cientifica OR astronomia" },
  { key: "meio-ambiente", label: "Meio ambiente", aliases: ["meio ambiente", "sustentabilidade", "clima", "ambiental", "esg"], terms: ["meio ambiente", "sustentabilidade", "clima", "amazonia", "poluicao", "reciclagem", "esg"], query: "meio ambiente OR sustentabilidade OR clima" },
  { key: "empreendedorismo", label: "Empreendedorismo", aliases: ["empreendedorismo", "empreendedor", "pequenas empresas", "pme", "mei", "negocios"], terms: ["empreendedor", "negocio", "empresa", "pme", "mei", "franquia", "startup"], query: "empreendedorismo OR pequenas empresas OR negocios" },
  { key: "marketing", label: "Marketing digital", aliases: ["marketing", "marketing digital", "publicidade", "trafego pago", "social media", "agencia de marketing"], terms: ["marketing", "publicidade", "campanha", "midia", "anuncio", "trafego", "redes sociais"], query: "marketing digital OR publicidade OR redes sociais" },
  { key: "religiao", label: "Religião e fé", aliases: ["religiao", "gospel", "igreja", "fe", "catolico", "evangelico", "cristao"], terms: ["igreja", "gospel", "fe", "oracao", "biblia", "pastor", "papa", "cristao"], query: "religiao OR gospel OR igreja OR fe" },
  { key: "maternidade", label: "Maternidade e família", aliases: ["maternidade", "mae", "bebe", "familia", "gestante", "infantil"], terms: ["maternidade", "bebe", "gravidez", "filho", "crianca", "familia", "parto"], query: "maternidade OR bebes OR gravidez OR familia" },
  { key: "decoracao", label: "Decoração e casa", aliases: ["decoracao", "casa", "interiores", "arquitetura", "design de interiores", "reforma"], terms: ["decoracao", "casa", "ambiente", "interiores", "movel", "reforma", "arquitetura"], query: "decoracao OR design de interiores OR arquitetura" },
  { key: "odontologia", label: "Odontologia", aliases: ["odontologia", "dentista", "dental", "ortodontia", "clinica odontologica"], terms: ["odontologia", "dentista", "dente", "sorriso", "ortodontia", "implante"], query: "odontologia OR dentista OR saude bucal" },
  { key: "psicologia", label: "Psicologia e saúde mental", aliases: ["psicologia", "psicologo", "saude mental", "terapia", "ansiedade"], terms: ["psicologia", "saude mental", "terapia", "ansiedade", "depressao", "autoestima", "emocional"], query: "psicologia OR saude mental OR terapia" },
  { key: "seguros", label: "Seguros e previdência", aliases: ["seguros", "seguro", "corretora de seguros", "previdencia", "consorcio"], terms: ["seguro", "seguradora", "apolice", "sinistro", "previdencia", "consorcio", "corretor"], query: "seguros OR previdencia OR mercado segurador" },
  { key: "construcao", label: "Construção civil", aliases: ["construcao", "construcao civil", "obra", "engenharia", "material de construcao"], terms: ["construcao", "obra", "engenharia", "cimento", "reforma", "canteiro", "empreiteira"], query: "construcao civil OR obras OR engenharia" },
  { key: "energia", label: "Energia", aliases: ["energia", "energia solar", "eletrica", "petroleo", "renovavel"], terms: ["energia", "solar", "eletrica", "petroleo", "gas", "renovavel", "tarifa"], query: "energia OR energia solar OR setor eletrico" },
  { key: "varejo", label: "Varejo e e-commerce", aliases: ["varejo", "ecommerce", "e-commerce", "loja", "comercio", "consumo"], terms: ["varejo", "ecommerce", "loja", "consumidor", "venda", "shopping", "marketplace"], query: "varejo OR e-commerce OR consumo" },
  { key: "logistica", label: "Logística e transporte", aliases: ["logistica", "transporte", "frete", "caminhao", "transportadora"], terms: ["logistica", "transporte", "frete", "caminhao", "entrega", "porto", "cadeia de suprimentos"], query: "logistica OR transporte OR frete" },
  { key: "seguranca-publica", label: "Segurança pública", aliases: ["seguranca publica", "policia", "crime", "policial", "true crime"], terms: ["policia", "crime", "prisao", "investigacao", "operacao", "seguranca publica", "vitima"], query: "policia OR crimes OR seguranca publica" },
  { key: "cultura-pop", label: "Cultura pop e nerd", aliases: ["cultura pop", "nerd", "geek", "quadrinhos", "anime", "hq"], terms: ["cultura pop", "nerd", "geek", "quadrinho", "anime", "heroi", "marvel", "dc"], query: "cultura pop OR nerd OR quadrinhos OR anime" },
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
