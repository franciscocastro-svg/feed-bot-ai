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
}) {
  const used = Math.max(0, Number(input.used ?? 0));
  const reserved = Math.max(0, Number(input.reserved ?? 0));
  const total = used + reserved;
  const limit = Number(input.limit ?? 0);
  const maxPerJob = Math.max(0, Math.min(5, Number(input.maxPerJob ?? 5)));
  const remaining = limit < 0 ? Number.POSITIVE_INFINITY : Math.max(0, limit - total);
  const maxRequest = Math.max(0, Math.min(maxPerJob, remaining === Number.POSITIVE_INFINITY ? maxPerJob : remaining));

  return { used, reserved, total, limit, remaining, maxPerJob, maxRequest };
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
