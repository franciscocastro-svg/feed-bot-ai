import { hasAnalyticsConsent } from "@/lib/analyticsConsent";
import { sanitizeAnalyticsPath } from "@/lib/analyticsRoutes";

const DEFAULT_GOOGLE_ANALYTICS_ID = "G-0PP4T02MH7";
const GOOGLE_ANALYTICS_SCRIPT_ID = "fluxifeed-google-analytics";

type GtagFn = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: GtagFn;
  }
}

const deniedConsent = {
  ad_storage: "denied",
  analytics_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
};

const getGoogleAnalyticsId = () => {
  const configured = import.meta.env.VITE_GOOGLE_ANALYTICS_ID;
  const candidate = typeof configured === "string" && configured.trim()
    ? configured.trim()
    : DEFAULT_GOOGLE_ANALYTICS_ID;
  return /^G-[A-Z0-9]+$/i.test(candidate) ? candidate : "";
};

let initializedMeasurementId: string | null = null;

function createGtag(): GtagFn {
  window.dataLayer = window.dataLayer || [];
  if (window.gtag) return window.gtag;
  window.gtag = (...args: unknown[]) => {
    window.dataLayer?.push(args);
  };
  return window.gtag;
}

export function initGoogleAnalytics(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined" || !hasAnalyticsConsent()) return false;

  const measurementId = getGoogleAnalyticsId();
  if (!measurementId) return false;

  const gtag = createGtag();
  if (initializedMeasurementId !== measurementId) {
    gtag("consent", "default", deniedConsent);
    gtag("consent", "update", {
      ...deniedConsent,
      analytics_storage: "granted",
    });
    gtag("js", new Date());
    gtag("config", measurementId, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
    initializedMeasurementId = measurementId;
  }

  if (!document.getElementById(GOOGLE_ANALYTICS_SCRIPT_ID)) {
    const script = document.createElement("script");
    script.id = GOOGLE_ANALYTICS_SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    document.head.appendChild(script);
  }

  return true;
}

export function trackGooglePageView(rawPath: string) {
  const pagePath = sanitizeAnalyticsPath(rawPath);
  if (!pagePath || !initGoogleAnalytics()) return;
  window.gtag?.("event", "page_view", {
    page_path: pagePath,
    page_location: `${window.location.origin}${pagePath}`,
  });
}

export function revokeGoogleAnalyticsConsent() {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("consent", "update", deniedConsent);
}
