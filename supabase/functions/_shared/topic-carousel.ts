export type TopicCarouselSlide = {
  position: number;
  role: "cover" | "content" | "cta";
  title: string;
  body: string;
};

const MIN_SLIDES = 5;
const MAX_SLIDES = 7;

function cleanText(value: unknown, maxLength: number) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

export function normalizeTopicCarousel(
  rawSlides: unknown,
  fallbackTitle: string,
  fallbackCta = "Salve este carrossel e compartilhe com quem precisa.",
): TopicCarouselSlide[] {
  if (!Array.isArray(rawSlides)) {
    throw new Error("Carrossel inválido: a IA não retornou a lista de slides.");
  }

  const normalized = rawSlides.slice(0, MAX_SLIDES).map<TopicCarouselSlide>((slide, index) => {
    const record = slide && typeof slide === "object" ? slide as Record<string, unknown> : {};
    const title = cleanText(record.title, 90);
    const body = cleanText(record.body, 260);
    if (!title) throw new Error(`Carrossel inválido: o slide ${index + 1} está sem título.`);
    if (index > 0 && !body) throw new Error(`Carrossel inválido: o slide ${index + 1} está sem conteúdo.`);
    return {
      position: index + 1,
      role: index === 0 ? "cover" : "content",
      title,
      body,
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
  };
  return normalized;
}

export function carouselPromptContract() {
  return `Para carrossel, inclua obrigatoriamente "slides" com 5 a 7 objetos.
Slide 1: capa com gancho. Slides intermediários: uma ideia concreta por slide. Último slide: conclusão e CTA.
Cada objeto deve seguir {"title":"até 90 caracteres","body":"até 260 caracteres"}.
Não use marcadores "Slide N" dentro da legenda.`;
}
