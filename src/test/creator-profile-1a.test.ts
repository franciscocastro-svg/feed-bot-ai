import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertCreatorProfileCompliance,
  creatorCaptionExtras,
  creatorProfileFingerprint,
  creatorProfilePrompt,
  findForbiddenCreatorTerm,
} from "../../supabase/functions/_shared/creator-profile";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const migration = read("supabase/migrations/20260717143000_creator_profile_1a.sql");
const profileUi = read("src/pages/dashboard/CreatorProfile.tsx");
const app = read("src/App.tsx");
const featureFlags = read("src/config/featureFlags.ts");
const processNews = read("supabase/functions/process-news/index.ts");
const generateTopic = read("supabase/functions/generate-from-topic/index.ts");
const generatePrompt = read("supabase/functions/generate-from-prompt/index.ts");

const profile = {
  instagram_account_id: "account-a",
  niche_detail: "educação financeira para iniciantes",
  target_audience: "jovens que estão organizando o primeiro orçamento",
  voice_tone: "didático, direto e acolhedor",
  expertise_summary: "educador financeiro há dez anos",
  signature_phrases: ["Dinheiro simples, decisão consciente."],
  forbidden_words: ["aposta milagrosa", "política partidária"],
  cta_style: "Pergunte qual dúvida o leitor quer ver respondida.",
  example_posts: ["Comece pequeno e acompanhe cada avanço."],
  extra_notes: "Nunca prometa enriquecimento rápido.",
};

describe("Perfil do Criador 1A", () => {
  it("builds a bounded, explicit instruction block and stable account fingerprint", () => {
    const prompt = creatorProfilePrompt(profile);
    expect(prompt).toContain("PERFIL DO CRIADOR DESTA CONTA");
    expect(prompt).toContain(profile.voice_tone);
    expect(prompt).toContain(profile.target_audience);
    expect(prompt).toContain("TERMOS/TEMAS PROIBIDOS");
    expect(creatorProfileFingerprint(profile)).toBe(creatorProfileFingerprint({ ...profile }));
    expect(creatorProfileFingerprint(profile)).not.toBe(creatorProfileFingerprint({ ...profile, voice_tone: "formal" }));
  });

  it("enforces forbidden terms accent-insensitively before content is delivered", () => {
    expect(findForbiddenCreatorTerm("Debate sobre POLITICA PARTIDARIA", profile)).toBe("política partidária");
    expect(() => assertCreatorProfileCompliance("Uma aposta milagrosa para enriquecer", profile))
      .toThrow("Conteudo bloqueado pelo Perfil do Criador");
    expect(() => assertCreatorProfileCompliance("Como organizar um orçamento realista", profile)).not.toThrow();
  });

  it("does not confuse a short forbidden term with part of another word", () => {
    const shortTermProfile = { ...profile, forbidden_words: ["IA"] };
    expect(() => assertCreatorProfileCompliance("Uma notícia importante", shortTermProfile)).not.toThrow();
    expect(() => assertCreatorProfileCompliance("Novidades sobre IA generativa", shortTermProfile)).toThrow();
  });

  it("adds only the signature deterministically and keeps CTA as prompt guidance", () => {
    expect(creatorCaptionExtras(profile)).toEqual([
      "Dinheiro simples, decisão consciente.",
    ]);
    expect(creatorProfilePrompt(profile)).toContain("apenas referencia de tom");
    expect(creatorProfilePrompt(profile)).toContain("Nao inclua CTA");
  });

  it("isolates profiles by account and protects every mutation with owner-checked RPCs", () => {
    expect(migration).toContain("uq_creator_profiles_global");
    expect(migration).toContain("uq_creator_profiles_account");
    expect(migration).toContain("WHERE id = _account_id AND user_id = owner_id");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = public, pg_catalog");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.save_creator_profile_for_account(uuid, jsonb) FROM PUBLIC, anon");
    expect(migration).toContain("GRANT SELECT ON public.creator_profiles TO authenticated");
  });

  it("makes the profile available to customers and exposes account inheritance clearly", () => {
    expect(app).toContain('<Route path="creator-profile" element={<CreatorProfile />} />');
    expect(app).not.toContain('<Route path="creator-profile" element={<AdminOnlyRoute>');
    expect(featureFlags).not.toContain('"/dashboard/creator-profile"');
    expect(profileUi).toContain("Perfil geral (herança)");
    expect(profileUi).toContain("Herdando o perfil geral");
    expect(profileUi).toContain("save_creator_profile_for_account");
    expect(profileUi).toContain("reset_creator_profile_for_account");
  });

  it("integrates the effective account profile in automatic news, topics and one-off posts", () => {
    for (const source of [processNews, generateTopic, generatePrompt]) {
      expect(source).toContain("loadEffectiveCreatorProfile");
      expect(source).toContain("assertCreatorProfileCompliance");
    }
    expect(processNews).toContain("creatorProfileFingerprint");
    expect(processNews).toContain("creatorCaptionExtras");
    expect(processNews).toContain('status: "rejected"');
    expect(generatePrompt).toContain('.eq("user_id", user.id)');
  });
});
