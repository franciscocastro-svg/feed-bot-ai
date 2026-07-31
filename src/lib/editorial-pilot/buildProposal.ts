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
  regulated: boolean;
  positioning: string;
  pillars: string[];
  searches: Array<{ kind: "rss" | "site" | "topic"; query: string; reason: string; risk: "low" | "medium" | "high" }>;
};

const DEFAULT_PRESET: DomainPreset = {
  regulated: false,
  positioning: "Conteúdo útil, autoral e conectado às dúvidas reais do público.",
  pillars: ["educação prática", "autoridade", "bastidores", "conversa com a comunidade"],
  searches: [
    { kind: "topic", query: "tendências e dúvidas frequentes do nicho", reason: "Mapear dúvidas recorrentes e oportunidades educativas.", risk: "low" },
    { kind: "site", query: "entidades e publicações especializadas do setor", reason: "Priorizar referências reconhecidas antes de sugerir fontes reais.", risk: "medium" },
    { kind: "rss", query: "blogs técnicos com atualização recorrente", reason: "Encontrar conteúdo perene e atualizações do mercado.", risk: "medium" },
  ],
};

const PRESETS: Array<{ pattern: RegExp; preset: Partial<DomainPreset> }> = [
  {
    pattern: /advoc|direito|jur[ií]dic|lei|contabil|tribut/i,
    preset: {
      regulated: true,
      positioning: "Educação jurídica responsável, sem promessa de resultado nem aconselhamento individual.",
      pillars: ["direitos explicados", "prevenção", "mudanças regulatórias", "autoridade profissional"],
    },
  },
  {
    pattern: /medic|sa[uú]de|odont|nutri|psic|cl[ií]nic|farm[aá]c/i,
    preset: {
      regulated: true,
      positioning: "Educação em saúde baseada em evidências, sem diagnóstico ou promessa de cura.",
      pillars: ["educação em saúde", "prevenção", "mitos e verdades", "rotina profissional"],
    },
  },
  {
    pattern: /finan|invest|econom|trader|cripto|contab/i,
    preset: {
      regulated: true,
      positioning: "Educação financeira clara, sem promessa de rentabilidade ou recomendação individual.",
      pillars: ["educação financeira", "cenários explicados", "gestão de risco", "hábitos financeiros"],
    },
  },
  {
    pattern: /empreend|marketing|neg[oó]ci|vendas|tecnolog|intelig[eê]ncia artificial/i,
    preset: {
      positioning: "Aplicação prática de estratégia, tecnologia e execução para evolução profissional.",
      pillars: ["estratégia prática", "tecnologia aplicada", "casos e aprendizados", "mentalidade de execução"],
    },
  },
];

function clean(value: string, fallback: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, 500) || fallback;
}

function normalizeList(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b));
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
  const haystack = `${profile.niche_detail} ${profile.expertise_summary} ${profile.extra_notes}`;
  const match = PRESETS.find(({ pattern }) => pattern.test(haystack));
  return { ...DEFAULT_PRESET, ...(match?.preset || {}) };
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
    query: `${source.query}: ${profile.niche_detail}`,
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
        ...(preset.regulated ? ["Revisão humana obrigatória para conteúdo de área regulada."] : []),
      ],
    },
  }, input.instagramAccountId);
}
