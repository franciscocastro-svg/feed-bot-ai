import { describe, expect, it } from "vitest";
import {
  loadPublishedTemplate,
  materializeTemplateVersion,
  normalizeTemplateFormat,
} from "../../supabase/functions/_shared/template-versioning.js";

type TestRow = Record<string, unknown>;
type TestBuilder = {
  select: () => TestBuilder;
  eq: (column: string, value: unknown) => TestBuilder;
  maybeSingle: () => Promise<{ data: TestRow | null; error: { message: string } | null }>;
};

function fakeClient(rows: Record<string, TestRow[]>, tableErrors: Record<string, string> = {}) {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const builder: TestBuilder = {
        select() { return builder; },
        eq(column: string, value: unknown) { filters[column] = value; return builder; },
        async maybeSingle() {
          if (tableErrors[table]) return { data: null, error: { message: tableErrors[table] } };
          const data = (rows[table] || []).find(row =>
            Object.entries(filters).every(([column, value]) => row[column] === value)
          ) || null;
          return { data, error: null };
        },
      };
      return builder;
    },
  };
}

describe("account-scoped template versions", () => {
  it("materializes an immutable version using the legacy template contract", () => {
    expect(materializeTemplateVersion({
      id: "version-2",
      template_id: "template-1",
      user_id: "user-1",
      name: "Editorial v2",
      kind: "custom",
      preset_key: null,
      background_url: null,
      config: { titleColor: "#FFFFFF" },
      format: "reels",
      version_number: 2,
    })).toMatchObject({
      id: "template-1",
      name: "Editorial v2",
      format: "reels",
      _template_version_id: "version-2",
      _template_version_number: 2,
    });
  });

  it("loads only the version published for the selected account and format", async () => {
    const client = fakeClient({
      account_template_assignments: [
        { instagram_account_id: "account-a", format: "feed", published_version_id: "version-a" },
        { instagram_account_id: "account-b", format: "feed", published_version_id: "version-b" },
      ],
      post_template_versions: [
        { id: "version-a", template_id: "template-shared", user_id: "user-1", instagram_account_id: "account-a", format: "feed", status: "published", version_number: 2, name: "Conta A", kind: "custom", config: { titleColor: "#AA0000" } },
        { id: "version-b", template_id: "template-shared", user_id: "user-1", instagram_account_id: "account-b", format: "feed", status: "published", version_number: 4, name: "Conta B", kind: "custom", config: { titleColor: "#0000AA" } },
      ],
    });

    const selected = await loadPublishedTemplate(client, {
      accountId: "account-a",
      userId: "user-1",
      format: "feed",
      fallbackTemplateId: "template-shared",
    });

    expect(selected).toMatchObject({
      name: "Conta A",
      config: { titleColor: "#AA0000" },
      _template_version_id: "version-a",
    });
  });

  it("falls back to the legacy template before the migration is available", async () => {
    const client = fakeClient({
      post_templates: [{ id: "legacy", user_id: "user-1", format: "stories", name: "Legado", config: {} }],
    }, { account_template_assignments: "relation does not exist" });

    const selected = await loadPublishedTemplate(client, {
      accountId: "account-a",
      userId: "user-1",
      format: "story",
      fallbackTemplateId: "legacy",
    });

    expect(normalizeTemplateFormat("story")).toBe("stories");
    expect(selected).toMatchObject({ name: "Legado" });
  });
});
