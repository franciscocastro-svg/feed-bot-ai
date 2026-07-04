import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  createDiagnostics,
  inferSourceKind,
  normalizeTerms,
  previewSource,
} from "../_shared/source-capture.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth) return json({ error: "unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: approved } = await adminClient.rpc("is_approved", { _uid: user.id });
    if (approved === false) return json({ error: "account_not_approved" }, 403);

    const body = await req.json().catch((): Record<string, unknown> => ({}));
    const source = {
      id: typeof body.id === "string" ? body.id : undefined,
      name: typeof body.name === "string" ? body.name : "",
      url: typeof body.url === "string" ? body.url : "",
      niche: typeof body.niche === "string" ? body.niche : "",
      source_kind: typeof body.source_kind === "string" ? body.source_kind : undefined,
      query: typeof body.query === "string" ? body.query : "",
      include_terms: normalizeTerms(body.include_terms),
      exclude_terms: normalizeTerms(body.exclude_terms),
      country: typeof body.country === "string" ? body.country : "BR",
      language: typeof body.language === "string" ? body.language : "pt-BR",
      source_config: body.source_config && typeof body.source_config === "object" ? body.source_config : {},
    };

    const limit = Math.max(1, Math.min(10, Number(body.limit || 6) || 6));

    try {
      const result = await previewSource(source, limit);
      return json({
        ...result,
        source_kind: inferSourceKind(source),
        error: result.valid ? null : result.diagnostics?.warnings?.[0] || "Nenhum item aproveitável encontrado",
      });
    } catch (e) {
      const diagnostics = createDiagnostics("none");
      const message = e instanceof Error ? e.message : "Falha ao gerar prévia da fonte";
      diagnostics.warnings.push(message);
      return json({
        valid: false,
        source_kind: inferSourceKind(source),
        url: source.url || null,
        final_url: null,
        parse_type: "none",
        items_count: 0,
        sample_items: [],
        feed_candidates: [],
        diagnostics,
        error: message,
      });
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
