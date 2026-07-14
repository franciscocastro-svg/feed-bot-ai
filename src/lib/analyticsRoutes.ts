const TRACKED_PUBLIC_PATHS = new Set([
  "/",
  "/auth",
  "/pricing",
  "/terms",
  "/privacy",
  "/data-deletion",
]);

export function sanitizeAnalyticsPath(rawPath: string): string | null {
  try {
    const pathname = new URL(rawPath, "https://fluxifeed.com").pathname;
    return TRACKED_PUBLIC_PATHS.has(pathname) ? pathname : null;
  } catch {
    return null;
  }
}

export function shouldOfferAnalyticsConsent(pathname: string): boolean {
  return sanitizeAnalyticsPath(pathname) !== null;
}
