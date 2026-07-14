import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AnalyticsConsentBanner } from "@/components/AnalyticsConsentBanner";
import {
  ANALYTICS_CONSENT_STORAGE_KEY,
  openAnalyticsConsentPreferences,
  setAnalyticsConsent,
} from "@/lib/analyticsConsent";
import { sanitizeAnalyticsPath, shouldOfferAnalyticsConsent } from "@/lib/analyticsRoutes";
import { trackGooglePageView } from "@/lib/googleAnalytics";
import { trackMetaEvent, trackMetaPageView } from "@/lib/metaPixel";

const GOOGLE_SCRIPT_ID = "fluxifeed-google-analytics";
const META_SCRIPT_ID = "fluxifeed-meta-pixel";

function removeAnalyticsRuntime() {
  document.getElementById(GOOGLE_SCRIPT_ID)?.remove();
  document.getElementById(META_SCRIPT_ID)?.remove();
  delete window.gtag;
  delete window.dataLayer;
  delete window.fbq;
  delete window._fbq;
}

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  window.localStorage.clear();
  removeAnalyticsRuntime();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  removeAnalyticsRuntime();
});

describe("consentimento de analytics", () => {
  it("não carrega Google Analytics nem Meta Pixel antes da escolha", () => {
    trackGooglePageView("/");
    trackMetaPageView();

    expect(document.getElementById(GOOGLE_SCRIPT_ID)).toBeNull();
    expect(document.getElementById(META_SCRIPT_ID)).toBeNull();
    expect(window.gtag).toBeUndefined();
    expect(window.fbq).toBeUndefined();
  });

  it("mantém os dois provedores bloqueados quando a pessoa recusa", () => {
    setAnalyticsConsent("denied");
    trackGooglePageView("/pricing");
    trackMetaPageView();

    expect(window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toBe("denied");
    expect(document.getElementById(GOOGLE_SCRIPT_ID)).toBeNull();
    expect(document.getElementById(META_SCRIPT_ID)).toBeNull();
  });

  it("não dispara Meta Pixel em rota sensível ou URL com parâmetros", () => {
    setAnalyticsConsent("granted");

    window.history.replaceState({}, "", "/verify-email?code=secreto");
    trackMetaEvent("CompleteRegistration", { content_name: "email_verified" });
    expect(document.getElementById(META_SCRIPT_ID)).toBeNull();

    window.history.replaceState({}, "", "/auth?email=pessoa%40exemplo.com");
    trackMetaPageView();
    expect(document.getElementById(META_SCRIPT_ID)).toBeNull();
  });

  it("carrega uma vez após o aceite e mantém publicidade personalizada negada", () => {
    setAnalyticsConsent("granted");
    trackGooglePageView("/pricing?email=privado%40exemplo.com");
    trackMetaPageView();
    trackGooglePageView("/pricing");
    trackMetaPageView();

    const googleScript = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null;
    const metaScript = document.getElementById(META_SCRIPT_ID) as HTMLScriptElement | null;
    expect(googleScript?.src).toContain("G-0PP4T02MH7");
    expect(metaScript?.src).toBe("https://connect.facebook.net/en_US/fbevents.js");
    expect(document.querySelectorAll(`#${GOOGLE_SCRIPT_ID}`)).toHaveLength(1);
    expect(document.querySelectorAll(`#${META_SCRIPT_ID}`)).toHaveLength(1);

    const commands = window.dataLayer as unknown[][];
    expect(commands).toContainEqual([
      "consent",
      "update",
      expect.objectContaining({
        analytics_storage: "granted",
        ad_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied",
      }),
    ]);
    expect(commands).toContainEqual([
      "config",
      "G-0PP4T02MH7",
      expect.objectContaining({
        send_page_view: false,
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
      }),
    ]);
    expect(commands).toContainEqual([
      "event",
      "page_view",
      {
        page_path: "/pricing",
        page_location: `${window.location.origin}/pricing`,
      },
    ]);

    expect(window.fbq?.queue).toContainEqual(["consent", "grant"]);
    expect(window.fbq?.queue).toContainEqual(["track", "PageView"]);
  });

  it("permite recusar, aceitar e reabrir preferências no banner", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AnalyticsConsentBanner />
      </MemoryRouter>,
    );

    expect(screen.getByRole("dialog", { name: "Sua privacidade importa" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Recusar opcionais" }));
    expect(screen.queryByRole("dialog", { name: "Sua privacidade importa" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toBe("denied");

    act(() => openAnalyticsConsentPreferences());
    expect(screen.getByRole("dialog", { name: "Sua privacidade importa" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aceitar analíticos" }));
    expect(window.localStorage.getItem(ANALYTICS_CONSENT_STORAGE_KEY)).toBe("granted");
  });

  it("não exibe o banner dentro do dashboard", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AnalyticsConsentBanner />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("dialog", { name: "Sua privacidade importa" })).not.toBeInTheDocument();
  });
});

describe("rotas permitidas para analytics", () => {
  it("remove query string das páginas públicas", () => {
    expect(sanitizeAnalyticsPath("/auth?email=pessoa%40exemplo.com&next=/dashboard")).toBe("/auth");
    expect(sanitizeAnalyticsPath("https://fluxifeed.com/pricing?coupon=privado")).toBe("/pricing");
  });

  it("bloqueia áreas autenticadas e fluxos sensíveis", () => {
    expect(sanitizeAnalyticsPath("/dashboard")).toBeNull();
    expect(sanitizeAnalyticsPath("/dashboard/news")).toBeNull();
    expect(sanitizeAnalyticsPath("/checkout/return?session_id=secreto")).toBeNull();
    expect(sanitizeAnalyticsPath("/verify-email?code=secreto")).toBeNull();
    expect(sanitizeAnalyticsPath("/forgot-password")).toBeNull();
    expect(shouldOfferAnalyticsConsent("/dashboard")).toBe(false);
  });
});
