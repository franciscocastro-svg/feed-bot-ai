import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveBooleanFeatureFlag } from "@/config/featureFlags";
import {
  editorialApplicationSummary,
  selectedEditorialSources,
  selectedEditorialTopics,
} from "@/lib/editorial-pilot/applyPlan";
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

const profileWith = (
  overrides: Partial<EditorialPilotProfileInput>,
): EditorialPilotProfileInput => ({ ...profile, ...overrides });

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

  it("classifica fofoca sem interpretar 'brasileiras' ou uma menção incidental a leis como Direito", async () => {
    const proposal = await buildFor(accountA, profileWith({
      niche_detail: "Notícias e entretenimento sobre celebridades brasileiras, influenciadores, reality shows, televisão, música e assuntos virais",
      target_audience: "brasileiros de 18 a 44 anos que acompanham celebridades e realities",
      expertise_summary: "curadoria de entretenimento e repercussão nas redes",
      extra_notes: "acompanhar leis de publicidade sem transformar o perfil em conteúdo jurídico",
    }));
    const queries = proposal.source_suggestions.map(({ query }) => query).join(" ");
    const notes = proposal.guardrails.notes.join(" ");

    expect(proposal.guardrails.regulated_domain).toBe(false);
    expect(proposal.strategy.positioning).toContain("entretenimento responsável");
    expect(proposal.strategy.positioning).not.toContain("jurídica");
    expect(proposal.strategy.pillars).toEqual([
      "fatos confirmados", "bastidores e contexto", "repercussão nas redes", "conversa com a audiência",
    ]);
    expect(queries).toContain("entretenimento");
    expect(queries).not.toMatch(/OAB|Anvisa|Banco Central/);
    expect(notes).toContain("distinguir fato, declaração e rumor");
    expect(notes).not.toContain("aconselhamento jurídico individual");
    expect(proposal.topic_suggestions.every(({ title }) => title.includes("brasileiros de 18 a 44 anos"))).toBe(true);
  });

  it("mantém Direito coerente entre estratégia, fontes, público e proteções", async () => {
    const proposal = await buildFor(accountA, profileWith({
      niche_detail: "Advocacia e Direito empresarial para pequenas empresas",
      target_audience: "donos de pequenos negócios",
      expertise_summary: "advogada empresarial com atuação preventiva",
      extra_notes: "explicar legislação sem aconselhamento individual",
    }));
    const queries = proposal.source_suggestions.map(({ query }) => query).join(" ");
    const notes = proposal.guardrails.notes.join(" ");

    expect(proposal.guardrails.regulated_domain).toBe(true);
    expect(proposal.strategy.positioning).toContain("Educação jurídica responsável");
    expect(proposal.strategy.pillars).toContain("direitos explicados");
    expect(queries).toMatch(/OAB|tribunais/);
    expect(queries).not.toMatch(/Anvisa|Banco Central|CVM/);
    expect(notes).toContain("aconselhamento jurídico individual");
    expect(notes).toContain("legislação e a jurisprudência vigentes");
    expect(proposal.topic_suggestions.every(({ title }) => title.includes("donos de pequenos negócios"))).toBe(true);
  });

  it("mantém Saúde coerente entre estratégia, fontes, público e proteções", async () => {
    const proposal = await buildFor(accountA, profileWith({
      niche_detail: "Odontologia preventiva e saúde bucal",
      target_audience: "famílias que buscam prevenção odontológica",
      expertise_summary: "dentista com prática clínica baseada em evidências",
      extra_notes: "educação sem diagnóstico individual",
    }));
    const queries = proposal.source_suggestions.map(({ query }) => query).join(" ");
    const notes = proposal.guardrails.notes.join(" ");

    expect(proposal.guardrails.regulated_domain).toBe(true);
    expect(proposal.strategy.positioning).toContain("Educação em saúde baseada em evidências");
    expect(proposal.strategy.pillars).toContain("educação em saúde");
    expect(queries).toMatch(/Ministério da Saúde|Anvisa/);
    expect(queries).not.toMatch(/OAB|Banco Central|CVM/);
    expect(notes).toContain("diagnóstico, prescrição ou promessa de cura");
    expect(notes).toContain("revisão profissional para conteúdo clínico");
    expect(proposal.topic_suggestions.every(({ title }) => title.includes("famílias que buscam prevenção odontológica"))).toBe(true);
  });

  it("mantém Finanças coerente entre estratégia, fontes, público e proteções", async () => {
    const proposal = await buildFor(accountA, profileWith({
      niche_detail: "Educação financeira e investimentos para iniciantes",
      target_audience: "adultos organizando orçamento e primeiros investimentos",
      expertise_summary: "educador financeiro focado em gestão de risco",
      extra_notes: "não recomendar ativos individualmente",
    }));
    const queries = proposal.source_suggestions.map(({ query }) => query).join(" ");
    const notes = proposal.guardrails.notes.join(" ");

    expect(proposal.guardrails.regulated_domain).toBe(true);
    expect(proposal.strategy.positioning).toContain("Educação financeira clara");
    expect(proposal.strategy.pillars).toContain("gestão de risco");
    expect(queries).toMatch(/Banco Central|CVM/);
    expect(queries).not.toMatch(/OAB|Anvisa/);
    expect(notes).toContain("promessa de rentabilidade");
    expect(notes).toContain("riscos, data e contexto");
    expect(proposal.topic_suggestions.every(({ title }) => title.includes("adultos organizando orçamento"))).toBe(true);
  });

  it("mantém a feature flag desligada por padrão", () => {
    expect(resolveBooleanFeatureFlag(undefined)).toBe(false);
    expect(resolveBooleanFeatureFlag("false")).toBe(false);
    expect(resolveBooleanFeatureFlag(" TRUE ")).toBe(true);
    expect(resolveBooleanFeatureFlag(true)).toBe(true);
  });

  it("mantém a análise sem escrita e exige confirmação explícita para aplicar", () => {
    const componentPath = resolve(
      process.cwd(),
      "src/components/editorial-pilot/EditorialPilotPreview.tsx",
    );
    const source = readFileSync(componentPath, "utf8");

    expect(source).toContain("A análise não altera sua conta.");
    expect(source).toContain("Revisar e aplicar plano");
    expect(source).toContain("Confirmar aplicação");
    expect(source).toContain('supabase.functions.invoke("discover-rss"');
    expect(source).not.toContain(".from(");
    expect(source).not.toContain(".rpc(");
  });

  it("envia somente fontes válidas e selecionadas para a aplicação", async () => {
    const proposal = await buildFor(accountA);
    const candidates = [
      {
        name: "Fonte válida",
        url: "https://example.com/feed.xml",
        source_kind: "rss" as const,
        valid: true,
        quality_score: 87.6,
      },
      {
        name: "Fonte rejeitada",
        url: "https://invalid.example/feed.xml",
        source_kind: "rss" as const,
        valid: false,
      },
    ];

    expect(selectedEditorialSources(candidates, candidates.map(({ url }) => url))).toEqual([
      expect.objectContaining({
        name: "Fonte válida",
        url: "https://example.com/feed.xml",
        quality_score: 88,
      }),
    ]);
    expect(editorialApplicationSummary(
      proposal,
      candidates,
      [candidates[0].url],
      [proposal.topic_suggestions[0].client_ref],
    ).canApply).toBe(true);
  });

  it("preserva audiência e voz nas pautas selecionadas", async () => {
    const proposal = await buildFor(accountA);
    const selected = selectedEditorialTopics(proposal, [proposal.topic_suggestions[0].client_ref]);

    expect(selected).toEqual([
      expect.objectContaining({
        client_ref: proposal.topic_suggestions[0].client_ref,
        target_audience: proposal.strategy.audience,
        tone: proposal.strategy.voice,
      }),
    ]);
  });

  it("protege a aplicação no servidor com validação e RPC transacional idempotente", () => {
    const edge = readFileSync(resolve(process.cwd(), "supabase/functions/discover-rss/index.ts"), "utf8");
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260801170000_editorial_pilot_phase_2a.sql"),
      "utf8",
    );

    expect(edge).toContain("no_valid_sources");
    expect(edge).toContain('"apply_editorial_pilot_proposal"');
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("editorial_pilot_application_unique");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("WHERE account.id = _account_id");
    expect(migration).toContain("ON CONFLICT (source_id, instagram_account_id) DO NOTHING");
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
