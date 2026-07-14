import { describe, expect, it, vi } from "vitest";
import { generateTopicJson, topicAiProviders } from "../../supabase/functions/_shared/topic-ai.ts";

describe("topic AI provider fallback", () => {
  it("honors the configured provider and keeps the other providers as fallback", () => {
    const providers = topicAiProviders({
      AI_TEXT_PROVIDER: "groq",
      GEMINI_API_KEY: "gemini-test",
      GROQ_API_KEY: "groq-test",
      LOVABLE_API_KEY: "lovable-test",
    });

    expect(providers.map((provider) => provider.name)).toEqual(["groq", "gemini", "lovable"]);
  });

  it("uses direct Gemini when Lovable has no credits", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("lovable.dev")) return new Response("sem créditos", { status: 402 });
      return Response.json({
        choices: [{ message: { content: "```json\n{\"title\":\"Treino inteligente\",\"caption\":\"Conteúdo\"}\n```" } }],
      });
    });

    const result = await generateTopicJson({
      systemPrompt: "Responda JSON",
      userPrompt: "Tema fitness",
      env: {
        AI_TEXT_PROVIDER: "lovable",
        LOVABLE_API_KEY: "lovable-test",
        GEMINI_API_KEY: "gemini-test",
      },
      fetcher,
    });

    expect(result.provider).toBe("gemini");
    expect(result.content.title).toBe("Treino inteligente");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("fails clearly when no server-side provider is configured", async () => {
    await expect(generateTopicJson({
      systemPrompt: "Sistema",
      userPrompt: "Tema",
      env: {},
    })).rejects.toMatchObject({ code: "no_provider" });
  });
});
