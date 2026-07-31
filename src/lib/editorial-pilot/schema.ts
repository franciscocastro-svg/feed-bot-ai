import { z } from "zod";

export const EDITORIAL_PILOT_SCHEMA_VERSION = "editorial-pilot/v1" as const;

const text = z.string().trim().min(1).max(500);
const sourceRef = z.string().regex(/^source-[1-9][0-9]*$/);
const topicRef = z.string().regex(/^topic-[1-9][0-9]*$/);

export const editorialPilotProposalSchema = z.object({
  schema_version: z.literal(EDITORIAL_PILOT_SCHEMA_VERSION),
  mode: z.literal("preview"),
  proposal_id: z.string().regex(/^preview-[a-f0-9]{16}$/),
  generated_at: z.string().datetime(),
  instagram: z.object({
    account_id: z.string().uuid(),
    username: z.string().trim().min(1).max(100),
    profile_fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict(),
  strategy: z.object({
    niche: text,
    audience: text,
    voice: text,
    positioning: text,
    pillars: z.array(text).min(3).max(6),
  }).strict(),
  source_suggestions: z.array(z.object({
    client_ref: sourceRef,
    kind: z.enum(["rss", "site", "person", "topic"]),
    query: text,
    reason: text,
    risk: z.enum(["low", "medium", "high"]),
    requires_review: z.literal(true),
  }).strict()).min(2).max(8),
  topic_suggestions: z.array(z.object({
    client_ref: topicRef,
    title: text,
    pillar: text,
    objective: z.enum(["educar", "engajar", "converter", "autoridade"]),
    formats: z.array(z.enum(["feed", "reel", "story", "carousel"])).min(1),
    frequency_per_week: z.number().int().min(1).max(7),
    source_refs: z.array(sourceRef).min(1),
    reason: text,
  }).strict()).min(3).max(12),
  content_mix: z.object({
    educational: z.number().int().min(0).max(100),
    authority: z.number().int().min(0).max(100),
    engagement: z.number().int().min(0).max(100),
    conversion: z.number().int().min(0).max(100),
  }).strict().refine(
    (mix) => Object.values(mix).reduce((total, value) => total + value, 0) === 100,
    "A distribuição editorial deve totalizar 100%.",
  ),
  cadence: z.object({
    suggested_posts_per_week: z.number().int().min(1).max(21),
    preferred_hours: z.array(z.number().int().min(0).max(23)).min(1).max(8),
  }).strict(),
  guardrails: z.object({
    source_required: z.literal(true),
    regulated_domain: z.boolean(),
    human_review_required: z.literal(true),
    notes: z.array(text).min(1).max(8),
  }).strict(),
}).strict().superRefine((proposal, context) => {
  const sourceRefs = proposal.source_suggestions.map((source) => source.client_ref);
  const topicRefs = proposal.topic_suggestions.map((topic) => topic.client_ref);
  if (new Set(sourceRefs).size !== sourceRefs.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["source_suggestions"], message: "Referências de fontes duplicadas." });
  }
  if (new Set(topicRefs).size !== topicRefs.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["topic_suggestions"], message: "Referências de pautas duplicadas." });
  }
  const knownSources = new Set(sourceRefs);
  proposal.topic_suggestions.forEach((topic, topicIndex) => {
    topic.source_refs.forEach((reference) => {
      if (!knownSources.has(reference)) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ["topic_suggestions", topicIndex, "source_refs"], message: `Fonte desconhecida: ${reference}.` });
      }
    });
  });
  if (new Set(proposal.cadence.preferred_hours).size !== proposal.cadence.preferred_hours.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["cadence", "preferred_hours"], message: "Horários duplicados." });
  }
});

export type EditorialPilotProposal = z.infer<typeof editorialPilotProposalSchema>;

export function parseEditorialPilotProposal(
  candidate: unknown,
  expectedInstagramAccountId?: string,
): EditorialPilotProposal {
  const proposal = editorialPilotProposalSchema.parse(candidate);
  if (expectedInstagramAccountId && proposal.instagram.account_id !== expectedInstagramAccountId) {
    throw new Error("A proposta não pertence à conta Instagram selecionada.");
  }
  return proposal;
}
