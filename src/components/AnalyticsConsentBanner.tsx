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

  if (!shouldOfferAnalyticsConsent(location.pathname) || (consent !== null && !preferencesOpen)) return null;

  return (
    <section
      role="dialog"
      aria-labelledby="analytics-consent-title"
      aria-describedby="analytics-consent-description"
      className="fixed inset-x-3 bottom-3 z-[100] mx-auto max-h-[calc(100vh-1.5rem)] max-w-3xl overflow-y-auto rounded-2xl border border-border bg-background/95 p-4 shadow-2xl backdrop-blur supports-[height:100dvh]:max-h-[calc(100dvh-1.5rem)] supports-[padding:max(0px)]:bottom-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-5"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1.5">
          <h2 id="analytics-consent-title" className="font-semibold text-foreground">Sua privacidade importa</h2>
          <p id="analytics-consent-description" className="text-sm leading-relaxed text-muted-foreground">
            Usamos Google Analytics e Meta Pixel somente com sua autorização para medir páginas públicas e melhorar nossas campanhas. Cookies essenciais continuam funcionando normalmente.
          </p>
          <Link className="inline-block text-xs font-medium text-primary underline underline-offset-4" to="/privacy">
            Ver Política de Privacidade
          </Link>
        </div>
        <div className="grid shrink-0 grid-cols-1 gap-2 sm:grid-cols-2">
          <Button variant="outline" onClick={() => setAnalyticsConsent("denied")}>Recusar opcionais</Button>
          <Button onClick={() => setAnalyticsConsent("granted")}>Aceitar analíticos</Button>
        </div>
      </div>
    </section>
  );
}
