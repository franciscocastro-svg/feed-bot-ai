import { describe, expect, it } from "vitest";
import {
  googleNewsTopicUrl,
  measureNicheRelevance,
  resolveNicheDiscoveryProfile,
} from "../../supabase/functions/_shared/niche-discovery";
import discoverRssSource from "../../supabase/functions/discover-rss/index.ts?raw";
import sourcesUi from "../pages/dashboard/Sources.tsx?raw";

describe("Qualidade de Fontes 1C", () => {
  it("understands fitness, academia, forex and market aliases", () => {
    expect(resolveNicheDiscoveryProfile("mercado fitness").key).toBe("fitness");
    expect(resolveNicheDiscoveryProfile("academia e musculação").key).toBe("fitness");
    expect(resolveNicheDiscoveryProfile("Forex").key).toBe("forex");
    expect(resolveNicheDiscoveryProfile("XAUUSD").key).toBe("forex");
  });

  it("keeps an unknown niche as a specific search instead of a generic news feed", () => {
    const profile = resolveNicheDiscoveryProfile("Aquarismo sustentável");
    expect(profile.recognized).toBe(false);
    expect(profile.query).toBe("Aquarismo sustentável");
    expect(profile.terms).toContain("aquarismo sustentavel");
    expect(googleNewsTopicUrl(profile.query)).toContain("Aquarismo%20sustent%C3%A1vel");
  });

  it("requires recent preview content to match the requested niche", () => {
    const fitness = resolveNicheDiscoveryProfile("fitness");
    expect(measureNicheRelevance([
      { title: "Treino de musculação melhora a saúde" },
      { title: "Congresso debate orçamento federal" },
    ], fitness)).toMatchObject({ total: 2, matching: 1, relevant: true });
    expect(measureNicheRelevance([
      { title: "Congresso debate orçamento federal" },
    ], fitness).relevant).toBe(false);
  });

  it("recognizes entertainment headlines without requiring a generic category word", () => {
    const entertainment = resolveNicheDiscoveryProfile("fofocas e celebridades");
    expect(measureNicheRelevance([
      { title: "Humorista comenta separação após reality" },
      { title: "Cantora anuncia novo show com ator famoso" },
    ], entertainment)).toMatchObject({ total: 2, matching: 2, relevant: true });
  });

  it("never falls back to generic G1 or UOL feeds for arbitrary text", () => {
    expect(discoverRssSource).not.toContain("G1 Últimas");
    expect(discoverRssSource).not.toContain("UOL Notícias");
    expect(discoverRssSource).toContain("topicSuggestion()");
    expect(discoverRssSource).toContain("allowRelaxedSearch: false");
    expect(discoverRssSource).toContain("measureNicheRelevance");
  });

  it("prioritizes verified entertainment feeds over AI-only suggestions", () => {
    expect(discoverRssSource).toContain("https://revistaquem.globo.com/rss/quem");
    expect(discoverRssSource).toContain("https://www.metropoles.com/entretenimento/feed");
    expect(discoverRssSource).not.toContain("https://rss.uol.com.br/feed/splash.xml");
    expect(discoverRssSource).toContain("[...curatedFeeds(), topicSuggestion(), ...suggestions]");
    expect(discoverRssSource).toContain("categoryTrusted");
  });

  it("shows discovery origin and niche adherence before insertion", () => {
    expect(sourcesUi).toContain("Busca temática");
    expect(sourcesUi).toContain("Catálogo verificado");
    expect(sourcesUi).toContain("Sugestão por IA");
    expect(sourcesUi).toContain("exemplos correspondem ao nicho");
    expect(sourcesUi).toContain("selected_feeds: discoverCandidates");
  });
});
