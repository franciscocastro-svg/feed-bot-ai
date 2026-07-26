import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveContentInstagramAccount } from "../../supabase/functions/_shared/content-account-routing";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Roteamento editorial por Instagram", () => {
  const accounts = [
    { id: "fuxico", username: "fuxico_fala" },
    { id: "tech", username: "franc1sco_de_castro" },
  ];

  it("respeita a conta escolhida e só usa fallback quando existe uma única conta", () => {
    expect(resolveContentInstagramAccount(accounts, "tech")).toBe("tech");
    expect(resolveContentInstagramAccount([accounts[0]], null)).toBe("fuxico");
  });

  it("bloqueia conteúdo sem destino quando há vários perfis", () => {
    expect(() => resolveContentInstagramAccount(accounts, null))
      .toThrow("Escolha a conta Instagram compatível");
    expect(() => resolveContentInstagramAccount(accounts, "inativa"))
      .toThrow("não existe, está inativa");
  });

  it("leva a conta explícita do painel até as duas Edge Functions", () => {
    const topics = read("src/pages/dashboard/Topics.tsx");
    const prompt = read("supabase/functions/generate-from-prompt/index.ts");
    const topic = read("supabase/functions/generate-from-topic/index.ts");
    const autopilot = read("supabase/functions/autopilot/index.ts");
    const sources = read("src/pages/dashboard/Sources.tsx");

    expect(topics).toContain("instagram_account_id: quickAccount");
    expect(topics).toContain("Escolha o Instagram compatível com este conteúdo");
    expect(prompt).toContain("resolveContentInstagramAccount");
    expect(topic).toContain("resolveContentInstagramAccount");
    expect(autopilot).toContain("validIgIds.size === 1");
    expect(sources).toContain("Selecione pelo menos um Instagram");
  });
});
