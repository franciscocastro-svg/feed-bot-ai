import {
  EDITORIAL_PILOT_SCHEMA_VERSION,
  parseEditorialPilotProposal,
  type EditorialPilotProposal,
} from "./schema";

export type EditorialPilotProfileInput = {
  niche_detail: string;
  target_audience: string;
  voice_tone: string;
  expertise_summary: string;
  signature_phrases: string[];
  forbidden_words: string[];
  cta_style: string;
  extra_notes: string;
  news_format_preference: "single" | "carousel" | "automatic";
};

export type EditorialPilotInput = {
  instagramAccountId: string;
  instagramUsername: string;
  profile: EditorialPilotProfileInput;
  now?: Date;
};

type DomainPreset = {
  terms: string[];
  regulated: boolean;
  positioning: string;
  pillars: string[];
  searches: Array<{ kind: "rss" | "site" | "topic"; query: string; reason: string; risk: "low" | "medium" | "high" }>;
  protectionNotes: string[];
};

const DEFAULT_PRESET: DomainPreset = {
  terms: [],
  regulated: false,
  positioning: "Conteúdo útil, autoral e conectado às dúvidas reais do público.",
  pillars: ["educação prática", "autoridade", "bastidores", "conversa com a comunidade"],
  searches: [
    { kind: "topic", query: "tendências e dúvidas frequentes do nicho", reason: "Mapear dúvidas recorrentes e oportunidades educativas.", risk: "low" },
    { kind: "site", query: "entidades e publicações especializadas do setor", reason: "Priorizar referências reconhecidas antes de sugerir fontes reais.", risk: "medium" },
    { kind: "rss", query: "blogs técnicos com atualização recorrente", reason: "Encontrar conteúdo perene e atualizações do mercado.", risk: "medium" },
  ],
  protectionNotes: ["Não apresentar afirmações factuais sem fonte identificável."],
};

const PRESETS: DomainPreset[] = [
  {
    terms: [
      "advogado", "advogada", "advogados", "advogadas", "advocacia", "direito",
      "jurídica", "jurídico", "jurídicas", "jurídicos", "lei", "leis", "legislação",
      "tributário", "tributária", "tributários", "tributárias", "direito empresarial",
      "direito trabalhista", "direito civil",
    ],
    regulated: true,
    positioning: "Educação jurídica responsável, sem promessa de resultado nem aconselhamento individual.",
    pillars: ["direitos explicados", "prevenção", "mudanças regulatórias", "autoridade profissional"],
    searches: [
      { kind: "topic", query: "mudanças legislativas e dúvidas jurídicas recorrentes", reason: "Mapear dúvidas jurídicas reais sem substituir aconselhamento profissional.", risk: "low" },
      { kind: "site", query: "legislação, tribunais, OAB e órgãos públicos oficiais", reason: "Priorizar fontes jurídicas oficiais e atuais.", risk: "medium" },
      { kind: "rss", query: "informativos jurídicos oficiais e publicações técnicas atualizadas", reason: "Acompanhar mudanças legais com autoria e data.", risk: "medium" },
    ],
    protectionNotes: [
      "Não oferecer aconselhamento jurídico individual nem promessa de resultado.",
      "Confirmar a legislação e a jurisprudência vigentes antes da publicação.",
    ],
  },
  {
    terms: [
      "medicina", "médico", "médica", "médicos", "médicas", "saúde", "odontologia",
      "dentista", "dentistas", "nutrição", "nutricionista", "nutricionistas", "psicologia",
      "psicólogo", "psicóloga", "psicólogos", "psicólogas", "clínica", "clínicas", "farmácia",
    ],
    regulated: true,
    positioning: "Educação em saúde baseada em evidências, sem diagnóstico ou promessa de cura.",
    pillars: ["educação em saúde", "prevenção", "mitos e verdades", "rotina profissional"],
    searches: [
      { kind: "topic", query: "dúvidas de saúde, prevenção e evidências recentes", reason: "Mapear dúvidas educativas sem fazer diagnóstico.", risk: "low" },
      { kind: "site", query: "Ministério da Saúde, Anvisa, sociedades médicas e instituições oficiais", reason: "Priorizar referências sanitárias e profissionais reconhecidas.", risk: "medium" },
      { kind: "rss", query: "publicações científicas e informativos de saúde com revisão editorial", reason: "Encontrar evidências atuais com autoria e contexto.", risk: "medium" },
    ],
    protectionNotes: [
      "Não oferecer diagnóstico, prescrição ou promessa de cura.",
      "Usar evidências e fontes reconhecidas, com revisão profissional para conteúdo clínico.",
    ],
  },
  {
    terms: [
      "finanças", "financeiro", "financeira", "financeiros", "financeiras", "investimentos",
      "investimento", "economia", "economista", "economistas", "trader", "traders",
      "criptomoedas", "cripto", "contabilidade", "contador", "contadora", "contadores",
    ],
    regulated: true,
    positioning: "Educação financeira clara, sem promessa de rentabilidade ou recomendação individual.",
    pillars: ["educação financeira", "cenários explicados", "gestão de risco", "hábitos financeiros"],
    searches: [
      { kind: "topic", query: "educação financeira, indicadores e riscos relevantes", reason: "Explicar decisões financeiras sem recomendar ativos individualmente.", risk: "low" },
      { kind: "site", query: "Banco Central, CVM e órgãos oficiais do mercado financeiro", reason: "Priorizar indicadores e regras publicados por fontes oficiais.", risk: "medium" },
      { kind: "rss", query: "indicadores econômicos e publicações financeiras com autoria e data", reason: "Contextualizar cenários, datas e riscos com fontes rastreáveis.", risk: "medium" },
    ],
    protectionNotes: [
      "Não fazer recomendação individual nem promessa de rentabilidade.",
      "Explicitar riscos, data e contexto, mantendo revisão humana antes da publicação.",
    ],
  },
  {
    terms: [
      "fofoca", "fofocas", "celebridade", "celebridades", "famoso", "famosa", "famosos",
      "famosas", "influenciador", "influenciadora", "influenciadores", "influenciadoras",
      "reality", "reality show", "reality shows", "televisão", "entretenimento", "música",
      "artistas", "assuntos virais",
    ],
    regulated: false,
    positioning: "Notícias e entretenimento responsável, com contexto, confirmação e distinção clara entre fato e rumor.",
    pillars: ["fatos confirmados", "bastidores e contexto", "repercussão nas redes", "conversa com a audiência"],
    searches: [
      { kind: "topic", query: "tendências confirmadas, lançamentos e repercussões do entretenimento", reason: "Mapear assuntos relevantes sem transformar rumor em fato.", risk: "low" },
      { kind: "site", query: "perfis oficiais, assessorias e veículos reconhecidos de entretenimento", reason: "Priorizar confirmações e declarações rastreáveis.", risk: "medium" },
      { kind: "rss", query: "portais de entretenimento com autoria, data e atualização recorrente", reason: "Acompanhar novidades com origem e data verificáveis.", risk: "medium" },
    ],
    protectionNotes: [
      "Confirmar a fonte e distinguir fato, declaração e rumor.",
      "Evitar especulação difamatória, invasão de privacidade e julgamento sem evidência.",
    ],
  },
  {
    terms: [
      "empreendedorismo", "empreendedor", "empreendedora", "empreendedores", "marketing",
      "negócio", "negócios", "vendas", "tecnologia", "inteligência artificial", "produtividade",
      "empresa", "empresas",
    ],
    regulated: false,
    positioning: "Aplicação prática de estratégia, tecnologia e execução para evolução profissional.",
    pillars: ["estratégia prática", "tecnologia aplicada", "casos e aprendizados", "mentalidade de execução"],
    searches: [
      { kind: "topic", query: "tendências de gestão, tecnologia e execução empresarial", reason: "Mapear dúvidas e oportunidades práticas do mercado.", risk: "low" },
      { kind: "site", query: "instituições empresariais, pesquisas e casos documentados", reason: "Priorizar evidências e casos rastreáveis.", risk: "medium" },
      { kind: "rss", query: "publicações de negócios e tecnologia com autoria e atualização recorrente", reason: "Encontrar conteúdo atual e perene com origem identificável.", risk: "medium" },
    ],
    protectionNotes: [
      "Não prometer resultados comerciais garantidos.",
      "Distinguir caso, opinião e evidência, identificando as fontes utilizadas.",
    ],
  },
];

function clean(value: string, fallback: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 500) || fallback;
}

function normalizeList(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function normalizeDomainText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function containsDomainTerm(value: string, term: string): boolean {
  const text = normalizeDomainText(value);
  const normalizedTerm = normalizeDomainText(term);
  return normalizedTerm.length > 0 && ` ${text} `.includes(` ${normalizedTerm} `);
}

function stableProfile(profile: EditorialPilotProfileInput) {
  return {
    ...profile,
    niche_detail: clean(profile.niche_detail, "negócio local"),
    target_audience: clean(profile.target_audience, "pessoas interessadas no tema"),
    voice_tone: clean(profile.voice_tone, "claro, humano e didático"),
    expertise_summary: clean(profile.expertise_summary, "experiência prática no nicho"),
    signature_phrases: normalizeList(profile.signature_phrases),
    forbidden_words: normalizeList(profile.forbidden_words),
    cta_style: clean(profile.cta_style, "convide o público a comentar uma dúvida"),
    extra_notes: clean(profile.extra_notes, "preservar precisão e identidade da conta"),
  };
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function selectPreset(profile: ReturnType<typeof stableProfile>): DomainPreset {
  const weightedFields = [
    { value: profile.niche_detail, weight: 4 },
    { value: profile.expertise_summary, weight: 2 },
    { value: profile.extra_notes, weight: 1 },
  ];
  const ranked = PRESETS.map((preset, index) => ({
    preset,
    index,
    score: weightedFields.reduce(
      (score, field) => score + preset.terms.filter((term) => containsDomainTerm(field.value, term)).length * field.weight,
      0,
    ),
  })).sort((a, b) => b.score - a.score || a.index - b.index);

  return ranked[0]?.score > 0 ? ranked[0].preset : DEFAULT_PRESET;
}

function contentMix(preference: EditorialPilotProfileInput["news_format_preference"]) {
  if (preference === "carousel") return { educational: 45, authority: 25, engagement: 20, conversion: 10 };
  if (preference === "single") return { educational: 35, authority: 25, engagement: 30, conversion: 10 };
  return { educational: 40, authority: 25, engagement: 25, conversion: 10 };
}

export async function buildEditorialPilotProposal(input: EditorialPilotInput): Promise<EditorialPilotProposal> {
  const profile = stableProfile(input.profile);
  const preset = selectPreset(profile);
  const fingerprint = await sha256(JSON.stringify({ account: input.instagramAccountId, profile }));
  const generatedAt = (input.now || new Date()).toISOString();
  const sourceSuggestions = preset.searches.map((source, index) => ({
    client_ref: `source-${index + 1}`,
    ...source,
    query: clean(`${source.query} — foco: ${profile.niche_detail}`, source.query),
    requires_review: true as const,
  }));
  const preferredFormats = profile.news_format_preference === "single"
    ? (["feed", "story"] as const)
    : profile.news_format_preference === "carousel"
      ? (["carousel", "story"] as const)
      : (["feed", "reel", "story", "carousel"] as const);
  const objectives = ["educar", "autoridade", "engajar", "converter"] as const;
  const topicSuggestions = preset.pillars.map((pillar, index) => ({
    client_ref: `topic-${index + 1}`,
    title: `${pillar}: uma abordagem útil para ${profile.target_audience}`,
    pillar,
    objective: objectives[index % objectives.length],
    formats: [...preferredFormats],
    frequency_per_week: index === 0 ? 2 : 1,
    source_refs: [`source-${(index % sourceSuggestions.length) + 1}`],
    reason: `Combina ${pillar} com a voz ${profile.voice_tone.toLowerCase()} definida para a conta.`,
  }));

  return parseEditorialPilotProposal({
    schema_version: EDITORIAL_PILOT_SCHEMA_VERSION,
    mode: "preview",
    proposal_id: `preview-${fingerprint.slice(0, 16)}`,
    generated_at: generatedAt,
    instagram: {
      account_id: input.instagramAccountId,
      username: input.instagramUsername.replace(/^@/, ""),
      profile_fingerprint: fingerprint,
    },
    strategy: {
      niche: profile.niche_detail,
      audience: profile.target_audience,
      voice: profile.voice_tone,
      positioning: preset.positioning,
      pillars: preset.pillars,
    },
    source_suggestions: sourceSuggestions,
    topic_suggestions: topicSuggestions,
    content_mix: contentMix(profile.news_format_preference),
    cadence: { suggested_posts_per_week: 7, preferred_hours: [9, 12, 18] },
    guardrails: {
      source_required: true,
      regulated_domain: preset.regulated,
      human_review_required: true,
      notes: [
        "Nenhuma fonte, pauta, configuração ou publicação é criada por esta prévia.",
        "Validar cada sugestão antes de uma futura ativação.",
        ...preset.protectionNotes,
        ...(preset.regulated ? ["Revisão humana obrigatória para conteúdo de área regulada."] : []),
      ],
    },
  }, input.instagramAccountId);
}
