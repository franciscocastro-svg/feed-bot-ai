import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listTopicsTool from "./tools/list-topics";
import createTopicTool from "./tools/create-topic";
import listScheduledPostsTool from "./tools/list-scheduled-posts";

// Public, repository-bound identifier. Keeping it explicit makes the generated
// Edge Function byte-stable across Lovable, CI and VPS build environments.
const MCP_SUPABASE_PROJECT_REF = "gewnaxrhiyylfizgbqdi";
const MCP_OAUTH_ISSUER = `https://${MCP_SUPABASE_PROJECT_REF}.supabase.co/auth/v1`;

export default defineMcp({
  name: "fluxifeed-mcp",
  title: "FluxiFeed MCP",
  version: "0.1.0",
  instructions:
    "Ferramentas do FluxiFeed. Use list_topics para ver pautas do criador autenticado, create_topic para cadastrar uma nova pauta e list_scheduled_posts para consultar publicações agendadas no Instagram.",
  auth: auth.oauth.issuer({
    issuer: MCP_OAUTH_ISSUER,
    acceptedAudiences: "authenticated",
  }),
  tools: [listTopicsTool, createTopicTool, listScheduledPostsTool],
});
