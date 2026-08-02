const parseProviderList = (value, fallback) => {
  const parsed = String(value || fallback)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(parsed)];
};

export function transcriptionProviderOrder() {
  // O ambiente atual usa o Gemini como transcritor único. A variável continua
  // permitindo uma lista explícita para instalações que precisem de outro
  // provedor, sem obrigar o worker a tentar serviços não configurados.
  return parseProviderList(process.env.CUT_TRANSCRIPTION_PROVIDERS, "gemini");
}

export function transcriptionSegmentSeconds(env = process.env) {
  const configured = Number(env.CUT_TRANSCRIPTION_SEGMENT_SECONDS || 120);
  if (!Number.isFinite(configured)) return 120;
  return Math.max(60, Math.min(300, Math.round(configured)));
}

export function geminiTranscriptionTimeoutMs(env = process.env) {
  const configured = Number(env.GEMINI_TRANSCRIBE_TIMEOUT_MS || 90_000);
  if (!Number.isFinite(configured)) return 90_000;
  return Math.max(30_000, Math.min(180_000, Math.round(configured)));
}

function normalizeGeminiWordList(value) {
  const source = Array.isArray(value)
    ? value
    : Array.isArray(value?.words)
      ? value.words
      : [];
  return source
    .map((item) => ({
      word: String(item?.word || "").replace(/\s+/g, " ").trim(),
      start: Number(item?.start),
      end: Number(item?.end),
    }))
    .filter((item) => item.word && Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start);
}

export function parseGeminiTimedWordsResponse(value) {
  const raw = String(value || "").trim();
  if (!raw) return { words: [], validJson: false, recovered: false };

  const clean = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const candidates = [clean];
  const arrayStart = clean.indexOf("[");
  const arrayEnd = clean.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    candidates.push(clean.slice(arrayStart, arrayEnd + 1));
  }

  for (const candidate of [...new Set(candidates)]) {
    try {
      const parsed = JSON.parse(candidate);
      return { words: normalizeGeminiWordList(parsed), validJson: true, recovered: candidate !== clean };
    } catch {
      // A recuperação por objetos completos abaixo preserva respostas truncadas.
    }
  }

  const recoveredWords = [];
  for (const fragment of clean.match(/\{[^{}]*\}/g) || []) {
    try {
      const parsed = JSON.parse(fragment);
      recoveredWords.push(...normalizeGeminiWordList([parsed]));
    } catch {
      // Fragmentos incompletos nas extremidades são ignorados com segurança.
    }
  }
  return {
    words: recoveredWords,
    validJson: false,
    recovered: recoveredWords.length > 0,
  };
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

export async function requestMultimodalAnalysis({ prompt, images = [], gemini, timeoutMs = 180000 }) {
  const safeImages = (Array.isArray(images) ? images : [])
    .filter((image) => image?.data && /^image\/(?:jpeg|png|webp)$/.test(String(image?.mimeType || "")))
    .slice(0, 6);
  const errors = [];

  if (gemini?.apiKey) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${gemini.model}:generateContent?key=${gemini.apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              ...safeImages.map((image) => ({ inline_data: { mime_type: image.mimeType, data: image.data } })),
            ],
          }],
          generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`Gemini ${response.status}: ${(await response.text()).slice(0, 400)}`);
      const payload = await response.json();
      const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";
      return { provider: "gemini_vision", text };
    } catch (error) {
      errors.push(`gemini_vision: ${error?.message || error}`);
    }
  }

  try {
    const fallback = await requestStructuredAnalysis({ prompt, gemini, timeoutMs });
    return { ...fallback, provider: `${fallback.provider}_text_fallback` };
  } catch (error) {
    errors.push(error?.message || String(error));
  }

  throw new Error(errors.join(" | ") || "Nenhum provedor multimodal configurado.");
}
