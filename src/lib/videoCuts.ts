export function isSupportedYoutubeUrl(value: string) {
  try {
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol)) return false;
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    return host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be";
  } catch {
    return false;
  }
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
