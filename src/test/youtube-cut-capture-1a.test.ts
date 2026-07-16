import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const worker = read("worker/index.js");
const cuts = read("src/pages/dashboard/Cuts.tsx");
const migration = read("supabase/migrations/20260717003000_youtube_cut_capture_resilience_1a.sql");

describe("Cortes IA por Link 1A", () => {
  it("usa duração natural ampla em vez de um corte rígido de 30/60 segundos", () => {
    expect(worker).toContain("MAX_NATURAL_CUT_SECONDS = 180");
    expect(worker).toContain("A coerência vence a duração");
    expect(worker).not.toContain("Cortes de 15 a 60 segundos");
    expect(worker).not.toContain("Cada corte deve ter entre 15 e 60 segundos");
  });

  it("fortalece captura, diagnóstico e heartbeat do worker", () => {
    expect(worker).toContain('"--retries", "3"');
    expect(worker).toContain('"--fragment-retries", "3"');
    expect(worker).toContain("classifyYoutubeCaptureError");
    expect(worker).toContain("startVideoCutClaimHeartbeat");
    expect(worker).toContain("capture_error_code");
  });

  it("normaliza URL e bloqueia dois jobs simultâneos do mesmo vídeo", () => {
    expect(migration).toContain("normalize_youtube_video_url");
    expect(migration).toContain("source_video_id");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("Este vídeo já possui um trabalho em andamento");
  });

  it("mantém RPCs privadas e recuperação baseada em heartbeat", () => {
    expect(migration).toContain("COALESCE(updated_at, claimed_at) < now() - interval '30 minutes'");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.claim_video_cut_jobs(text, integer) FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon");
  });

  it("orienta fallback MP4 sem obrigar o cliente a reconfigurar o trabalho", () => {
    expect(cuts).toContain("prepareUploadFallback");
    expect(cuts).toContain("Usar MP4 com estas configurações");
    expect(cuts).toContain("normalizeYoutubeUrl(youtubeUrl)");
  });

  it("fixa dependências próprias do worker para o deploy do VPS", () => {
    expect(fs.existsSync(path.join(root, "worker/package-lock.json"))).toBe(true);
    expect(read("scripts/deploy-vps.sh")).toContain("npm --prefix worker ci --omit=dev");
  });
});
