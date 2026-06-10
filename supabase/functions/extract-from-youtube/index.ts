// Extrai a transcrição de um vídeo do YouTube e gera pautas a partir dela.
// Insere as pautas sugeridas como retorno (frontend escolhe quais importar).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { YoutubeTranscript } from "https://esm.sh/youtube-transcript@1.2.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("/")[0] || null;
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname.startsWith("/watch")) return u.searchParams.get("v");
      if (u.pathname.startsWith("/shorts/")) return u.pathname.split("/")[2] || null;
      if (u.pathname.startsWith("/embed/")) return u.pathname.split("/")[2] || null;
    }
    return null;
  } catch {
    // talvez veio só o ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(url.trim())) return url.trim();
    return null;
  }
}

async function fetchTranscript(videoId: string): Promise<string> {
  // tenta pt-BR, depois pt, depois en, depois qualquer um (default)
  const langs = ["pt-BR", "pt", "en", undefined];
  let lastErr: any = null;
  for (const lang of langs) {
    try {
      const opts: any = lang ? { lang } : {};
      const items = await YoutubeTranscript.fetchTranscript(videoId, opts);
      if (items && items.length > 0) {
        return items.map((i: any) => i.text).join(" ").replace(/\s+/g, " ").trim();
      }
    } catch (e) { lastErr = e; }
  }
  const err: any = new Error(`Sem legendas disponíveis para esse vídeo. Esse vídeo não tem legendas habilitadas — tente outro.`);
  err.code = "transcript_disabled";
  err.detail = lastErr?.message || null;
  throw err;
}

async function suggestTopicsFromText(text: string, count: number, niche?: string | null) {
  const apiKey = Deno.env.get("LOVABLE_API_KEY")!;
  const clipped = text.slice(0, 18000);
  const nicheLine = niche ? `Nicho do criador: ${niche}.` : "";

  const systemPrompt = `Você analisa transcrições de vídeo do YouTube e extrai PAUTAS PERENES pra Instagram.
${nicheLine}
Cada pauta deve ser concreta, ensinável em 1 post (não um tema vago).
Retorne JSON: {"topics":[{"title":"...","notes":"contexto curto extraído do vídeo","formats":["dica"|"mini_aula"|"carrossel"|"pergunta"]}]}`;

  const userPrompt = `Transcrição do vídeo (pode estar truncada):\n"""${clipped}"""\n\nGere ${count} pautas distintas, sem repetir.`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    if (res.status === 402) {
      const err: any = new Error("Sem créditos de IA — adicione créditos em Configurações da Workspace.");
      err.code = "no_credits"; throw err;
    }
    if (res.status === 429) {
      const err: any = new Error("Limite de requisições atingido. Tente novamente em alguns segundos.");
      err.code = "rate_limited"; throw err;
    }
    throw new Error(`AI ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const parsed = JSON.parse(data.choices?.[0]?.message?.content || "{}");
  const topics = Array.isArray(parsed.topics) ? parsed.topics : [];
  return topics.slice(0, count).map((t: any) => ({
    title: String(t.title || "").slice(0, 200),
    notes: t.notes ? String(t.notes).slice(0, 500) : null,
    formats: Array.isArray(t.formats) ? t.formats.filter((f: string) => ["dica","mini_aula","carrossel","pergunta","frase"].includes(f)) : ["dica","mini_aula"],
  })).filter((t: any) => t.title);
}

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
    const videoUrl: string = body?.video_url || "";
    const count: number = Math.max(3, Math.min(30, Number(body?.count) || 10));
    const videoId = extractVideoId(videoUrl);
    if (!videoId) {
      return new Response(JSON.stringify({ error: "URL do YouTube inválida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const transcript = await fetchTranscript(videoId);
    if (transcript.length < 200) {
      return new Response(JSON.stringify({ error: "Transcrição muito curta pra gerar pautas." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: settings } = await supabase.from("user_settings").select("default_niche").eq("user_id", user.id).maybeSingle();
    const topics = await suggestTopicsFromText(transcript, count, settings?.default_niche);

    return new Response(JSON.stringify({ ok: true, video_id: videoId, transcript_chars: transcript.length, topics }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error(e);
    const msg = e instanceof Error ? e.message : "unknown";
    const code = e?.code || null;
    const status = code === "no_credits" || code === "rate_limited" || code === "transcript_disabled" ? 200 : 500;
    return new Response(JSON.stringify({ error: msg, code }), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
