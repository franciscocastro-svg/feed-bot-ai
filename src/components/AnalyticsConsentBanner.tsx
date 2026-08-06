import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ANALYTICS_CONSENT_CHANGED_EVENT,
  ANALYTICS_CONSENT_PREFERENCES_EVENT,
  getAnalyticsConsent,
  setAnalyticsConsent,
  type AnalyticsConsent,
} from "@/lib/analyticsConsent";
import { shouldOfferAnalyticsConsent } from "@/lib/analyticsRoutes";

export function AnalyticsConsentBanner() {
  const location = useLocation();
  const [consent, setConsentState] = useState<AnalyticsConsent>(() => getAnalyticsConsent());
  const [preferencesOpen, setPreferencesOpen] = useState(false);

  useEffect(() => {
    const onConsentChanged = () => {
      setConsentState(getAnalyticsConsent());
      setPreferencesOpen(false);
    };
    const onPreferencesRequested = () => setPreferencesOpen(true);
    window.addEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, onConsentChanged);
    window.addEventListener(ANALYTICS_CONSENT_PREFERENCES_EVENT, onPreferencesRequested);
    return () => {
      window.removeEventListener(ANALYTICS_CONSENT_CHANGED_EVENT, onConsentChanged);
      window.removeEventListener(ANALYTICS_CONSENT_PREFERENCES_EVENT, onPreferencesRequested);
    };
  }, []);

  const visible = shouldOfferAnalyticsConsent(location.pathname) && (consent === null || preferencesOpen);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (visible) {
      document.body.dataset.consentOpen = "true";
    } else {
      delete document.body.dataset.consentOpen;
    }
    return () => {
      if (typeof document !== "undefined") delete document.body.dataset.consentOpen;
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <section
      role="dialog"
      aria-labelledby="analytics-consent-title"
      aria-describedby="analytics-consent-description"
      className="fixed inset-x-0 bottom-0 z-[100] border-t border-border bg-background/95 px-4 py-3 shadow-2xl backdrop-blur supports-[padding:max(0px)]:pb-[max(0.75rem,env(safe-area-inset-bottom))]"
    >
      <div className="container flex flex-col gap-3 px-0 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 id="analytics-consent-title" className="text-sm font-semibold text-foreground">Sua privacidade importa</h2>
          <p id="analytics-consent-description" className="text-xs leading-relaxed text-muted-foreground">
            Usamos analíticos só com sua autorização.{" "}
            <Link className="font-medium text-primary underline underline-offset-4" to="/privacy">
              Política de Privacidade
            </Link>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="outline" className="flex-1 sm:flex-none" onClick={() => setAnalyticsConsent("denied")}>
            Recusar
          </Button>
          <Button size="sm" className="flex-1 sm:flex-none" onClick={() => setAnalyticsConsent("granted")}>
            Aceitar
          </Button>
        </div>
      </div>
    </section>
  );
}
