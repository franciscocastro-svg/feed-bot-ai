export type CutMode = "traditional" | "subtitled" | "editorial";
export type EditorialFraming = "blur_fit" | "smart_crop" | "contain";

export type EditorialCutConfig = {
  framing: EditorialFraming;
  font_family: string;
  primary_color: string;
  accent_color: string;
  subtitles_enabled: boolean;
};

export type EditorialCutDraft = {
  title: string;
  comment: string;
  startSeconds: number;
  endSeconds: number;
  transcriptText: string;
  subtitleStyle: "none" | "classic" | "neon" | "karaoke" | "clean" | "bold";
  config: EditorialCutConfig;
};

export const EDITORIAL_MIN_DURATION_SECONDS = 20;

export const CUT_MODE_OPTIONS: Array<{
  value: CutMode;
  label: string;
  description: string;
}> = [
  {
    value: "traditional",
    label: "Corte tradicional",
    description: "Vídeo limpo, sem legendas queimadas.",
  },
  {
    value: "subtitled",
    label: "Corte com legendas",
    description: "Formato atual com enquadramento, identidade e legendas sincronizadas.",
  },
  {
    value: "editorial",
    label: "Corte editorial",
    description: "Layout 4:5 ou 9:16 com identidade, título, comentário e vídeo central.",
  },
];

export const DEFAULT_EDITORIAL_CONFIG: EditorialCutConfig = {
  framing: "blur_fit",
  font_family: "Inter",
  primary_color: "#111111",
  accent_color: "#D92FA5",
  subtitles_enabled: true,
};

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function normalizeEditorialConfig(value?: Partial<EditorialCutConfig> | null): EditorialCutConfig {
  const framing = ["blur_fit", "smart_crop", "contain"].includes(String(value?.framing))
    ? value?.framing as EditorialFraming
    : DEFAULT_EDITORIAL_CONFIG.framing;
  return {
    framing,
    font_family: String(value?.font_family || DEFAULT_EDITORIAL_CONFIG.font_family).trim().slice(0, 80) || "Inter",
    primary_color: HEX_COLOR.test(String(value?.primary_color || ""))
      ? String(value?.primary_color)
      : DEFAULT_EDITORIAL_CONFIG.primary_color,
    accent_color: HEX_COLOR.test(String(value?.accent_color || ""))
      ? String(value?.accent_color)
      : DEFAULT_EDITORIAL_CONFIG.accent_color,
    subtitles_enabled: value?.subtitles_enabled !== false,
  };
}

export function validateEditorialDraft(draft: EditorialCutDraft) {
  const title = draft.title.replace(/\s+/g, " ").trim();
  const comment = draft.comment.replace(/\s+/g, " ").trim();
  const startSeconds = Number(draft.startSeconds);
  const endSeconds = Number(draft.endSeconds);
  if (title.length < 4 || title.length > 140) return "O título deve ter entre 4 e 140 caracteres.";
  if (comment.length < 10 || comment.length > 600) return "O comentário deve ter entre 10 e 600 caracteres.";
  if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || startSeconds < 0) return "Informe um trecho válido.";
  const duration = endSeconds - startSeconds;
  if (duration < EDITORIAL_MIN_DURATION_SECONDS || duration > 180) {
    return `O Corte Editorial deve ter entre ${EDITORIAL_MIN_DURATION_SECONDS} e 180 segundos.`;
  }
  return null;
}

export function canScheduleEditorialCut(input: {
  videoUrl?: string | null;
  reviewConfirmedAt?: string | null;
}) {
  return Boolean(input.videoUrl && input.reviewConfirmedAt);
}

export function editorialDraftPayload(draft: EditorialCutDraft) {
  return {
    _title: draft.title.replace(/\s+/g, " ").trim(),
    _editorial_comment: draft.comment.replace(/\s+/g, " ").trim(),
    _start_seconds: Number(draft.startSeconds),
    _end_seconds: Number(draft.endSeconds),
    _transcript_text: draft.transcriptText.replace(/\s+/g, " ").trim() || null,
    _subtitle_style: draft.config.subtitles_enabled ? draft.subtitleStyle : "none",
    _editorial_config: normalizeEditorialConfig(draft.config),
  };
}
