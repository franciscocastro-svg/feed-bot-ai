// Descobre fontes por nicho com catálogo, IA opcional e busca temática determinística.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { previewSource } from "../_shared/source-capture.ts";
import {
  googleNewsTopicUrl,
  measureNicheRelevance,
  resolveNicheDiscoveryProfile,
} from "../_shared/niche-discovery.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type DiscoveryMethod = "ai_rss" | "curated_rss" | "topic_search";

type FeedSuggestion = {
  name: string;
  url: string;
  niche: string;
  source_kind: "rss" | "topic";
  query?: string | null;
  include_terms: string[];
  discovery_method: DiscoveryMethod;
};

function isDuplicateSourceError(error: unknown): boolean {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const text = `${record.code || ""} ${record.message || ""} ${record.details || ""}`.toLowerCase();
  return text.includes("23505") || text.includes("duplicate key") || text.includes("idx_news_sources_unique_active_fingerprint");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    {
      const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: approved } = await adminClient.rpc("is_approved", { _uid: user.id });
      if (approved === false) return new Response(JSON.stringify({ error: "account_not_approved" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { niche, ig_ids, insert, selected_feeds } = await req.json();
    if (!niche || typeof niche !== "string") {
      return new Response(JSON.stringify({ error: "niche required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const targetIgIds: string[] = Array.isArray(ig_ids) ? ig_ids.filter((x: unknown): x is string => typeof x === "string") : [];
    const profile = resolveNicheDiscoveryProfile(niche);

    // Catálogo de fallback de feeds RSS brasileiros conhecidos (usado se IA estiver sem créditos)
    const FALLBACK_FEEDS: Record<string, { name: string; url: string }[]> = {
      tecnologia: [
        { name: "G1 Tecnologia", url: "https://g1.globo.com/rss/g1/tecnologia/" },
        { name: "Tecmundo", url: "https://www.tecmundo.com.br/rss" },
        { name: "Olhar Digital", url: "https://olhardigital.com.br/feed/" },
        { name: "Canaltech", url: "https://canaltech.com.br/rss/" },
      ],
      economia: [
        { name: "G1 Economia", url: "https://g1.globo.com/rss/g1/economia/" },
        { name: "InfoMoney", url: "https://www.infomoney.com.br/feed/" },
        { name: "Exame Economia", url: "https://exame.com/economia/feed/" },
        { name: "Valor Econômico", url: "https://valor.globo.com/rss/" },
      ],
      cripto: [
        { name: "Livecoins", url: "https://livecoins.com.br/feed/" },
        { name: "Cointelegraph BR", url: "https://br.cointelegraph.com/rss" },
        { name: "Portal do Bitcoin", url: "https://portaldobitcoin.uol.com.br/feed/" },
        { name: "InfoMoney Cripto", url: "https://www.infomoney.com.br/cripto/feed/" },
      ],
      esportes: [
        { name: "GE Globo", url: "https://ge.globo.com/rss/ge/" },
        { name: "UOL Esporte", url: "https://rss.uol.com.br/feed/esporte.xml" },
        { name: "Lance!", url: "https://www.lance.com.br/feed" },
      ],
      politica: [
        { name: "G1 Política", url: "https://g1.globo.com/rss/g1/politica/" },
        { name: "Poder360", url: "https://www.poder360.com.br/feed/" },
        { name: "UOL Política", url: "https://rss.uol.com.br/feed/politica.xml" },
      ],
      mundo: [
        { name: "G1 Mundo", url: "https://g1.globo.com/rss/g1/mundo/" },
        { name: "BBC Brasil", url: "https://www.bbc.com/portuguese/index.xml" },
        { name: "CNN Brasil Mundo", url: "https://www.cnnbrasil.com.br/internacional/feed/" },
      ],
      saude: [
        { name: "G1 Saúde", url: "https://g1.globo.com/rss/g1/bemestar/" },
        { name: "Veja Saúde", url: "https://saude.abril.com.br/feed/" },
      ],
      entretenimento: [
        { name: "G1 Pop Arte", url: "https://g1.globo.com/rss/g1/pop-arte/" },
        { name: "UOL Splash", url: "https://rss.uol.com.br/feed/splash.xml" },
      ],
    };

    function curatedFeeds(): FeedSuggestion[] {
      return (FALLBACK_FEEDS[profile.key] || []).map((feed) => ({
        ...feed,
        niche: profile.label,
        source_kind: "rss" as const,
        query: null,
        include_terms: profile.terms,
        discovery_method: "curated_rss" as const,
      }));
    }

    function topicSuggestion(): FeedSuggestion {
      return {
        name: `Monitoramento: ${profile.label}`,
        url: googleNewsTopicUrl(profile.query),
        niche: profile.label,
        source_kind: "topic",
        query: profile.query,
        include_terms: profile.terms,
        discovery_method: "topic_search",
      };
    }

    function selectedSuggestions(value: unknown): FeedSuggestion[] {
      if (!Array.isArray(value)) return [];
      return value.flatMap((candidate): FeedSuggestion[] => {
        if (typeof candidate === "string" && /^https:\/\//i.test(candidate.trim())) {
          let hostname = "Fonte selecionada";
          try {
            hostname = new URL(candidate).hostname.replace(/^www\./, "");
          } catch {
            return [];
          }
          return [{
            name: hostname,
            url: candidate.trim(),
            niche: profile.label,
            source_kind: "rss",
            query: null,
            include_terms: profile.terms,
            discovery_method: "ai_rss",
          }];
        }
        if (!candidate || typeof candidate !== "object") return [];
        const record = candidate as Record<string, unknown>;
        const sourceKind = record.source_kind === "topic" ? "topic" : "rss";
        const discoveryMethod: DiscoveryMethod = sourceKind === "topic"
          ? "topic_search"
          : record.discovery_method === "curated_rss" ? "curated_rss" : "ai_rss";
        const url = sourceKind === "topic"
          ? googleNewsTopicUrl(profile.query)
          : typeof record.url === "string" ? record.url.trim() : "";
        if (!url || !/^https:\/\//i.test(url)) return [];
        return [{
          name: typeof record.name === "string" && record.name.trim() ? record.name.trim() : `Fonte: ${profile.label}`,
          url,
          niche: profile.label,
          source_kind: sourceKind,
          query: sourceKind === "topic" ? profile.query : null,
          include_terms: profile.terms,
          discovery_method: discoveryMethod,
        }];
      });
    }

    let suggestions: FeedSuggestion[] = [];
    let usedFallback = false;

    if (insert) suggestions = selectedSuggestions(selected_feeds);

    const apiKey = Deno.env.get("LOVABLE_API_KEY") || "";
    try {
      if (suggestions.length > 0) throw new Error("selected_candidates_ready");
      if (!apiKey) throw new Error("lovable_api_key_unavailable");
      const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "Você é especialista em mídia brasileira. Retorne APENAS JSON válido com feeds RSS REAIS de veículos consagrados (G1, UOL, CNN Brasil, InfoMoney, Exame, Valor, Folha, Estadão). NUNCA invente URLs." },
            { role: "user", content: `Liste 8 feeds RSS brasileiros ativos do nicho "${niche}". JSON: {"feeds":[{"name":"...","url":"...","niche":"${niche}"}]}` },
          ],
          response_format: { type: "json_object" },
        }),
      });

      if (aiRes.ok) {
        const aiData = await aiRes.json();
        const content = aiData.choices?.[0]?.message?.content || "{}";
        const parsedContent = JSON.parse(content);
        const aiFeeds = Array.isArray(parsedContent.feeds) ? parsedContent.feeds : [];
        suggestions = aiFeeds.flatMap((feed: Record<string, unknown>): FeedSuggestion[] => {
          const url = typeof feed?.url === "string" ? feed.url.trim() : "";
          if (!/^https:\/\//i.test(url)) return [];
          return [{
            name: typeof feed?.name === "string" && feed.name.trim() ? feed.name.trim() : `Fonte: ${profile.label}`,
            url,
            niche: profile.label,
            source_kind: "rss",
            query: null,
            include_terms: profile.terms,
            discovery_method: "ai_rss",
          }];
        });
      } else {
        console.warn("AI indisponível, usando fallback. Status:", aiRes.status);
        usedFallback = true;
        suggestions = curatedFeeds();
      }
    } catch (e) {
      if (!(e instanceof Error && e.message === "selected_candidates_ready")) {
        console.warn("AI erro, usando descoberta deterministica:", e);
        usedFallback = true;
        suggestions = curatedFeeds();
      }
    }

    if (!insert && suggestions.length === 0) {
      usedFallback = true;
      suggestions = curatedFeeds();
    }

    if (!insert || suggestions.length === 0) suggestions.push(topicSuggestion());
    suggestions = [...new Map(suggestions.map((suggestion) => [suggestion.url, suggestion])).values()].slice(0, 9);

    const validated = await Promise.all(
      suggestions.map(async (s) => {
        try {
          const preview = await previewSource({
            name: s.name,
            url: s.url,
            niche: s.niche,
            source_kind: s.source_kind,
            query: s.query,
            include_terms: s.include_terms,
          }, 5, {
            allowRelaxedSearch: false,
            maxAgeHours: 48,
          });
          const relevance = measureNicheRelevance(preview.sample_items || [], profile);
          const valid = preview.valid && relevance.relevant;
          return {
            ...s,
            valid,
            preview,
            relevance,
            error: valid ? null : preview.valid
              ? "A fonte respondeu, mas as notícias recentes não correspondem ao nicho informado."
              : preview.diagnostics?.warnings?.[0] || "Fonte sem conteúdo recente aproveitável.",
            quality_score: valid ? Math.min(100, 55 + relevance.matching * 10) : 0,
          };
        } catch (e) {
          return {
            ...s,
            valid: false,
            error: e instanceof Error ? e.message : "Falha ao validar fonte",
            preview: null,
            relevance: { total: 0, matching: 0, ratio: 0, relevant: false },
            quality_score: 0,
          };
        }
      })
    );
    const valid = validated.filter((s) => s.valid);

    if (!insert) {
      return new Response(
        JSON.stringify({
          suggested: suggestions.length,
          valid: valid.length,
          inserted: 0,
          feeds: validated,
          usedFallback,
          discovery_profile: { key: profile.key, label: profile.label, recognized: profile.recognized },
          preview_only: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // insere apenas os que não existem ainda
    const { data: existing } = await supabase
      .from("news_sources")
      .select("id, url")
      .eq("user_id", user.id);
    const existingByUrl = new Map<string, string>(
      (existing || []).map((e: { url: string; id: string }) => [e.url, e.id])
    );
    const toInsert = valid
      .map((s) => ({
        user_id: user.id,
        name: s.name,
        url: s.url,
        source_kind: s.source_kind,
        query: s.query || null,
        include_terms: s.include_terms,
        niche: s.source_kind === "topic" ? `Tema: ${profile.label}` : `RSS: ${profile.label}`,
        source_config: {
          discovered_by: "discover-rss",
          discovery_method: s.discovery_method,
          discovery_profile: { key: profile.key, label: profile.label, recognized: profile.recognized },
          relevance: s.relevance,
          preview: s.preview,
        },
        quality_score: s.quality_score || 0,
        fetch_interval_minutes: 60,
        active: true,
      }));

    let inserted = 0;
    let linkedExisting = 0;
    let skippedDuplicates = 0;
    for (const row of toInsert) {
      let sourceId = existingByUrl.get(row.url);
      if (!sourceId) {
        const { data: insertedRow, error } = await supabase
          .from("news_sources")
          .insert(row)
          .select("id")
          .single();
        if (error) {
          if (isDuplicateSourceError(error)) {
            skippedDuplicates++;
            continue;
          }
          throw error;
        }
        sourceId = insertedRow?.id;
        inserted++;
      } else {
        linkedExisting++;
      }

      if (sourceId && targetIgIds.length > 0) {
        const links = targetIgIds.map(igId => ({
          source_id: sourceId,
          instagram_account_id: igId,
          user_id: user.id,
        }));
        const { error: linkError } = await supabase.from("news_source_instagram_accounts").upsert(links, {
          onConflict: "source_id,instagram_account_id",
        });
        if (linkError) throw linkError;
      }
    }

    return new Response(
      JSON.stringify({
        suggested: suggestions.length,
        valid: valid.length,
        inserted,
        linked_existing: linkedExisting,
        skipped_duplicates: skippedDuplicates,
        feeds: validated,
        usedFallback,
        preview_only: false,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
