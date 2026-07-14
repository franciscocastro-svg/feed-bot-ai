type TopicAiProviderName = "gemini" | "groq" | "lovable";

type TopicAiProvider = {
  name: TopicAiProviderName;
  endpoint: string;
  key: string;
  model: string;
};

type TopicAiOptions = {
  systemPrompt: string;
  userPrompt: string;
  env?: Record<string, string | undefined>;
  fetcher?: typeof fetch;
};

export type TopicAiResult = {
  content: Record<string, unknown>;
  provider: TopicAiProviderName;
  model: string;
};

export class TopicAiError extends Error {
  code: "no_provider" | "no_credits" | "ai_unavailable";

  constructor(message: string, code: TopicAiError["code"]) {
    super(message);
    this.name = "TopicAiError";
    this.code = code;
  }
}

function runtimeEnv(): Record<string, string | undefined> {
  const runtime = globalThis as typeof globalThis & {
    Deno?: { env?: { get: (name: string) => string | undefined } };
  };
  const get = (name: string) => runtime.Deno?.env?.get(name);
  return {
    AI_TEXT_PROVIDER: get("AI_TEXT_PROVIDER"),
    GEMINI_API_KEY: get("GEMINI_API_KEY"),
    GEMINI_TEXT_MODEL: get("GEMINI_TEXT_MODEL"),
    GROQ_API_KEY: get("GROQ_API_KEY"),
    GROQ_TEXT_MODEL: get("GROQ_TEXT_MODEL"),
    LOVABLE_API_KEY: get("LOVABLE_API_KEY"),
  };
}

export function topicAiProviders(env: Record<string, string | undefined>): TopicAiProvider[] {
  const available: TopicAiProvider[] = [];
  if (env.GEMINI_API_KEY) {
    available.push({
      name: "gemini",
      endpoint: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      key: env.GEMINI_API_KEY,
      model: env.GEMINI_TEXT_MODEL || "gemini-2.5-flash-lite",
    });
  }
  if (env.GROQ_API_KEY) {
    available.push({
      name: "groq",
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
      key: env.GROQ_API_KEY,
      model: env.GROQ_TEXT_MODEL || "llama-3.1-8b-instant",
    });
  }
  if (env.LOVABLE_API_KEY) {
    available.push({
      name: "lovable",
      endpoint: "https://ai.gateway.lovable.dev/v1/chat/completions",
      key: env.LOVABLE_API_KEY,
      model: "google/gemini-2.5-flash",
    });
  }

  const preferred = String(env.AI_TEXT_PROVIDER || "").trim().toLowerCase();
  return available.sort((a, b) => {
    if (a.name === preferred) return -1;
    if (b.name === preferred) return 1;
    return 0;
  });
}

function extractJsonObject(raw: string): Record<string, unknown> {
  const cleaned = String(raw || "").replace(/```json/gi, "```").replace(/```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(cleaned.slice(start, end + 1));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    }
  }
  throw new Error("Resposta da IA sem JSON válido");
}

export async function generateTopicJson(options: TopicAiOptions): Promise<TopicAiResult> {
  const providers = topicAiProviders(options.env || runtimeEnv());
  if (providers.length === 0) {
    throw new TopicAiError("Nenhum provedor de IA está configurado para gerar pautas.", "no_provider");
  }

  const fetcher = options.fetcher || fetch;
  let lovableNoCredits = false;

  for (const provider of providers) {
    try {
      const response = await fetcher(provider.endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${provider.key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: provider.model,
          messages: [
            { role: "system", content: options.systemPrompt },
            { role: "user", content: options.userPrompt },
          ],
          temperature: 0.55,
          max_tokens: 2800,
          response_format: { type: "json_object" },
        }),
      });

      if (!response.ok) {
        if (provider.name === "lovable" && response.status === 402) lovableNoCredits = true;
        console.warn(`[topic-ai] ${provider.name} respondeu HTTP ${response.status}; tentando reserva`);
        continue;
      }

      const data = await response.json();
      const raw = data?.choices?.[0]?.message?.content || "";
      const content = extractJsonObject(raw);
      return { content, provider: provider.name, model: provider.model };
    } catch (error) {
      console.warn(`[topic-ai] ${provider.name} falhou; tentando reserva`, error instanceof Error ? error.message : "erro");
    }
  }

  if (lovableNoCredits && providers.length === 1) {
    throw new TopicAiError("Sem créditos de IA e nenhum provedor de reserva está configurado.", "no_credits");
  }
  throw new TopicAiError("Os provedores de IA estão temporariamente indisponíveis. Tente novamente em instantes.", "ai_unavailable");
}
