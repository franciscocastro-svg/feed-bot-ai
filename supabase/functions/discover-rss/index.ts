// Descobre feeds RSS automaticamente a partir de um nicho usando Lovable AI
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function isValidRss(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "NewsFlow/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return false;
    const text = (await r.text()).slice(0, 5000).toLowerCase();
    return text.includes("<rss") || text.includes("<feed") || text.includes("<channel");
  } catch {
    return false;
  }
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

    const { niche, ig_ids } = await req.json();
    if (!niche || typeof niche !== "string") {
      return new Response(JSON.stringify({ error: "niche required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const targetIgIds: string[] = Array.isArray(ig_ids) ? ig_ids.filter((x: any) => typeof x === "string") : [];

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

    function getFallback(n: string) {
      const key = n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
      // tenta match direto, depois parcial
      if (FALLBACK_FEEDS[key]) return FALLBACK_FEEDS[key];
      for (const k of Object.keys(FALLBACK_FEEDS)) {
        if (key.includes(k) || k.includes(key)) return FALLBACK_FEEDS[k];
      }
      // genérico — devolve G1 geral
      return [
        { name: "G1 Últimas", url: "https://g1.globo.com/rss/g1/" },
        { name: "UOL Notícias", url: "https://rss.uol.com.br/feed/noticias.xml" },
      ];
    }

    let suggestions: any[] = [];
    let usedFallback = false;

    const apiKey = Deno.env.get("LOVABLE_API_KEY")!;
    try {
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
        suggestions = JSON.parse(content).feeds || [];
      } else {
        console.warn("AI indisponível, usando fallback. Status:", aiRes.status);
        usedFallback = true;
        suggestions = getFallback(niche).map(f => ({ ...f, niche }));
      }
    } catch (e) {
      console.warn("AI erro, usando fallback:", e);
      usedFallback = true;
      suggestions = getFallback(niche).map(f => ({ ...f, niche }));
    }

    if (suggestions.length === 0) {
      usedFallback = true;
      suggestions = getFallback(niche).map(f => ({ ...f, niche }));
    }

    // valida em paralelo
    const validated = await Promise.all(
      suggestions.map(async (s) => ({ ...s, valid: await isValidRss(s.url) }))
    );
    const valid = validated.filter((s) => s.valid);

    // insere apenas os que não existem ainda
    const { data: existing } = await supabase
      .from("news_sources")
      .select("url")
      .eq("user_id", user.id);
    const existingUrls = new Set((existing || []).map((e: any) => e.url));

    const toInsert = valid
      .filter((s) => !existingUrls.has(s.url))
      .map((s) => ({
        user_id: user.id,
        name: s.name,
        url: s.url,
        niche: s.niche || niche,
        fetch_interval_minutes: 60,
        active: true,
      }));

    let inserted = 0;
    if (toInsert.length > 0) {
      const { data: insertedRows, error } = await supabase
        .from("news_sources")
        .insert(toInsert)
        .select("id");
      if (!error) {
        inserted = insertedRows?.length || 0;
        // Vincula cada nova fonte aos IGs selecionados
        if (targetIgIds.length > 0 && insertedRows && insertedRows.length > 0) {
          const links = insertedRows.flatMap((row: any) =>
            targetIgIds.map(igId => ({
              source_id: row.id,
              instagram_account_id: igId,
              user_id: user.id,
            }))
          );
          await supabase.from("news_source_instagram_accounts").insert(links);
        }
      }
    }

    return new Response(
      JSON.stringify({
        suggested: suggestions.length,
        valid: valid.length,
        inserted,
        feeds: valid,
        usedFallback,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
