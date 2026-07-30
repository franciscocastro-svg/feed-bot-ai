export type CreatorProfile = {
  instagram_account_id?: string | null;
  news_format_preference?: "single" | "carousel" | "automatic" | null;
  carousel_slide_count?: number | null;
  niche_detail?: string | null;
  target_audience?: string | null;
  voice_tone?: string | null;
  expertise_summary?: string | null;
  signature_phrases?: string[] | null;
  forbidden_words?: string[] | null;
  cta_style?: string | null;
  example_posts?: string[] | null;
  extra_notes?: string | null;
};

type CreatorProfileQueryResult = {
  data: CreatorProfile | null;
  error: Error | null;
};

type CreatorProfileFilter = {
  eq(column: string, value: string): CreatorProfileFilter;
  is(column: string, value: null): CreatorProfileFilter;
  maybeSingle(): Promise<CreatorProfileQueryResult>;
};

type CreatorProfileClient = {
  from(table: "creator_profiles"): {
    select(columns: string): CreatorProfileFilter;
  };
};

const clean = (value: unknown, max = 800) => String(value || "").trim().slice(0, max);
const cleanList = (value: unknown, maxItems = 20, maxLength = 240) =>
  (Array.isArray(value) ? value : [])
    .map((item) => clean(item, maxLength))
    .filter(Boolean)
    .slice(0, maxItems);
const CTA_EXTERNAL_LINK_RE =
  /\b(?:https?:\/\/|www\.|link\s+(?:na|da|do)\s+bio|clique|acesse|visite)\b/i;
const CTA_EXTERNAL_CONTACT_RE =
  /\b(?:whats?app|direct|dm|telefone|e-?mail)\b/i;
const CTA_COMMERCE_RE =
  /\b(?:compre|assine|checkout|pix|pague|pagamento)\b/i;
const CTA_HANDLE_RE = /@[a-z0-9._]{1,30}/i;

function stableListIndex(seed: string, length: number): number {
  if (length <= 1) return 0;
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

export function normalizeNewsFormatPreference(value: unknown): "single" | "carousel" | "automatic" {
  return value === "carousel" || value === "automatic" ? value : "single";
}

export function normalizeCarouselSlideCount(value: unknown): 5 | 6 | 7 {
  const parsed = Number(value);
  return parsed === 5 || parsed === 7 ? parsed : 6;
}

export function normalizeCreatorProfile(profile: CreatorProfile | null | undefined): CreatorProfile | null {
  if (!profile) return null;
  return {
    instagram_account_id: profile.instagram_account_id || null,
    news_format_preference: normalizeNewsFormatPreference(profile.news_format_preference),
    carousel_slide_count: normalizeCarouselSlideCount(profile.carousel_slide_count),
    niche_detail: clean(profile.niche_detail),
    target_audience: clean(profile.target_audience),
    voice_tone: clean(profile.voice_tone),
    expertise_summary: clean(profile.expertise_summary, 1600),
    signature_phrases: cleanList(profile.signature_phrases, 12, 180),
    forbidden_words: cleanList(profile.forbidden_words, 30, 120),
    cta_style: clean(profile.cta_style, 500),
    example_posts: cleanList(profile.example_posts, 5, 600),
    extra_notes: clean(profile.extra_notes, 1200),
  };
}

export async function loadEffectiveCreatorProfile(
  supabase: unknown,
  userId: string,
  instagramAccountId?: string | null,
): Promise<CreatorProfile | null> {
  const client = supabase as CreatorProfileClient;
  if (instagramAccountId) {
    const { data, error } = await client
      .from("creator_profiles")
      .select("instagram_account_id,news_format_preference,carousel_slide_count,niche_detail,target_audience,voice_tone,expertise_summary,signature_phrases,forbidden_words,cta_style,example_posts,extra_notes")
      .eq("user_id", userId)
      .eq("instagram_account_id", instagramAccountId)
      .maybeSingle();
    if (error) throw error;
    if (data) return normalizeCreatorProfile(data);
  }

  const { data, error } = await client
    .from("creator_profiles")
    .select("instagram_account_id,news_format_preference,carousel_slide_count,niche_detail,target_audience,voice_tone,expertise_summary,signature_phrases,forbidden_words,cta_style,example_posts,extra_notes")
    .eq("user_id", userId)
    .is("instagram_account_id", null)
    .maybeSingle();
  if (error) throw error;
  return normalizeCreatorProfile(data);
}

export function creatorProfilePrompt(profile: CreatorProfile | null | undefined): string {
  const value = normalizeCreatorProfile(profile);
  if (!value) return "";
  const safeCtaStyle = creatorCtaStyle(value);
  const lines = [
    "PERFIL DO CRIADOR DESTA CONTA (obrigatorio):",
    value.niche_detail ? `- Nicho: ${value.niche_detail}` : "",
    value.target_audience ? `- Publico-alvo: ${value.target_audience}` : "",
    value.voice_tone ? `- Tom de voz: ${value.voice_tone}` : "",
    value.expertise_summary ? `- Autoridade real: ${value.expertise_summary}` : "",
    value.signature_phrases?.length ? `- Frases de assinatura (use no maximo uma, quando natural): ${value.signature_phrases.join(" | ")}` : "",
    value.forbidden_words?.length ? `- TERMOS/TEMAS PROIBIDOS: ${value.forbidden_words.join(" | ")}` : "",
    safeCtaStyle
      ? `- Estilo de engajamento (apenas referencia de tom; nao copie literalmente nem inclua @handles): ${safeCtaStyle}`
      : "",
    value.example_posts?.length ? `- Referencias de estilo:\n${value.example_posts.map((item, index) => `  [${index + 1}] ${item}`).join("\n")}` : "",
    value.extra_notes ? `- Instrucoes adicionais: ${value.extra_notes}` : "",
    `- Formato preferido para noticias: ${normalizeNewsFormatPreference(value.news_format_preference)}.`,
    `- Quantidade preferida de slides: ${normalizeCarouselSlideCount(value.carousel_slide_count)}.`,
    "Nao invente experiencia pessoal, credenciais, resultados ou opinioes que nao estejam neste perfil.",
    "Entregue somente conteudo factual e contextual. Nao inclua CTA, pedido para seguir, @handle, link, fonte ou credito de imagem; o sistema finaliza a identidade depois.",
  ];
  return lines.filter(Boolean).join("\n");
}

function normalizedForMatch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

function containsForbiddenTerm(content: string, term: string) {
  const escaped = normalizedForMatch(term)
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  if (!escaped) return false;
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "i").test(content);
}

export function findForbiddenCreatorTerm(
  content: string | string[],
  profile: CreatorProfile | null | undefined,
): string | null {
  const haystack = normalizedForMatch(Array.isArray(content) ? content.join("\n") : content);
  const terms = cleanList(profile?.forbidden_words, 30, 120);
  return terms.find((term) => containsForbiddenTerm(haystack, term)) || null;
}

export function assertCreatorProfileCompliance(
  content: string | string[],
  profile: CreatorProfile | null | undefined,
) {
  const forbidden = findForbiddenCreatorTerm(content, profile);
  if (!forbidden) return;
  const error = new Error("Conteudo bloqueado pelo Perfil do Criador por conter um termo ou tema proibido.");
  (error as Error & { code?: string }).code = "creator_profile_forbidden";
  throw error;
}

export type CreatorEditorialConflict =
  | "cta_external_link"
  | "cta_external_contact"
  | "cta_direct_commerce"
  | "cta_account_handle"
  | "cta_forbidden_term";

export function creatorEditorialConflicts(
  profile: CreatorProfile | null | undefined,
): CreatorEditorialConflict[] {
  const value = normalizeCreatorProfile(profile);
  const ctaStyle = value?.cta_style || "";
  if (!ctaStyle) return [];

  const conflicts: CreatorEditorialConflict[] = [];
  if (CTA_EXTERNAL_LINK_RE.test(ctaStyle)) conflicts.push("cta_external_link");
  if (CTA_EXTERNAL_CONTACT_RE.test(ctaStyle)) conflicts.push("cta_external_contact");
  if (CTA_COMMERCE_RE.test(ctaStyle)) conflicts.push("cta_direct_commerce");
  if (CTA_HANDLE_RE.test(ctaStyle)) conflicts.push("cta_account_handle");
  if (findForbiddenCreatorTerm(ctaStyle, value)) conflicts.push("cta_forbidden_term");
  return conflicts;
}

export function creatorCtaStyle(profile: CreatorProfile | null | undefined): string {
  const value = normalizeCreatorProfile(profile);
  if (!value?.cta_style || creatorEditorialConflicts(value).length > 0) return "";
  return value.cta_style;
}

export function creatorCaptionExtras(
  profile: CreatorProfile | null | undefined,
  variationSeed = "",
): string[] {
  const value = normalizeCreatorProfile(profile);
  if (!value) return [];
  const signatures = value.signature_phrases || [];
  if (!signatures.length) return [];
  const signatureIndex = variationSeed
    ? stableListIndex(variationSeed, signatures.length)
    : 0;
  return [signatures[signatureIndex]];
}

export function creatorProfileFingerprint(profile: CreatorProfile | null | undefined): string {
  const value = normalizeCreatorProfile(profile);
  if (!value) return "none";
  const source = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}
