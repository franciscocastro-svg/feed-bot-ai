// Temporário: verifica se as chaves diretas (Gemini/Groq) estão respondendo.
// Nunca expõe o valor das chaves — só o status HTTP.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function probe(url: string, key: string, model: string) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "ok" }], max_tokens: 5 }),
      signal: AbortSignal.timeout(20000),
    });
    return { status: res.status, ok: res.ok, body: (await res.text()).slice(0, 200) };
  } catch (e) {
    return { status: 0, ok: false, body: e instanceof Error ? e.message : "erro" };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const geminiKey = Deno.env.get("GEMINI_API_KEY") || "";
  const groqKey = Deno.env.get("GROQ_API_KEY") || "";
  const out: Record<string, unknown> = {
    provider_atual: Deno.env.get("AI_TEXT_PROVIDER") || "(vazio)",
    gemini_model: Deno.env.get("GEMINI_TEXT_MODEL") || "gemini-2.5-flash-lite",
    groq_model: Deno.env.get("GROQ_TEXT_MODEL") || "llama-3.1-8b-instant",
  };
  out.gemini = geminiKey
    ? await probe(
      "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      geminiKey,
      Deno.env.get("GEMINI_TEXT_MODEL") || "gemini-2.5-flash-lite",
    )
    : { status: 0, ok: false, body: "sem chave" };
  out.groq = groqKey
    ? await probe(
      "https://api.groq.com/openai/v1/chat/completions",
      groqKey,
      Deno.env.get("GROQ_TEXT_MODEL") || "llama-3.1-8b-instant",
    )
    : { status: 0, ok: false, body: "sem chave" };
  return Response.json(out, { headers: cors });
});
