export type TopicCarouselSlide = {
  position: number;
  role: "cover" | "content" | "cta";
  title: string;
  body: string;
  emphasis: string[];
  image_mode: "text" | "stock";
  image_query: string | null;
  image_queries: string[];
  image_alt: string | null;
  image_asset?: {
    provider: "pixabay";
    asset_id: number;
    page_url: string;
    contributor: string | null;
    query: string;
    license_url: string;
    selected_at: string;
    relevance_score?: number;
    matched_terms?: string[];
    cache_version?: string;
  } | null;
};

const MIN_SLIDES = 5;
const MAX_SLIDES = 7;
const MAX_STOCK_SLIDES = 1;
const MAX_TITLE_LENGTH = 72;
const MAX_BODY_LENGTH = 190;
const MAX_IMAGE_QUERIES = 3;
const MAX_IMAGE_QUERY_WORDS = 6;

function cleanText(value: unknown, maxLength: number) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanImageQuery(value: unknown) {
  const raw = cleanText(value, 120);
  if (!raw || raw.includes("@") || /^https?:/i.test(raw)) return null;
  const cleaned = raw
    .replace(/[^\p{L}\p{N}\s,-]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return cleaned.split(/\s+/).slice(0, MAX_IMAGE_QUERY_WORDS).join(" ");
}

function cleanImageQueries(record: Record<string, unknown>) {
  const candidates = [
    record.image_query,
    ...(Array.isArray(record.image_queries) ? record.image_queries : []),
  ];
  const seen = new Set<string>();
  const queries: string[] = [];
  for (const candidate of candidates) {
    const query = cleanImageQuery(candidate);
    const key = query?.toLocaleLowerCase("en-US");
    if (!query || !key || seen.has(key)) continue;
    seen.add(key);
    queries.push(query);
    if (queries.length === MAX_IMAGE_QUERIES) break;
  }
  return queries;
}

function normalizeEmphasis(value: unknown, title: string, body: string) {
  if (!Array.isArray(value)) return [];
  const publicText = `${title}\n${body}`.toLocaleLowerCase("pt-BR");
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    const phrase = cleanText(entry, 50);
    const key = phrase.toLocaleLowerCase("pt-BR");
    if (!phrase || seen.has(key) || !publicText.includes(key)) continue;
    seen.add(key);
    result.push(phrase);
    if (result.length === 3) break;
  }
  return result;
}

export function normalizeTopicCarousel(
  rawSlides: unknown,
  fallbackTitle: string,
  fallbackCta = "Salve este carrossel e compartilhe com quem precisa.",
): TopicCarouselSlide[] {
  if (!Array.isArray(rawSlides)) {
    throw new Error("Carrossel inválido: a IA não retornou a lista de slides.");
  }

  const requestedSlides = rawSlides.slice(0, MAX_SLIDES);
  const requestedStock = requestedSlides
    .map((slide) => slide && typeof slide === "object" ? slide as Record<string, unknown> : {})
    .find((record, index) =>
      index < requestedSlides.length - 1
      && record.image_mode === "stock"
      && cleanImageQueries(record).length > 0
    );
  const normalized = requestedSlides.map<TopicCarouselSlide>((slide, index) => {
    const record = slide && typeof slide === "object" ? slide as Record<string, unknown> : {};
    const title = cleanText(record.title, MAX_TITLE_LENGTH);
    const body = cleanText(record.body, MAX_BODY_LENGTH);
    if (!title) throw new Error(`Carrossel inválido: o slide ${index + 1} está sem título.`);
    if (!body) throw new Error(`Carrossel inválido: o slide ${index + 1} está sem conteúdo.`);
    const isLastRequestedSlide = index === Math.min(rawSlides.length, MAX_SLIDES) - 1;
    const isCover = index === 0;
    const ownQueries = cleanImageQueries(record);
    const coverStock = isCover
      ? (ownQueries.length ? record : requestedStock)
      : null;
    const imageQueries = coverStock ? cleanImageQueries(coverStock) : [];
    const wantsStock = isCover
      && !isLastRequestedSlide
      && MAX_STOCK_SLIDES > 0
      && imageQueries.length > 0;
    return {
      position: index + 1,
      role: isCover ? "cover" : "content",
      title,
      body,
      emphasis: normalizeEmphasis(record.emphasis, title, body),
      image_mode: wantsStock ? "stock" : "text",
      image_query: wantsStock ? imageQueries[0] : null,
      image_queries: wantsStock ? imageQueries : [],
      image_alt: wantsStock ? cleanText(coverStock?.image_alt, 140) || title : null,
    };
  });

  if (normalized.length < MIN_SLIDES || normalized.length > MAX_SLIDES) {
    throw new Error(`Carrossel inválido: gere entre ${MIN_SLIDES} e ${MAX_SLIDES} slides.`);
  }

  normalized[0] = {
    ...normalized[0],
    role: "cover",
    title: normalized[0].title || cleanText(fallbackTitle, MAX_TITLE_LENGTH),
  };
  normalized[normalized.length - 1] = {
    ...normalized[normalized.length - 1],
    role: "cta",
    body: normalized[normalized.length - 1].body || cleanText(fallbackCta, MAX_BODY_LENGTH),
    image_mode: "text",
    image_query: null,
    image_queries: [],
    image_alt: null,
  };
  return normalized;
}

export function carouselPromptContract() {
  return `Para carrossel, inclua obrigatoriamente "slides" com 5 a 7 objetos.
Slide 1: capa com gancho curto. Slides intermediários: uma ideia concreta por slide. Último slide: conclusão e CTA.
O slide 1 deve concentrar a manchete e a informação mais impactante do carrossel, sem guardar o principal fato para o slide 2.
Escreva como um carrossel editorial minimalista: 24 a 38 palavras por slide, frases curtas, muito respiro e nenhuma parede de texto.
Cada objeto deve seguir {"title":"até 72 caracteres","body":"até 190 caracteres","emphasis":["até 3 trechos exatos do title/body"],"image_mode":"text ou stock","image_query":"consulta visual principal em inglês ou null","image_queries":["2 ou 3 alternativas em inglês"],"image_alt":"descrição curta em pt-BR ou null"}.
No slide 1, use image_mode="stock" somente quando puder criar consultas visuais seguras e diretamente relacionadas à manchete. Todos os outros slides e o CTA final devem ser text.
Para a capa, considere em conjunto o tema, a pauta, o título, o nicho, o público e o Perfil de Criador informados no prompt.
Cada consulta deve ter 3 a 6 palavras concretas em inglês e descrever algo que uma fotografia realmente mostraria, por exemplo "praying hands open bible sunrise". Crie 2 ou 3 alternativas específicas.
Não use termos abstratos ou genéricos como "concept", "motivation", "success", "business background" ou "technology". Não use notebook, café, mesa ou escritório se esses objetos não forem parte explícita do assunto.
Nunca peça pessoa pública, marca, logotipo, conta social ou evento exato. Se não houver representação visual segura, use image_mode="text", image_query=null e image_queries=[] para gerar uma capa tipográfica.
Escolha em emphasis apenas frases curtas que merecem negrito e que existam literalmente no title ou body.
Não escreva fonte, URL, crédito, nome do banco de imagens ou marcadores "Slide N" na legenda, no title ou no body.`;
}
