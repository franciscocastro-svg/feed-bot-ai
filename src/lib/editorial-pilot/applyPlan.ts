import type { EditorialPilotProposal } from "./schema";

export type EditorialPilotPreviewItem = {
  title: string;
  url: string;
  published_at?: string | null;
};

export type EditorialPilotDiscoverCandidate = {
  name: string;
  url: string;
  niche?: string;
  source_kind?: "rss" | "topic";
  query?: string | null;
  include_terms?: string[];
  discovery_method?: "ai_rss" | "curated_rss" | "topic_search";
  valid: boolean;
  error?: string | null;
  quality_score?: number;
  relevance?: { total: number; matching: number; ratio: number; relevant: boolean };
  preview?: {
    sample_items?: EditorialPilotPreviewItem[];
    items_count?: number;
  } | null;
};

export function selectedEditorialSources(
  candidates: EditorialPilotDiscoverCandidate[],
  selectedUrls: string[],
) {
  const selected = new Set(selectedUrls);
  return candidates
    .filter((candidate) => candidate.valid && selected.has(candidate.url))
    .map((candidate) => ({
      name: candidate.name,
      url: candidate.url,
      niche: candidate.niche,
      source_kind: candidate.source_kind || "rss",
      query: candidate.query || null,
      include_terms: candidate.include_terms || [],
      discovery_method: candidate.discovery_method || "ai_rss",
      quality_score: Math.max(0, Math.min(100, Math.round(candidate.quality_score || 0))),
      relevance: candidate.relevance,
    }));
}

export function selectedEditorialTopics(
  proposal: EditorialPilotProposal,
  selectedRefs: string[],
) {
  const selected = new Set(selectedRefs);
  return proposal.topic_suggestions
    .filter((topic) => selected.has(topic.client_ref))
    .map((topic) => ({
      client_ref: topic.client_ref,
      title: topic.title,
      pillar: topic.pillar,
      objective: topic.objective,
      formats: topic.formats,
      frequency_per_week: topic.frequency_per_week,
      reason: topic.reason,
      target_audience: proposal.strategy.audience,
      tone: proposal.strategy.voice,
    }));
}

export function editorialApplicationSummary(
  proposal: EditorialPilotProposal,
  candidates: EditorialPilotDiscoverCandidate[],
  selectedUrls: string[],
  selectedTopicRefs: string[],
) {
  const sources = selectedEditorialSources(candidates, selectedUrls);
  const topics = selectedEditorialTopics(proposal, selectedTopicRefs);
  return {
    sources,
    topics,
    canApply: sources.length > 0 && topics.length > 0,
  };
}
