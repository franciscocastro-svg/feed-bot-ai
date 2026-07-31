import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveBooleanFeatureFlag } from "@/config/featureFlags";
import {
  buildEditorialPilotProposal,
  type EditorialPilotProfileInput,
} from "@/lib/editorial-pilot/buildProposal";
import {
  editorialPilotProposalSchema,
  parseEditorialPilotProposal,
} from "@/lib/editorial-pilot/schema";

const accountA = {
  id: "11111111-1111-4111-8111-111111111111",
  username: "empresa_a",
};

const accountB = {
  id: "22222222-2222-4222-8222-222222222222",
  username: "empresa_b",
};

const profile: EditorialPilotProfileInput = {
  niche_detail: "Direito empresarial para pequenas empresas",
  target_audience: "donos de pequenos negócios",
  voice_tone: "claro e responsável",
  expertise_summary: "advogado empresarial com experiência preventiva",
  signature_phrases: ["Decida com clareza."],
  forbidden_words: ["garantia de resultado"],
  cta_style: "convide a salvar o conteúdo",
  extra_notes: "não oferecer aconselhamento individual",
  news_format_preference: "automatic",
};

const buildFor = (
  account: typeof accountA,
  profileOverride: EditorialPilotProfileInput = profile,
) =>
  buildEditorialPilotProposal({
    instagramAccountId: account.id,
    instagramUsername: account.username,
    profile: profileOverride,
    now: new Date("2026-07-31T12:00:00.000Z"),
  });

describe("Piloto Editorial Inteligente — prévia local", () => {
  it("monta uma proposta versionada, válida e isolada pela conta escolhida", async () => {
    const proposal = await buildFor(accountA);

    expect(proposal.schema_version).toBe("editorial-pilot/v1");
    expect(proposal.mode).toBe("preview");
    expect(proposal.instagram).toMatchObject({
      account_id: accountA.id,
      username: accountA.username,
    });
    expect(Object.values(proposal.content_mix).reduce((sum, percentage) => sum + percentage, 0)).toBe(
      100,
    );
    expect(() => editorialPilotProposalSchema.parse(proposal)).not.toThrow();
    expect(parseEditorialPilotProposal(proposal, accountA.id)).toEqual(proposal);
  });

  it("rejeita uma proposta quando a soma do mix editorial não é 100", async () => {
    const proposal = await buildFor(accountA);
    const invalid = structuredClone(proposal);
    invalid.content_mix.educational = 1;

    expect(() => editorialPilotProposalSchema.parse(invalid)).toThrow();
  });

  it("rejeita o uso da proposta em outro Instagram", async () => {
    const proposal = await buildFor(accountA);

    expect(() => parseEditorialPilotProposal(proposal, accountB.id)).toThrow(
      "A proposta não pertence à conta Instagram selecionada.",
    );
  });

  it("produz identidade e proposta diferentes para contas diferentes", async () => {
    const [proposalA, proposalB] = await Promise.all([
      buildFor(accountA),
      buildFor(accountB),
    ]);

    expect(proposalA.instagram.profile_fingerprint).not.toBe(
      proposalB.instagram.profile_fingerprint,
    );
    expect(proposalA.proposal_id).not.toBe(proposalB.proposal_id);
  });

  it("ativa os cuidados editoriais para áreas reguladas", async () => {
    const proposal = await buildFor(accountA);

    expect(proposal.guardrails.regulated_domain).toBe(true);
    expect(proposal.guardrails.source_required).toBe(true);
    expect(proposal.guardrails.human_review_required).toBe(true);
  });

  it("mantém a feature flag desligada por padrão", () => {
    expect(resolveBooleanFeatureFlag(undefined)).toBe(false);
    expect(resolveBooleanFeatureFlag("false")).toBe(false);
    expect(resolveBooleanFeatureFlag(" TRUE ")).toBe(true);
    expect(resolveBooleanFeatureFlag(true)).toBe(true);
  });

  it("mantém o componente de prévia sem operações externas ou persistência", () => {
    const componentPath = resolve(
      process.cwd(),
      "src/components/editorial-pilot/EditorialPilotPreview.tsx",
    );
    const source = readFileSync(componentPath, "utf8");

    expect(source).toContain(
      "Esta prévia não cria nem altera fontes, pautas, configurações, filas ou publicações.",
    );
    for (const forbidden of ["supabase", ".from(", ".rpc(", ".invoke(", "fetch("]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("exibe a prévia apenas com a flag ativa e uma conta específica selecionada", () => {
    const profilePath = resolve(process.cwd(), "src/pages/dashboard/CreatorProfile.tsx");
    const source = readFileSync(profilePath, "utf8");

    expect(source).toContain("editorialPilotPreviewEnabled && selectedInstagramAccount");
    expect(source).toContain("account={selectedInstagramAccount}");
  });

  it("documenta a feature flag como desativada", () => {
    const envPath = resolve(process.cwd(), ".env.example");
    const source = readFileSync(envPath, "utf8");

    expect(source).toContain("VITE_FEATURE_EDITORIAL_PILOT_PREVIEW=false");
  });
});
