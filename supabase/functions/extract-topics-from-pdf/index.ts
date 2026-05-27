// Recebe um PDF (base64), extrai o texto e pede pra IA sugerir N pautas.
// Não grava nada — retorna sugestões pra o usuário escolher.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { extractText, getDocumentProxy } from "https://esm.sh/unpdf@0.12.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function extractPdfText(base64: string): Promise<string> {
  const bin = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const pdf = await getDocumentProxy(bin);
  const { text } = await extractText(pdf, { mergePages: true });
  return (Array.isArray(text) ? text.join("\n") : String(text)).trim();
}

async function suggestTopics(text: string, niche: string, count: number) {
  const apiKey = Deno.env.get("LOVABLE_API_KEY")!;
  // limita o texto pra ~20k chars (suficiente pra contexto sem estourar)
  const corpus = text.slice(0, 20000);

  const systemPrompt = `Você é especialista em transformar material didático/conteúdo em pautas para Instagram.
A partir do texto fornecido, gere ${count} pautas distintas e relevantes para o nicho "${niche || "geral"}".
Cada pauta deve ser um TEMA específico (não um post pronto), pequeno o suficiente para virar 1 post.
Para cada pauta, sugira também 1-2 formatos ideais entre: dica, mini_aula, pergunta, carrossel, frase.

Retorne APENAS JSON: {"topics":[{"title":"...","notes":"contexto curto (até 200 chars)","formats":["dica","mini_aula"]}]}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Material:\n\n${corpus}` },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    if (res.status === 402) {
      const err: any = new Error("Sem créditos de IA — recarregue para extrair pautas de PDF.");
      err.code = "no_credits"; throw err;
    }
    if (res.status === 429) {
      const err: any = new Error("Muitas requisições. Tente em alguns segundos.");
      err.code = "rate_limited"; throw err;
    }
    throw new Error(`AI ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
  return Array.isArray(parsed.topics) ? parsed.topics : [];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json();
    const pdfBase64: string = body?.pdf_base64;
    const count: number = Math.min(Math.max(parseInt(body?.count) || 10, 3), 30);
    if (!pdfBase64) {
      return new Response(JSON.stringify({ error: "pdf_base64 required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const text = await extractPdfText(pdfBase64);
    if (text.length < 100) {
      return new Response(JSON.stringify({ error: "PDF parece vazio ou apenas imagem (sem texto extraível). Use um PDF com texto selecionável." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: settings } = await supabase.from("user_settings").select("default_niche").eq("user_id", user.id).maybeSingle();
    const topics = await suggestTopics(text, settings?.default_niche || "", count);

    return new Response(JSON.stringify({ ok: true, topics, chars_extracted: text.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "unknown";
    const code = e?.code || null;
    const status = code === "no_credits" || code === "rate_limited" ? 200 : 500;
    return new Response(JSON.stringify({ error: msg, code }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
