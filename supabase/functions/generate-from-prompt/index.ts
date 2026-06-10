// Gera um post avulso a partir de um tema livre digitado pelo cliente.
// Não cadastra pauta, vai direto pra news_items com content_type='topic'.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FORMAT_GUIDE: Record<string, string> = {
  dica: "DICA RÁPIDA: gancho curto + 3 a 5 dicas práticas numeradas + CTA.",
  mini_aula: "MINI-AULA: conceito explicado em linguagem simples, com exemplo prático e takeaway final.",
  pergunta: "ENGAJAMENTO: pergunta provocativa que faça o público comentar.",
  carrossel: "CARROSSEL: divida em 5-7 slides. Use marcadores '— Slide N —'.",
  frase: "FRASE/CITAÇÃO: frase curta impactante + 1-2 linhas de contexto.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    {
      const adminClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: approved } = await adminClient.rpc("is_approved", { _uid: user.id });
      if (approved === false) return new Response(JSON.stringify({ error: "account_not_approved" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json().catch(() => ({} as any));
    const theme: string = (body?.theme || "").toString().trim();
    const format: string = ["dica","mini_aula","pergunta","carrossel","frase"].includes(body?.format) ? body.format : "dica";
    const instagramAccountId: string | null = body?.instagram_account_id || null;
    if (!theme || theme.length < 3) {
      return new Response(JSON.stringify({ error: "Tema obrigatório (mín. 3 caracteres)." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const [{ data: settings }, { data: profile }] = await Promise.all([
      supabase.from("user_settings").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("creator_profiles").select("*").eq("user_id", user.id).maybeSingle(),
    ]);

    const tone = profile?.voice_tone || settings?.ai_tone || "engajante e descontraído";
    const niche = profile?.niche_detail || settings?.default_niche || "";
    const guide = FORMAT_GUIDE[format];

    const profileBlock = profile ? `
PERFIL DO CRIADOR:
- Público-alvo: ${profile.target_audience || "—"}
- Expertise: ${profile.expertise_summary || "—"}
${profile.signature_phrases?.length ? `- Frases de assinatura: ${profile.signature_phrases.join(" | ")}` : ""}
${profile.forbidden_words?.length ? `- NUNCA use: ${profile.forbidden_words.join(", ")}` : ""}
${profile.cta_style ? `- CTA preferido: ${profile.cta_style}` : ""}
${profile.extra_notes ? `- Observações: ${profile.extra_notes}` : ""}
` : "";

    const systemPrompt = `Você é o ghostwriter pessoal de um criador no Instagram. Nicho: "${niche}". Tom: ${tone}.
Formato: ${format.toUpperCase()}. ${guide}
${profileBlock}
REGRAS:
- Conteúdo PERENE, ensine algo concreto.
- NÃO invente estatísticas.
- Hashtags: 8-15, pt-BR.
- Título até 80 chars.

Retorne APENAS JSON: {"title":"...","caption":"...","hashtags":["#..."],"cover_text":"..."}`;

    const apiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `Tema: "${theme}"\nGere o post no formato ${format}.` },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      if (res.status === 402) return new Response(JSON.stringify({ error: "Sem créditos de IA.", code: "no_credits" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (res.status === 429) return new Response(JSON.stringify({ error: "Rate limit, tente em alguns segundos.", code: "rate_limited" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI ${res.status}: ${txt.slice(0, 200)}`);
    }
    const data = await res.json();
    const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");

    const insertRow: any = {
      user_id: user.id,
      source_id: null,
      source_name: "Tema avulso",
      instagram_account_id: instagramAccountId,
      original_title: theme.slice(0, 200),
      original_content: theme,
      original_url: `prompt://${user.id}/${Date.now()}`,
      original_image_url: null,
      published_at: new Date().toISOString(),
      niche: settings?.default_niche || null,
      status: "pending",
      rewritten_title: String(parsed.title || theme).slice(0, 200),
      rewritten_summary: String(parsed.cover_text || parsed.title || theme).slice(0, 240),
      caption: String(parsed.caption || ""),
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags.slice(0, 20) : [],
      content_type: "topic",
      topic_id: null,
      content_format: format,
      editorial_ready: true,
    };
    const { data: inserted, error: insErr } = await supabase.from("news_items").insert(insertRow).select("id").single();
    if (insErr) throw insErr;

    await supabase.from("activity_logs").insert({
      user_id: user.id,
      action: "generate_from_prompt",
      entity_type: "news_item",
      entity_id: inserted.id,
      details: { theme, format },
    });

    return new Response(JSON.stringify({ ok: true, news_item_id: inserted.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(e);
    return new Response(JSON.stringify({ error: e?.message || "unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
