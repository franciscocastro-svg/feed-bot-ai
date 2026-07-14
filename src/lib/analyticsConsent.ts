export type AnalyticsConsent = "granted" | "denied" | null;

export const ANALYTICS_CONSENT_STORAGE_KEY = "fluxifeed.analytics-consent.v1";
export const ANALYTICS_CONSENT_CHANGED_EVENT = "fluxifeed:analytics-consent-changed";
export const ANALYTICS_CONSENT_PREFERENCES_EVENT = "fluxifeed:analytics-consent-preferences";

let memoryConsent: AnalyticsConsent = null;

export function getAnalyticsConsent(): AnalyticsConsent {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY);
    return stored === "granted" || stored === "denied" ? stored : null;
  } catch {
    return memoryConsent;
  }
}

export function hasAnalyticsConsent(): boolean {
  return getAnalyticsConsent() === "granted";
}

export function setAnalyticsConsent(consent: Exclude<AnalyticsConsent, null>) {
  if (typeof window === "undefined") return;
  memoryConsent = consent;
  try {
    window.localStorage.setItem(ANALYTICS_CONSENT_STORAGE_KEY, consent);
  } catch {
    // A escolha continua válida nesta interação mesmo se o navegador bloquear storage.
  }
  window.dispatchEvent(new CustomEvent(ANALYTICS_CONSENT_CHANGED_EVENT, { detail: consent }));
}

export function openAnalyticsConsentPreferences() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(ANALYTICS_CONSENT_PREFERENCES_EVENT));
}
