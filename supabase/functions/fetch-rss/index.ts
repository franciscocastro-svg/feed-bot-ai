import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  buildSourceFetchUrl,
  canonicalizeArticleUrl,
  fetchTextSmart,
  filterItemsForSource,
  findArticleImage,
  inferSourceKind,
  isGoogleNewsUrl,
  isLikelyLogo,
  normalizeTerms,
  parseSourceItems,
  previewSource,
  resolveArticleUrl,
  type ParsedSourceItem,
  type SourceDiagnostics,
} from "../_shared/source-capture.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-internal-secret",
};

function emptyDiagnostics(message?: string): SourceDiagnostics {
  return {
    parse_type: "none",
    items_found: 0,
    items_after_freshness: 0,
    items_after_relevance: 0,
    items_duplicates: 0,
    items_without_image: 0,
    items_created: 0,
    filtered_old: 0,
    filtered_low_score: 0,
    filtered_excluded_terms: 0,
    filtered_missing_required_terms: 0,
    warnings: message ? [message] : [],
  };
}

function qualityScore(diagnostics: SourceDiagnostics, ok: boolean): number {
  if (!ok) return 0;
  if (diagnostics.items_created > 0) return Math.min(100, 80 + Math.min(20, diagnostics.items_created * 4));
  if (diagnostics.items_after_relevance > 0) return 65;
  if (diagnostics.items_after_freshness > 0) return 45;
  if (diagnostics.items_found > 0) return 30;
  return 10;
}

function sampleItems(items: ParsedSourceItem[]) {
  return items.slice(0, 5).map((item) => ({
    title: item.title,
    url: item.link,
    published_at: item.pubDate || null,
    image: item.image || null,
    score: item._score || 0,
  }));
}

function runSummary(diagnostics: SourceDiagnostics, extra: Record<string, unknown> = {}) {
  return { ...diagnostics, ...extra, completed_at: new Date().toISOString() };
}

function normalizeDuplicateTitle(value?: string | null): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function insertRun(
  supabase: any,
  source: any,
  userId: string,
  status: "success" | "error",
  startedAt: number,
  diagnostics: SourceDiagnostics,
  samples: ParsedSourceItem[],
  errorMessage?: string,
) {
  await supabase.from("source_fetch_runs").insert({
    user_id: userId,
    source_id: source?.id || null,
    source_name: source?.name || null,
    source_kind: inferSourceKind(source || {}),
    status,
    started_at: new Date(startedAt).toISOString(),
    completed_at: new Date().toISOString(),
    duration_ms: Math.max(0, Date.now() - startedAt),
    items_found: diagnostics.items_found,
    items_after_freshness: diagnostics.items_after_freshness,
    items_after_relevance: diagnostics.items_after_relevance,
    items_duplicates: diagnostics.items_duplicates,
    items_without_image: diagnostics.items_without_image,
    items_created: diagnostics.items_created,
    error_message: errorMessage || null,
    diagnostics,
    sample_items: sampleItems(samples),
  });
}

async function findDuplicate(supabase: any, userId: string, igId: string | null, canonicalUrl: string, articleUrl: string, title?: string | null) {
  const byCanonical = supabase
    .from("news_items")
    .select("id, original_image_url, original_url, original_canonical_url, original_title, rewritten_title")
    .eq("user_id", userId)
    .eq("original_canonical_url", canonicalUrl)
    .limit(1);
  const canonical = await (igId ? byCanonical.eq("instagram_account_id", igId) : byCanonical.is("instagram_account_id", null)).maybeSingle();
  if (canonical.data) return canonical.data;

  const byOriginal = supabase
    .from("news_items")
    .select("id, original_image_url, original_url, original_canonical_url, original_title, rewritten_title")
    .eq("user_id", userId)
    .eq("original_url", articleUrl)
    .limit(1);
  const original = await (igId ? byOriginal.eq("instagram_account_id", igId) : byOriginal.is("instagram_account_id", null)).maybeSingle();
  if (original.data) return original.data;

  const titleKey = normalizeDuplicateTitle(title);
  if (titleKey.length < 18) return null;
  const since = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
  const byTitle = supabase
    .from("news_items")
    .select("id, original_image_url, original_url, original_canonical_url, original_title, rewritten_title, created_at")
    .eq("user_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(100);
  const recent = await (igId ? byTitle.eq("instagram_account_id", igId) : byTitle.is("instagram_account_id", null));
  return (recent.data || []).find((row: any) => {
    const rowTitle = normalizeDuplicateTitle(row.original_title || row.rewritten_title);
    return rowTitle.length >= 18 && rowTitle === titleKey;
  }) || null;
}

async function authContext(req: Request, body: any) {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  let userId: string | null = body?.user_id || null;
  let supabase: any;

  if (userId) {
    const internalSecret = Deno.env.get("INTERNAL_CRON_SECRET");
    const provided = req.headers.get("x-internal-secret");
    if (!internalSecret || provided !== internalSecret) {
      return { error: new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }) };
    }
    supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    return { supabase, userId };
  }

  const auth = req.headers.get("Authorization") || "";
  if (!auth) {
    return { error: new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }) };
  }
  supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }) };
  }
  userId = user.id;

  const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
  const { data: approved } = await adminClient.rpc("is_approved", { _uid: userId });
  if (approved === false) {
    return { error: new Response(JSON.stringify({ error: "account_not_approved" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }) };
  }

  return { supabase, userId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({} as any));
    const context = await authContext(req, body);
    if (context.error) return context.error;
    const { supabase, userId } = context as { supabase: any; userId: string };

    if (body?.validate_url) {
      try {
        const result = await previewSource({
          url: body.validate_url,
          source_kind: body.source_kind || "rss",
          name: body.name || "",
          niche: body.niche || "",
          query: body.query || "",
          include_terms: normalizeTerms(body.include_terms),
          exclude_terms: normalizeTerms(body.exclude_terms),
          country: body.country || "BR",
          language: body.language || "pt-BR",
        });
        return new Response(JSON.stringify({
          valid: result.valid,
          items_count: result.items_count,
          sample_title: result.sample_items?.[0]?.title || null,
          sample_items: result.sample_items,
          diagnostics: result.diagnostics,
          feed_candidates: result.feed_candidates,
          error: result.valid ? null : result.diagnostics?.warnings?.[0] || "Nenhum item aproveitável encontrado",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      } catch (e) {
        return new Response(JSON.stringify({ valid: false, error: e instanceof Error ? e.message : "Falha ao buscar fonte" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    let sourcesQuery = supabase.from("news_sources").select("*").eq("active", true).eq("user_id", userId);
    if (body?.source_id) sourcesQuery = sourcesQuery.eq("id", body.source_id);
    const { data: allSources } = await sourcesQuery;
    const now = Date.now();
    const sources = (allSources || []).filter((source: any) => {
      if (body?.force) return true;
      if (!source.last_fetched_at) return true;
      const elapsedMin = (now - new Date(source.last_fetched_at).getTime()) / 60000;
      return elapsedMin >= (source.fetch_interval_minutes || 60);
    });

    let totalNew = 0;
    const sourceResults: any[] = [];

    for (const source of sources) {
      const startedAt = Date.now();
      let diagnostics: SourceDiagnostics = emptyDiagnostics();
      let selectedItems: ParsedSourceItem[] = [];
      let fetchUrl = "";

      try {
        const { data: links } = await supabase
          .from("news_source_instagram_accounts")
          .select("instagram_account_id")
          .eq("source_id", source.id);
        const linkedIgIds: (string | null)[] = (links || []).map((link: any) => link.instagram_account_id);
        const targetIgs: (string | null)[] = linkedIgIds.length > 0 ? linkedIgIds : [null];

        fetchUrl = buildSourceFetchUrl(source);
        const raw = await fetchTextSmart(fetchUrl);
        const parsed = parseSourceItems(raw.text, raw.finalUrl || fetchUrl);
        const filtered = filterItemsForSource(parsed.items, { ...source, url: fetchUrl }, parsed.parseType, 5);
        diagnostics = filtered.diagnostics;
        selectedItems = filtered.items;

        for (const item of selectedItems) {
          const isListingItem = !!item._htmlListing;
          let img = isListingItem ? null : item.image || null;
          const articleUrl = await resolveArticleUrl(item.link);
          const canonicalUrl = canonicalizeArticleUrl(articleUrl);
          if (isListingItem || isGoogleNewsUrl(item.link) || !img || isLikelyLogo(img)) {
            const articleImg = await findArticleImage(articleUrl);
            if (articleImg && !isLikelyLogo(articleImg)) img = articleImg;
          }
          if (img && isLikelyLogo(img)) img = null;
          if (!img) diagnostics.items_without_image++;

          for (const igId of targetIgs) {
            const duplicate = await findDuplicate(supabase, userId, igId, canonicalUrl, articleUrl, item.title);
            if (duplicate) {
              diagnostics.items_duplicates++;
              const updates: Record<string, string> = {};
              if (img && !duplicate.original_image_url) updates.original_image_url = img;
              if (!duplicate.original_canonical_url) updates.original_canonical_url = canonicalUrl;
              if (Object.keys(updates).length > 0) await supabase.from("news_items").update(updates).eq("id", duplicate.id);
              continue;
            }

            const { error } = await supabase.from("news_items").insert({
              user_id: userId,
              source_id: source.id,
              source_name: source.name,
              instagram_account_id: igId,
              original_title: item.title,
              original_content: item.description,
              original_url: articleUrl,
              original_canonical_url: canonicalUrl,
              original_image_url: img || null,
              published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
              niche: source.niche,
              status: "pending",
            });
            if (!error) {
              totalNew++;
              diagnostics.items_created++;
            } else {
              diagnostics.warnings.push(`Falha ao criar item: ${error.message}`);
            }
          }
        }

        const completedAt = new Date().toISOString();
        const summary = runSummary(diagnostics, {
          fetch_url: fetchUrl,
          source_kind: inferSourceKind(source),
          sample_items: sampleItems(selectedItems),
        });
        await supabase.from("news_sources").update({
          last_fetched_at: completedAt,
          last_success_at: completedAt,
          last_error: null,
          last_items_found: diagnostics.items_found,
          last_items_created: diagnostics.items_created,
          last_run_summary: summary,
          quality_score: qualityScore(diagnostics, true),
          ...(diagnostics.items_created > 0 ? { last_new_item_at: completedAt } : {}),
        }).eq("id", source.id);
        await insertRun(supabase, source, userId, "success", startedAt, diagnostics, selectedItems);
        sourceResults.push({ source_id: source.id, name: source.name, fetched: diagnostics.items_created, diagnostics: summary });
      } catch (e) {
        const message = e instanceof Error ? e.message : "Falha desconhecida ao captar a fonte";
        diagnostics = diagnostics || emptyDiagnostics(message);
        diagnostics.warnings = diagnostics.warnings.length ? diagnostics.warnings : [message];
        const summary = runSummary(diagnostics, { fetch_url: fetchUrl || null, source_kind: inferSourceKind(source), error: message });
        await supabase.from("news_sources").update({
          last_error_at: new Date().toISOString(),
          last_error: message.slice(0, 500),
          last_items_found: 0,
          last_items_created: 0,
          last_run_summary: summary,
          quality_score: qualityScore(diagnostics, false),
        }).eq("id", source.id);
        await insertRun(supabase, source, userId, "error", startedAt, diagnostics, selectedItems, message);
        sourceResults.push({ source_id: source.id, name: source.name, fetched: 0, error: message, diagnostics: summary });
      }
    }

    await supabase.from("activity_logs").insert({
      user_id: userId,
      action: "fetch_rss",
      details: { fetched: totalNew, sources: sources.length, source_results: sourceResults },
    });
    return new Response(JSON.stringify({ fetched: totalNew, sources: sourceResults }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
