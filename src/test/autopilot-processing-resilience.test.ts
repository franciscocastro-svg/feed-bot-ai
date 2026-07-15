import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readProjectFile = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("autopilot processing resilience", () => {
  const autopilot = readProjectFile("supabase/functions/autopilot/index.ts");
  const processor = readProjectFile("supabase/functions/process-news/index.ts");
  const retry = readProjectFile("supabase/functions/retry-failed-news/index.ts");

  it("dispatches asynchronous processing without holding the cron for 120 seconds", () => {
    expect(autopilot).not.toContain("waitForProcessedNews");
    expect(autopilot).not.toContain("sync: true");
    expect(autopilot).toContain("processing_started");
    expect(autopilot).toContain("r.status === 202");
  });

  it("uses the shared three-minute abandonment policy with a fenced recovery", () => {
    expect(autopilot).toContain("STALE_NEWS_PROCESSING_MS");
    expect(autopilot).toContain('.eq("status", "processing")');
    expect(autopilot).toContain('.eq("updated_at", (stuck as any).updated_at)');
    expect(retry).toContain('.eq("updated_at", stale.updated_at)');
  });

  it("does not spend a second provider call only to lengthen captions", () => {
    expect(processor).toContain("acceptCaptionWithoutQualityRetry");
    expect(processor).not.toContain("return await rewriteWithGemini(item, tone, srcOpts, attempt + 1)");
    expect(processor).not.toContain("return await rewriteWithGroq(item, tone, srcOpts, attempt + 1)");
    expect(processor).toContain("const maxApiAttempts = 2");
  });

  it("bounds provider calls and opens an auth circuit breaker for Groq", () => {
    expect(processor).toContain("AI_PROVIDER_TIMEOUT_MS");
    expect(processor).toContain("GROQ_AUTH_CIRCUIT_BREAKER_MS");
    expect(processor).toContain("credencial inválida ou expirada");
    expect(processor).toContain("signal: AbortSignal.timeout(AI_PROVIDER_TIMEOUT_MS)");
  });

  it("fences the final processed transition against a reclaimed task", () => {
    expect(processor).toContain('.eq("status", "processing").select("id").maybeSingle()');
    expect(processor).toContain("Processamento perdeu o claim antes de concluir");
  });
});
