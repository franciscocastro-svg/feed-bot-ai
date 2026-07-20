import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

const historicalMigrations = [
  {
    file: "supabase/migrations/20260719180000_configurable_editorial_reel_duration.sql",
    sha256: "29ff02acac54086323faf4a109692bc90aed556b7e3bb213b65044d01c1f4236",
  },
  {
    file: "supabase/migrations/20260719213209_fc7a5a58-eda2-462d-bd1b-346128463fdb.sql",
    sha256: "5df4074c15201cd2cc5dae06e50c17e33871256c532ed7fc0db6d4a956e101eb",
  },
  {
    file: "supabase/migrations/20260720143319_a49c0567-64ba-4019-8209-0b37c45b1073.sql",
    sha256: "287c8071a972244b2d1d29e6eceaeada54af34dece5eebb1a14f725abc6ee720",
  },
];

const migration = read("supabase/migrations/20260720200000_reconcile_editorial_reel_duration.sql");

describe("Reconciliação forward-only da duração editorial", () => {
  it("preserva byte a byte as três migrations históricas", () => {
    for (const historical of historicalMigrations) {
      expect(sha256(read(historical.file)), historical.file).toBe(historical.sha256);
    }
  });

  it("remove os triggers incompatíveis antes da função histórica sem usar cascade", () => {
    const dropNewsTrigger = migration.indexOf(
      "drop trigger if exists snapshot_editorial_reel_duration on public.news_items",
    );
    const dropScheduledTrigger = migration.indexOf(
      "drop trigger if exists snapshot_editorial_reel_duration on public.scheduled_posts",
    );
    const dropHistoricalFunction = migration.indexOf(
      "drop function if exists public.tg_snapshot_editorial_reel_duration()",
    );

    expect(dropNewsTrigger).toBeGreaterThan(-1);
    expect(dropScheduledTrigger).toBeGreaterThan(-1);
    expect(dropHistoricalFunction).toBeGreaterThan(dropNewsTrigger);
    expect(dropHistoricalFunction).toBeGreaterThan(dropScheduledTrigger);
    expect(migration.toLowerCase()).not.toContain("cascade");
  });

  it("instala um único contrato canônico exclusivamente em scheduled_posts", () => {
    expect(migration).toContain(
      "create function public.tg_snapshot_editorial_reel_duration_from_scheduled_post()",
    );
    expect(migration).toContain(
      "create trigger snapshot_editorial_reel_duration_from_scheduled_post",
    );
    expect(migration).toContain(
      "before insert or update of media_type, news_item_id, user_id\non public.scheduled_posts",
    );
    expect(migration).not.toMatch(/create trigger[\s\S]*on public\.news_items/i);
    expect(migration).toContain("set search_path = pg_catalog, public");
    expect(migration).toContain("security definer");
  });

  it("é first-write-wins e exclui Cortes IA, carrosséis e itens com MP4", () => {
    expect(migration).toContain("item.editorial_reel_duration_seconds is null");
    expect(migration).toContain("item.content_type is distinct from 'video_cut'");
    expect(migration).toContain("item.content_format is distinct from 'carrossel'");
    expect(migration).toContain("item.generated_video_url is null");
    expect(migration).toContain("if new.media_type is distinct from 'reel'");
  });

  it("não faz backfill, limpeza de linhas nem alteração de conteúdo existente", () => {
    const normalized = migration.toLowerCase();
    expect(normalized).not.toMatch(/update\s+public\.user_settings/);
    expect(normalized).not.toMatch(/update\s+public\.scheduled_posts/);
    expect(normalized).not.toMatch(/delete\s+from/);
    expect(normalized).not.toMatch(/truncate\s+/);
    expect(normalized.match(/update\s+public\.news_items/g)).toHaveLength(1);
    expect(normalized).toContain("item.editorial_reel_duration_seconds is null");
  });

  it("consolida constraints e valida dados existentes de forma fail-closed", () => {
    expect(migration).toContain("drop constraint if exists user_settings_editorial_reel_duration_seconds_check");
    expect(migration).toContain("drop constraint if exists news_items_editorial_reel_duration_seconds_check");
    expect(migration).toContain("add constraint user_settings_editorial_reel_duration_check");
    expect(migration).toContain("add constraint news_items_editorial_reel_duration_check");
    expect(migration).toContain("validate constraint user_settings_editorial_reel_duration_check");
    expect(migration).toContain("validate constraint news_items_editorial_reel_duration_check");
    expect(migration).toContain("editorial_duration_user_settings_type_mismatch");
    expect(migration).toContain("editorial_duration_news_items_type_mismatch");
  });
});
