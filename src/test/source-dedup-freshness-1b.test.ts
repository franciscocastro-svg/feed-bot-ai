import { describe, expect, it } from "vitest";
import fetchRssSource from "../../supabase/functions/fetch-rss/index.ts?raw";
import dedupeMigration from "../../supabase/migrations/20260716211500_quality_sources_1b_dedup_freshness.sql?raw";

describe("Qualidade de Fontes 1B", () => {
  it("uses strict 48-hour automatic search capture", () => {
    expect(fetchRssSource).toContain("allowRelaxedSearch: false");
    expect(fetchRssSource).toContain("maxAgeHours: AUTOMATIC_SEARCH_MAX_AGE_HOURS");
    expect(fetchRssSource).toContain("AUTOMATIC_SEARCH_MAX_AGE_HOURS = 48");
  });

  it("deduplicates failed and rejected rows instead of creating clones", () => {
    const duplicateFunction = fetchRssSource.slice(
      fetchRssSource.indexOf("async function findDuplicate"),
      fetchRssSource.indexOf("async function authContext"),
    );
    expect(duplicateFunction).not.toContain('.not("status", "in", "(rejected,failed)")');
    expect(fetchRssSource).toContain("SOURCE_DEDUPE_LOOKBACK_HOURS = 7 * 24");
  });

  it("enforces the same seven-day tombstone in the database trigger", () => {
    expect(dedupeMigration).toContain("now() - interval '7 days'");
    expect(dedupeMigration).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(dedupeMigration).not.toMatch(/status\s+not\s+in\s*\('rejected',\s*'failed'\)/i);
    expect(dedupeMigration).toContain("idx_news_items_user_dedupe_all_recent");
  });
});
