import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  ANALYTICS_CONSENT_CHANGED_EVENT,
  getAnalyticsConsent,
  type AnalyticsConsent,
} from "@/lib/analyticsConsent";
import { sanitizeAnalyticsPath } from "@/lib/analyticsRoutes";
import { revokeGoogleAnalyticsConsent, trackGooglePageView } from "@/lib/googleAnalytics";
import { revokeMetaPixelConsent, trackMetaPageView } from "@/lib/metaPixel";

export function AnalyticsTracker() {
  const location = useLocation();
  const [consent, setConsent] = useState<AnalyticsConsent>(() => getAnalyticsConsent());
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    const onConsentChanged = () => setConsent(getAnalyticsConsent());
    window.addEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, onConsentChanged);
    return () => window.removeEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, onConsentChanged);
  }, []);

  useEffect(() => {
    if (consent !== "granted") {
      lastTrackedPath.current = null;
      revokeGoogleAnalyticsConsent();
      revokeMetaPixelConsent();
      return;
    }

    const pagePath = sanitizeAnalyticsPath(location.pathname);
    if (!pagePath) {
      lastTrackedPath.current = null;
      return;
    }
    if (lastTrackedPath.current === pagePath) return;

    trackGooglePageView(pagePath);
    trackMetaPageView();
    lastTrackedPath.current = pagePath;
  }, [consent, location.pathname]);

  return null;
}
