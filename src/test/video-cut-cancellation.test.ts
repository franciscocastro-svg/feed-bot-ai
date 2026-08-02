import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canCancelVideoCutJob } from "@/lib/videoCuts";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("cancelamento seguro de Cortes IA", () => {
  it("oferece cancelamento somente enquanto o trabalho ainda está ativo", () => {
    expect(canCancelVideoCutJob("queued")).toBe(true);
    expect(canCancelVideoCutJob("analyzing")).toBe(true);
    expect(canCancelVideoCutJob("processing")).toBe(true);
    expect(canCancelVideoCutJob("ready")).toBe(false);
    expect(canCancelVideoCutJob("failed")).toBe(false);
    expect(canCancelVideoCutJob("cancelled")).toBe(false);
  });

  it("protege a RPC por autenticação, propriedade, status e bloqueio de linha", () => {
    const migration = read("supabase/migrations/20260802220000_cancel_video_cut_jobs.sql");

    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = public, pg_catalog");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("v_job.user_id <> v_user_id AND NOT public.is_admin()");
    expect(migration).toContain("v_job.status NOT IN ('queued', 'analyzing', 'processing')");
    expect(migration).toContain("v_job.status = 'cancelled'");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.cancel_video_cut_job(uuid) FROM PUBLIC, anon");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.cancel_video_cut_job(uuid) TO authenticated");
  });

  it("cancela e libera a reserva de créditos de forma atômica e idempotente", () => {
    const migration = read("supabase/migrations/20260802220000_cancel_video_cut_jobs.sql");

    expect(migration).toContain("reserved_count = GREATEST(0, reserved_count - v_job.reserved_clips)");
    expect(migration).toMatch(/SET status = 'cancelled',[\s\S]*reserved_clips = 0/);
    expect(migration).toContain("error_message = NULL");
    expect(migration).toContain("'already_cancelled', true");
    expect(migration).toContain("'released_credits', v_job.reserved_clips");
  });

  it("mantém o worker cooperativo e impede publicação ou conclusão após o cancelamento", () => {
    const worker = read("worker/index.js");

    expect(worker).toContain("class VideoCutJobCancelledError extends Error");
    expect(worker).toContain("await assertVideoCutJobNotCancelled(job.id)");
    expect(worker).toContain('.neq("status", "cancelled")');
    expect(worker).toContain("await cleanupCancelledVideoCutJob(job)");
    expect(worker).toMatch(/async function autoPublishClip[\s\S]*videoCutJobWasCancelled\(job\.id\)/);
    expect(worker).toContain('supabase.storage.from("post-images").remove(paths)');
  });

  it("exibe confirmação, estado de carregamento e permite excluir depois", () => {
    const page = read("src/pages/dashboard/Cuts.tsx");

    expect(page).toContain('db.rpc<CancelVideoCutJobResult>("cancel_video_cut_job"');
    expect(page).toContain("Cancelar fila");
    expect(page).toContain("setCancellingJobId(job.id)");
    expect(page).toContain("os créditos reservados serão liberados");
    expect(page).toContain("canDeleteJob(job)");
  });
});
