export type TopicCarouselSlide = {
  position: number;
  role: "cover" | "content" | "cta";
  title: string;
  body: string;
  emphasis: string[];
  image_mode: "text" | "stock";
  image_query: string | null;
  image_alt: string | null;
  image_asset?: {
    provider: "pixabay";
    asset_id: number;
    page_url: string;
    contributor: string | null;
    query: string;
    license_url: string;
    selected_at: string;
  } | null;
};

const MIN_SLIDES = 5;
const MAX_SLIDES = 7;

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
  return cleaned;
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

  let stockSlides = 0;
  const normalized = rawSlides.slice(0, MAX_SLIDES).map<TopicCarouselSlide>((slide, index) => {
    const record = slide && typeof slide === "object" ? slide as Record<string, unknown> : {};
    const title = cleanText(record.title, 90);
    const body = cleanText(record.body, 260);
    if (!title) throw new Error(`Carrossel inválido: o slide ${index + 1} está sem título.`);
    if (index > 0 && !body) throw new Error(`Carrossel inválido: o slide ${index + 1} está sem conteúdo.`);
    const isLastRequestedSlide = index === Math.min(rawSlides.length, MAX_SLIDES) - 1;
    const imageQuery = cleanImageQuery(record.image_query);
    const wantsStock = record.image_mode === "stock" && Boolean(imageQuery) && !isLastRequestedSlide && stockSlides < 2;
    if (wantsStock) stockSlides += 1;
    return {
      position: index + 1,
      role: index === 0 ? "cover" : "content",
      title,
      body,
      emphasis: normalizeEmphasis(record.emphasis, title, body),
      image_mode: wantsStock ? "stock" : "text",
      image_query: wantsStock ? imageQuery : null,
      image_alt: wantsStock ? cleanText(record.image_alt, 140) || title : null,
    };
  });

  if (normalized.length < MIN_SLIDES || normalized.length > MAX_SLIDES) {
    throw new Error(`Carrossel inválido: gere entre ${MIN_SLIDES} e ${MAX_SLIDES} slides.`);
  }

  normalized[0] = {
    ...normalized[0],
    role: "cover",
    title: normalized[0].title || cleanText(fallbackTitle, 90),
  };
  normalized[normalized.length - 1] = {
    ...normalized[normalized.length - 1],
    role: "cta",
    body: normalized[normalized.length - 1].body || cleanText(fallbackCta, 260),
    image_mode: "text",
    image_query: null,
    image_alt: null,
  };
  return normalized;
}

export function carouselPromptContract() {
  return `Para carrossel, inclua obrigatoriamente "slides" com 5 a 7 objetos.
Slide 1: capa com gancho. Slides intermediários: uma ideia concreta por slide. Último slide: conclusão e CTA.
Cada objeto deve seguir {"title":"até 90 caracteres","body":"até 260 caracteres","emphasis":["até 3 trechos exatos do title/body"],"image_mode":"text ou stock","image_query":"2 a 5 palavras genéricas em inglês ou null","image_alt":"descrição curta em pt-BR ou null"}.
Use image_mode="stock" em no máximo 2 slides. O último slide deve ser text.
As buscas visuais devem representar conceitos genéricos; nunca peça pessoa pública, marca, logotipo, conta social ou evento exato.
Não escreva fonte, URL, crédito, nome do banco de imagens ou marcadores "Slide N" na legenda, no title ou no body.`;
}
