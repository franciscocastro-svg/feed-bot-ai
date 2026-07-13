import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listTopicsTool from "./tools/list-topics";
import createTopicTool from "./tools/create-topic";
import listScheduledPostsTool from "./tools/list-scheduled-posts";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "fluxifeed-mcp",
  title: "FluxiFeed MCP",
  version: "0.1.0",
  instructions:
    "Ferramentas do FluxiFeed. Use list_topics para ver pautas do criador autenticado, create_topic para cadastrar uma nova pauta e list_scheduled_posts para consultar publicações agendadas no Instagram.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listTopicsTool, createTopicTool, listScheduledPostsTool],
});
