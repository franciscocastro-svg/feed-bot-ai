import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  LanguageProvider,
  UI_LANGUAGE_STORAGE_KEY,
  useLanguage,
} from "@/contexts/LanguageContext";

function LanguageHarness() {
  const { language, setLanguage, t } = useLanguage();
  const journeyLabels = [
    "Entrar",
    "Digite o código",
    "Visão geral",
    "Contas Instagram",
    "Notícias",
    "Agendar publicação",
    "Insights do Instagram",
    "Configurações",
  ];

  return (
    <div>
      <output data-testid="language">{language}</output>
      <button type="button" onClick={() => setLanguage("en-US")}>English</button>
      {journeyLabels.map((label) => <span key={label}>{t(label)}</span>)}
    </div>
  );
}

describe("interface language", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.lang = "pt-BR";
  });

  it("uses Brazilian Portuguese by default and persists only in local storage", () => {
    render(<LanguageProvider><LanguageHarness /></LanguageProvider>);

    expect(screen.getByTestId("language")).toHaveTextContent("pt-BR");
    expect(screen.getByText("Contas Instagram")).toBeInTheDocument();
    expect(window.localStorage.getItem(UI_LANGUAGE_STORAGE_KEY)).toBe("pt-BR");

    fireEvent.click(screen.getByRole("button", { name: "English" }));

    expect(screen.getByTestId("language")).toHaveTextContent("en-US");
    expect(window.localStorage.getItem(UI_LANGUAGE_STORAGE_KEY)).toBe("en-US");
    expect(document.documentElement.lang).toBe("en-US");
  });

  it("translates every Meta Review journey without changing product data", () => {
    window.localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, "en-US");
    render(<LanguageProvider><LanguageHarness /></LanguageProvider>);

    for (const label of [
      "Sign in",
      "Enter the code",
      "Overview",
      "Instagram Accounts",
      "News",
      "Schedule publication",
      "Instagram Insights",
      "Settings",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("keeps language selection local and covers every Meta Review interface journey", () => {
    const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");
    const settings = read("src/pages/dashboard/Settings.tsx");
    const languageContext = read("src/contexts/LanguageContext.tsx");

    expect(settings).toContain('id="interface-language"');
    expect(settings).toContain('<SelectItem value="pt-BR">Português (Brasil)</SelectItem>');
    expect(settings).toContain('<SelectItem value="en-US">English</SelectItem>');
    expect(languageContext).toContain('const STORAGE_KEY = "fluxfeed.ui-language"');
    expect(languageContext).not.toContain("supabase");

    for (const file of [
      "src/pages/Auth.tsx",
      "src/pages/ForgotPassword.tsx",
      "src/pages/ResetPassword.tsx",
      "src/pages/VerifyEmail.tsx",
      "src/components/DashboardLayout.tsx",
      "src/pages/dashboard/Accounts.tsx",
      "src/pages/dashboard/AccountSettings.tsx",
      "src/pages/dashboard/News.tsx",
      "src/pages/dashboard/Scheduled.tsx",
      "src/pages/dashboard/Insights.tsx",
      "src/pages/dashboard/Settings.tsx",
    ]) {
      expect(read(file), `${file} must use the interface language`).toContain("useLanguage");
    }
  });
});
