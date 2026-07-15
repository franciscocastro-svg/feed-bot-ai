import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260715063000_template_studio_2a1.sql"),
  "utf8",
);

describe("Template Studio 2A.1 migration contract", () => {
  it("isolates assignments by Instagram account and publication format", () => {
    expect(migration).toContain("UNIQUE (instagram_account_id, format)");
    expect(migration).toContain("uq_post_template_versions_account_draft");
    expect(migration).toContain("WHERE status = 'draft'");
  });

  it("keeps drafts private until an explicit publish operation", () => {
    expect(migration).toContain("save_account_template_draft");
    expect(migration).toContain("publish_account_template_draft");
    expect(migration).toContain("SET published_version_id = draft.id, draft_version_id = NULL");
  });

  it("supports history and account-scoped restoration", () => {
    expect(migration).toContain("restore_account_template_version");
    expect(migration).toContain("AND instagram_account_id = _account_id");
    expect(migration).toContain("AND user_id = owner_id");
  });

  it("does not expose write access to browser roles", () => {
    expect(migration).toContain("REVOKE ALL ON public.post_template_versions FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("GRANT SELECT ON public.post_template_versions TO authenticated");
    expect(migration).not.toContain("GRANT INSERT ON public.post_template_versions TO authenticated");
  });
});
