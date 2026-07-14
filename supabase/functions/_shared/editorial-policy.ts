export const MIN_POST_INTERVAL_MINUTES = 10;
export const EDITORIAL_PREPARATION_LEAD_MINUTES = 20;

const URGENT_TERMS = /\b(urgente|exclusivo|bombou|chocante|polêmica|polemica|escândalo|escandalo|revela|revelad[oa]|surpreende|surpreendente|inédit[oa]|inedit[oa]|recorde|histórico|historico|morre|morreu|morte|prisão|prisao|preso|presa|vaza|vazou|confirma|confirmad[oa]|anuncia|anunciad[oa]|novo|nova|primeira vez|nunca visto|impressionante|viral)\b/gi;

export type EditorialNews = {
  id?: string;
  published_at?: string | null;
  original_title?: string | null;
  rewritten_title?: string | null;
  original_content?: string | null;
  rewritten_summary?: string | null;
  original_image_url?: string | null;
  generated_image_url?: string | null;
  generated_cover_url?: string | null;
  generated_video_url?: string | null;
};

export function resolveGlobalPostInterval(value: unknown): number {
  const parsed = Number(value);
  return Math.max(
    MIN_POST_INTERVAL_MINUTES,
    Number.isFinite(parsed) && parsed > 0 ? parsed : MIN_POST_INTERVAL_MINUTES,
  );
}

export function editorialNewsScore(news: EditorialNews, nowMs = Date.now()): number {
  const publishedMs = news.published_at ? new Date(news.published_at).getTime() : Number.NaN;
  const ageMinutes = Number.isFinite(publishedMs)
    ? Math.max(0, (nowMs - publishedMs) / 60_000)
    : 180;
  // Recência domina a fila: perde dois pontos por minuto e zera após 90 min.
  const recencyScore = Math.max(0, 180 - ageMinutes * 2);
  const title = String(news.rewritten_title || news.original_title || "");
  const content = String(news.rewritten_summary || news.original_content || "");
  const titleScore = title.length >= 40 && title.length <= 100 ? 30 : Math.min(20, title.length / 5);
  const mediaScore = news.original_image_url || news.generated_image_url || news.generated_cover_url || news.generated_video_url ? 25 : 0;
  const bodyScore = Math.min(20, content.length / 200);
  const urgentMatches = `${title} ${content}`.match(URGENT_TERMS)?.length || 0;
  const urgentScore = Math.min(40, urgentMatches * 10);
  return recencyScore + titleScore + mediaScore + bodyScore + urgentScore;
}

export function compareEditorialNews(a: EditorialNews, b: EditorialNews, nowMs = Date.now()): number {
  const byScore = editorialNewsScore(b, nowMs) - editorialNewsScore(a, nowMs);
  if (byScore !== 0) return byScore;
  const publishedA = a.published_at ? new Date(a.published_at).getTime() : 0;
  const publishedB = b.published_at ? new Date(b.published_at).getTime() : 0;
  const byRecency = publishedB - publishedA;
  if (byRecency !== 0) return byRecency;
  return String(a.id || "").localeCompare(String(b.id || ""));
}

export function shouldPrepareNextPost(
  lastPostedAtMs: number | null | undefined,
  intervalMinutes: number,
  nowMs = Date.now(),
  leadMinutes = EDITORIAL_PREPARATION_LEAD_MINUTES,
): boolean {
  if (!lastPostedAtMs || !Number.isFinite(lastPostedAtMs)) return true;
  const safeInterval = resolveGlobalPostInterval(intervalMinutes);
  const nextAllowedAt = lastPostedAtMs + safeInterval * 60_000;
  return nowMs >= nextAllowedAt - Math.max(1, leadMinutes) * 60_000;
}
