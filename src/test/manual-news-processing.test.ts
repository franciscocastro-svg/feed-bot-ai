import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  decideNewsClaim,
  processingErrorMessage,
  STALE_NEWS_PROCESSING_MS,
} from "../../supabase/functions/_shared/news-processing-policy.ts";

const readProjectFile = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("manual news processing recovery", () => {
  const now = Date.parse("2026-07-15T04:00:00.000Z");

  it("claims pending and failed items but not completed ones", () => {
    expect(decideNewsClaim("pending", null, now)).toBe("claim");
    expect(decideNewsClaim("failed", null, now)).toBe("claim");
    expect(decideNewsClaim("processed", null, now)).toBe("ignore");
  });

  it("only recovers processing after the abandonment window", () => {
    expect(decideNewsClaim("processing", new Date(now - STALE_NEWS_PROCESSING_MS + 1).toISOString(), now))
      .toBe("already_processing");
    expect(decideNewsClaim("processing", new Date(now - STALE_NEWS_PROCESSING_MS).toISOString(), now))
      .toBe("reclaim_stale");
  });

  it("returns actionable and sanitized messages", () => {
    expect(processingErrorMessage(new Error("Identidade da conta indisponível para compor a arte")))
      .toContain("Configure o nome ou @");
    expect(processingErrorMessage("expired_api_key"))
      .toContain("provedor de IA de reserva");
  });

  it("persists a terminal result before returning and no longer uses waitUntil", () => {
    const source = readProjectFile("supabase/functions/process-news/index.ts");
    expect(source).not.toContain("EdgeRuntime.waitUntil");
    expect(source).toContain("await doProcessing(adminClient, claimed");
    expect(source).toContain('.from("account_settings")');
    expect(source).toContain('decision === "reclaim_stale"');
    expect(source.indexOf("failureUpdateError")).toBeLessThan(source.indexOf('console.error("processing error"'));
  });

  it("recovers stale processing in cron and handles retry outcomes in the UI", () => {
    const retry = readProjectFile("supabase/functions/retry-failed-news/index.ts");
    const news = readProjectFile("src/pages/dashboard/News.tsx");
    expect(retry).toContain('.eq("status", "processing")');
    expect(retry).toContain('.lt("updated_at", staleIso)');
    expect(news).toContain("already_processing");
    expect(news).toContain("duplicate_ignored");
    expect(news).toContain("sync: true");
  });
});
