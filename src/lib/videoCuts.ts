const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function youtubeVideoId(value: string) {
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol)) return null;
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    let id = "";
    if (host === "youtu.be") {
      id = url.pathname.split("/").filter(Boolean)[0] || "";
    } else if (["youtube.com", "m.youtube.com", "music.youtube.com"].includes(host)) {
      if (url.pathname === "/watch") id = url.searchParams.get("v") || "";
      else {
        const match = url.pathname.match(/^\/(?:shorts|live|embed)\/([^/?#]+)/i);
        id = match?.[1] || "";
      }
    }
    return YOUTUBE_VIDEO_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function normalizeYoutubeUrl(value: string) {
  const id = youtubeVideoId(value);
  return id ? `https://www.youtube.com/watch?v=${id}` : null;
}

export function isSupportedYoutubeUrl(value: string) {
  return Boolean(normalizeYoutubeUrl(value));
}

export function videoCutRequestBounds(input: {
  used?: number | null;
  reserved?: number | null;
  limit?: number | null;
  maxPerJob?: number | null;
  formatsCount?: number | null;
}) {
  const used = Math.max(0, Number(input.used ?? 0));
  const reserved = Math.max(0, Number(input.reserved ?? 0));
  const total = used + reserved;
  const limit = Number(input.limit ?? 0);
  const maxPerJob = Math.max(0, Math.min(5, Number(input.maxPerJob ?? 5)));
  const formatsCount = Math.max(1, Math.min(3, Number(input.formatsCount ?? 1)));
  const remaining = limit < 0 ? Number.POSITIVE_INFINITY : Math.max(0, limit - total);
  // Cada corte gasta 1 crédito por formato escolhido.
  const remainingSuggestions =
    remaining === Number.POSITIVE_INFINITY
      ? Number.POSITIVE_INFINITY
      : Math.floor(remaining / formatsCount);
  const maxRequest = Math.max(
    0,
    Math.min(maxPerJob, remainingSuggestions === Number.POSITIVE_INFINITY ? maxPerJob : remainingSuggestions),
  );

  return { used, reserved, total, limit, remaining, maxPerJob, maxRequest, formatsCount };
}

export function formatCutTime(seconds?: number | null) {
  const value = Math.max(0, Math.floor(Number(seconds ?? 0)));
  const minutes = Math.floor(value / 60);
  const secs = value % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export function splitHashtags(value?: string | string[] | null) {
  if (Array.isArray(value)) return value.map((tag) => tag.trim()).filter(Boolean);
  return String(value || "")
    .split(/[,\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`));
}

export type ViralBadgeTone = "high" | "mid" | "low" | "unknown";

export function viralBadgeTone(score?: number | null): ViralBadgeTone {
  if (score == null || Number.isNaN(Number(score))) return "unknown";
  const num = Number(score);
  if (num >= 75) return "high";
  if (num >= 50) return "mid";
  return "low";
}

export function viralBadgeLabel(score?: number | null) {
  const tone = viralBadgeTone(score);
  if (tone === "unknown") return "Sem score";
  if (tone === "high") return `🔥 Viral ${score}`;
  if (tone === "mid") return `⚡ Bom ${score}`;
  return `Fraco ${score}`;
}

export const CUT_FORMAT_OPTIONS: Array<{ value: "reels" | "feed_square" | "feed_portrait"; label: string; description: string }> = [
  { value: "reels", label: "Reels / Stories", description: "9:16 vertical" },
  { value: "feed_portrait", label: "Feed vertical", description: "4:5" },
  { value: "feed_square", label: "Feed quadrado", description: "1:1" },
];

export type CutPresetKey = "viral" | "clean" | "podcast" | "product" | "highlights" | "custom";

export const CUT_PRESET_OPTIONS: Array<{
  value: CutPresetKey;
  label: string;
  description: string;
  subtitleStyle: "classic" | "neon" | "karaoke" | "clean" | "bold";
  hookEnabled: boolean;
  removeSilences: boolean;
  zoomEffect: boolean;
}> = [
  { value: "viral", label: "Viral dinâmico", description: "Gancho forte, cortes rápidos e palavras destacadas.", subtitleStyle: "bold", hookEnabled: true, removeSilences: true, zoomEffect: true },
  { value: "clean", label: "Clean profissional", description: "Visual discreto para autoridade, aulas e marcas.", subtitleStyle: "clean", hookEnabled: false, removeSilences: true, zoomEffect: false },
  { value: "podcast", label: "Podcast / entrevista", description: "Preserva respostas completas e centraliza quem fala.", subtitleStyle: "classic", hookEnabled: true, removeSilences: true, zoomEffect: false },
  { value: "product", label: "Produto / anúncio", description: "Problema, benefício, demonstração e chamada para ação.", subtitleStyle: "neon", hookEnabled: true, removeSilences: true, zoomEffect: true },
  { value: "highlights", label: "Melhores momentos", description: "Energia, reação, humor e picos emocionais.", subtitleStyle: "karaoke", hookEnabled: true, removeSilences: false, zoomEffect: true },
  { value: "custom", label: "Prompt personalizado", description: "Você orienta o que a IA deve procurar no vídeo.", subtitleStyle: "classic", hookEnabled: true, removeSilences: true, zoomEffect: false },
];
