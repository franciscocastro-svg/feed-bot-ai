export const DEFAULT_SCHEDULE_REFRESH_MS = 30_000;
export const PREPARING_CAROUSEL_REFRESH_MS = 5_000;

type ScheduledPostLike = {
  status?: unknown;
  news_items?: unknown;
};

type NewsItemLike = {
  content_format?: unknown;
  editorial_ready?: unknown;
};

function relatedNewsItem(value: unknown): NewsItemLike | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && typeof candidate === "object" ? candidate as NewsItemLike : null;
}

export function hasPreparingScheduledCarousel(posts: ScheduledPostLike[]): boolean {
  return posts.some((post) => {
    const news = relatedNewsItem(post.news_items);
    return (
      post.status === "scheduled" &&
      news?.content_format === "carrossel" &&
      news.editorial_ready !== true
    );
  });
}

export function scheduledRefreshInterval(posts: ScheduledPostLike[]): number {
  return hasPreparingScheduledCarousel(posts)
    ? PREPARING_CAROUSEL_REFRESH_MS
    : DEFAULT_SCHEDULE_REFRESH_MS;
}
