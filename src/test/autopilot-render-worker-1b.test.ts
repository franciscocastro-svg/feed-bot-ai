import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readProjectFile = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("Autopiloto Render Worker 1B", () => {
  const processor = readProjectFile("supabase/functions/process-news/index.ts");
  const worker = readProjectFile("worker/index.js");
  const publisher = readProjectFile("supabase/functions/publish-scheduler/index.ts");
  const migration = readProjectFile("supabase/migrations/20260715170000_autopilot_render_worker_1b.sql");

  it("keeps Resvg, fonts and Canvas outside process-news", () => {
    expect(processor).not.toContain("@resvg/resvg-wasm");
    expect(processor).not.toContain("initWasm");
    expect(processor).not.toContain("svgToPng");
    expect(processor).not.toContain("loadInterFontBuffers");
    expect(processor).toContain('editorial_ready: false');
    expect(processor).toContain('render_queued: true');
  });

  it("does not spend a second AI request choosing audio", () => {
    expect(processor).toContain("stableTrackIndex");
    expect(processor).toContain("audio-pick-local");
    expect(processor).not.toContain("Você escolhe a trilha sonora ideal");
  });

  it("claims one durable render job with a fenced lease", () => {
    expect(worker).toContain('supabase.rpc("claim_editorial_render_jobs"');
    expect(worker).toContain('supabase.rpc("complete_editorial_render_job"');
    expect(worker).toContain("claim expirou ou mudou de dono");
    expect(migration).toContain("for update of sp skip locked");
    expect(migration).toContain("media_render_claimed_by");
    expect(migration).toContain("media_render_next_retry_at");
  });

  it("keeps publication blocked until the worker finishes the asset", () => {
    expect(publisher).toContain("if (!news?.editorial_ready) return false");
    expect(worker).toContain('update({ editorial_ready: true })');
    expect(migration).toContain("ni.editorial_ready = false");
    expect(migration).toContain("ni.status = 'scheduled'");
  });

  it("exposes render RPCs only to service_role", () => {
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = public, pg_catalog");
  });
});
