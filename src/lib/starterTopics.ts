import type { Database } from "@/integrations/supabase/types";

export type CreatorTopicDefinition = readonly [
  title: string,
  contentPillar: string,
  objective: string,
  formats: readonly string[],
];

export type CreatorPackDefinition = {
  key: string;
  title: string;
  desc: string;
  topics: readonly CreatorTopicDefinition[];
};

type ContentTopicInsert = Database["public"]["Tables"]["content_topics"]["Insert"];

type StarterTopicContext = {
  userId: string;
  targetAudience: string | null;
  tone: string | null;
  instagramAccountId: string | null;
};

export function buildStarterTopicRows(
  topics: readonly CreatorTopicDefinition[],
  context: StarterTopicContext,
): ContentTopicInsert[] {
  return topics.map((topic) => {
    const [title, contentPillar, objective, formats] = topic;

    return {
      user_id: context.userId,
      title,
      content_pillar: contentPillar,
      objective,
      formats: [...formats],
      target_audience: context.targetAudience,
      tone: context.tone,
      instagram_account_id: context.instagramAccountId,
      funnel_stage: objective === "vender" ? "conversao" : "descoberta",
      frequency_per_week: 1,
      priority: 3,
      active: true,
      source_type: "starter_pack",
    };
  });
}
