import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

export default defineTool({
  name: "create_topic",
  title: "Criar pauta",
  description: "Cria uma nova pauta de conteúdo (content_topics) para o usuário autenticado.",
  inputSchema: {
    title: z.string().trim().min(3).max(200).describe("Título da pauta."),
    angle: z.string().trim().max(500).optional().describe("Ângulo ou abordagem editorial."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async ({ title, angle }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("content_topics")
      .insert({ user_id: ctx.getUserId(), title, angle: angle ?? null, status: "active" })
      .select("id, title, angle, status, created_at")
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Pauta criada: ${data.id}` }],
      structuredContent: { topic: data },
    };
  },
});
