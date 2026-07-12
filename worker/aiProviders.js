const parseProviderList = (value, fallback) => {
  const parsed = String(value || fallback)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(parsed)];
};

export function transcriptionProviderOrder() {
  // Whisper/Groq entrega timestamps reais por palavra e por isso deve vir antes
  // do fallback generativo. O Grok/xAI fica fora desta lista enquanto não
  // disponibilizar uma API de transcrição com timestamps compatível.
  return parseProviderList(process.env.CUT_TRANSCRIPTION_PROVIDERS, "groq,gemini");
}

export function analysisProviderOrder() {
  // Para habilitar Grok no futuro basta configurar XAI_API_KEY e, se desejado,
  // CUT_ANALYSIS_PROVIDERS=xai,gemini. Nenhuma alteração no pipeline será necessária.
  return parseProviderList(process.env.CUT_ANALYSIS_PROVIDERS, "gemini,xai");
}

export function normalizeTimedWords(words, options = {}) {
  const maxDuration = Math.max(0, Number(options.maxDuration) || Number.POSITIVE_INFINITY);
  const leadSeconds = Math.max(-0.5, Math.min(0.5, Number(options.leadMs ?? 80) / 1000));
  const normalized = [];
  let previousEnd = 0;

  for (const item of Array.isArray(words) ? words : []) {
    const word = String(item?.word || "").replace(/\s+/g, " ").trim();
    if (!word) continue;
    let start = Number(item?.start);
    let end = Number(item?.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    start = Math.max(0, start - leadSeconds);
    end = Math.max(start + 0.04, end - leadSeconds);
    start = Math.max(start, Math.max(0, previousEnd - 0.025));
    end = Math.min(maxDuration, Math.max(end, start + 0.04));
    if (start >= maxDuration || end <= start) continue;
    normalized.push({ word, start, end });
    previousEnd = end;
  }
  return normalized;
}

export function providerCapabilities(env = process.env) {
  return {
    transcription: {
      groq: Boolean(env.GROQ_API_KEY),
      gemini: Boolean(env.GEMINI_API_KEY || env.GOOGLE_GENERATIVE_AI_API_KEY),
    },
    analysis: {
      gemini: Boolean(env.GEMINI_API_KEY || env.GOOGLE_GENERATIVE_AI_API_KEY),
      xai: Boolean(env.XAI_API_KEY),
    },
  };
}

export async function requestStructuredAnalysis({ prompt, gemini, timeoutMs = 180000 }) {
  const errors = [];
  for (const provider of analysisProviderOrder()) {
    try {
      if (provider === "gemini" && gemini?.apiKey) {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${gemini.model}:generateContent?key=${gemini.apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.15, responseMimeType: "application/json" },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) throw new Error(`Gemini ${response.status}: ${(await response.text()).slice(0, 400)}`);
        const payload = await response.json();
        const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
        return { provider, text };
      }

      if (provider === "xai" && process.env.XAI_API_KEY) {
        const response = await fetch(`${process.env.XAI_BASE_URL || "https://api.x.ai/v1"}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.XAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: process.env.XAI_CUT_MODEL || "grok-4.5",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.15,
            response_format: { type: "json_object" },
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!response.ok) throw new Error(`xAI ${response.status}: ${(await response.text()).slice(0, 400)}`);
        const payload = await response.json();
        return { provider, text: payload?.choices?.[0]?.message?.content || "" };
      }
    } catch (error) {
      errors.push(`${provider}: ${error?.message || error}`);
    }
  }
  throw new Error(errors.length ? errors.join(" | ") : "Nenhum provedor de análise configurado.");
}
