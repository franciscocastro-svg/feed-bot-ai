import { describe, expect, it } from "vitest";
import {
  buildStarterTopicRows,
  type CreatorTopicDefinition,
} from "@/lib/starterTopics";

const topics = [
  ["Ensinar um conceito", "Educação", "educar", ["mini_aula", "carrossel"]],
  ["Apresentar uma oferta", "Oferta", "vender", ["oferta"]],
] as const satisfies readonly CreatorTopicDefinition[];

describe("buildStarterTopicRows", () => {
  it("preserves the starter pack content and account scope", () => {
    const rows = buildStarterTopicRows(topics, {
      userId: "user-1",
      targetAudience: "pequenos empresários",
      tone: "simples e direto",
      instagramAccountId: "ig-1",
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      user_id: "user-1",
      title: "Ensinar um conceito",
      content_pillar: "Educação",
      objective: "educar",
      formats: ["mini_aula", "carrossel"],
      target_audience: "pequenos empresários",
      tone: "simples e direto",
      instagram_account_id: "ig-1",
      funnel_stage: "descoberta",
      source_type: "starter_pack",
    });
  });

  it("uses conversion for sales topics and supports shared plans", () => {
    const rows = buildStarterTopicRows(topics, {
      userId: "user-1",
      targetAudience: null,
      tone: null,
      instagramAccountId: null,
    });

    expect((rows[1] as any).funnel_stage).toBe("conversao");
    expect(rows[1].instagram_account_id).toBeNull();
  });

  it("copies format arrays instead of retaining readonly pack references", () => {
    const rows = buildStarterTopicRows(topics, {
      userId: "user-1",
      targetAudience: null,
      tone: null,
      instagramAccountId: null,
    });

    expect(rows[0].formats).toEqual(topics[0][3]);
    expect(rows[0].formats).not.toBe(topics[0][3]);
  });
});
