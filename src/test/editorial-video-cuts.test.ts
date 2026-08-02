import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CUT_MODE_OPTIONS,
  DEFAULT_EDITORIAL_CONFIG,
  EDITORIAL_MIN_DURATION_SECONDS,
  canScheduleEditorialCut,
  editorialDraftPayload,
  normalizeEditorialConfig,
  validateEditorialDraft,
} from "../lib/editorialCuts";
import {
  EDITORIAL_HEIGHT,
  EDITORIAL_REELS_HEIGHT,
  EDITORIAL_WIDTH,
  buildEditorialVideoFilter,
  editorialDimensions,
  editorialLayout,
  normalizeEditorialDraft,
} from "../../worker/editorialCut.js";
import { buildAssSubtitleFile } from "../../worker/subtitleStyles.js";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("Corte Editorial", () => {
  it("adiciona os três tipos sem remover formatos atuais", () => {
    expect(CUT_MODE_OPTIONS.map((option) => option.value)).toEqual(["traditional", "subtitled", "editorial"]);
    const formats = read("src/lib/videoCuts.ts");
    expect(formats).toContain('value: "reels"');
    expect(formats).toContain('value: "feed_portrait"');
    expect(formats).toContain('value: "feed_square"');
  });

  it("normaliza somente configurações visuais permitidas", () => {
    expect(normalizeEditorialConfig({
      framing: "smart_crop",
      font_family: "Montserrat",
      primary_color: "#123456",
      accent_color: "#ABCDEF",
      subtitles_enabled: false,
    })).toEqual({
      framing: "smart_crop",
      font_family: "Montserrat",
      primary_color: "#123456",
      accent_color: "#ABCDEF",
      subtitles_enabled: false,
    });
    expect(normalizeEditorialConfig({
      framing: "invalid" as never,
      primary_color: "red",
      accent_color: "javascript:alert(1)",
    })).toEqual(DEFAULT_EDITORIAL_CONFIG);
  });

  it("valida a revisão antes de solicitar o vídeo final", () => {
    const draft = {
      title: "Uma explicação clara sobre planejamento",
      comment: "O trecho apresenta uma forma prática de organizar as prioridades da semana.",
      startSeconds: 12.4,
      endSeconds: 45.2,
      transcriptText: "Neste trecho nós organizamos as prioridades da semana.",
      subtitleStyle: "clean" as const,
      config: DEFAULT_EDITORIAL_CONFIG,
    };
    expect(validateEditorialDraft(draft)).toBeNull();
    expect(editorialDraftPayload(draft)).toMatchObject({
      _start_seconds: 12.4,
      _end_seconds: 45.2,
      _subtitle_style: "clean",
    });
    expect(EDITORIAL_MIN_DURATION_SECONDS).toBe(20);
    expect(validateEditorialDraft({ ...draft, startSeconds: 12, endSeconds: 31 })).toContain("entre 20 e 180");
  });

  it("aceita texto somente quando a evidência literal e números estão na transcrição", () => {
    const transcript = "Neste exemplo nós organizamos três prioridades antes de começar a semana.";
    const accepted = normalizeEditorialDraft({
      title: "Três prioridades para começar a semana",
      comment: "O trecho mostra como organizar três prioridades antes de iniciar a semana.",
      confidence: 0.91,
      review_required: false,
      evidence: ["organizamos três prioridades"],
    }, transcript, "Planejamento semanal");
    expect(accepted.reviewRequired).toBe(false);
    expect(accepted.confidence).toBe(0.91);

    const rejected = normalizeEditorialDraft({
      title: "7 prioridades para começar a semana",
      comment: "O método tem 7 etapas comprovadas.",
      confidence: 0.99,
      evidence: ["organizamos três prioridades"],
    }, transcript, "Planejamento semanal");
    expect(rejected.reviewRequired).toBe(true);
    expect(rejected.safetyReason).toBe("unsupported_numeric_claim");
  });

  it("usa fallback neutro quando a IA não consegue provar o contexto", () => {
    const result = normalizeEditorialDraft({
      title: "Pessoa famosa anuncia uma novidade",
      comment: "Uma celebridade fez um anúncio histórico.",
      confidence: 0.95,
      evidence: ["frase que não existe"],
    }, "Hoje eu quero explicar como funciona este processo.", "Explicação do processo");
    expect(result).toMatchObject({
      title: "Explicação do processo",
      reviewRequired: true,
      safetyReason: "missing_transcript_evidence",
    });
  });

  it.each(["blur_fit", "contain", "smart_crop"] as const)("preserva proporção no enquadramento %s", (framing) => {
    const filter = buildEditorialVideoFilter({ duration: 18, framing });
    expect(filter).toContain("1080x1350");
    expect(filter).toContain("force_original_aspect_ratio");
    expect(filter).toContain("[vbase]");
    if (framing === "blur_fit") expect(filter).toContain("gblur");
    if (framing === "contain") expect(filter).toContain("force_original_aspect_ratio=decrease");
    if (framing === "smart_crop") expect(filter).toContain("min(iw*2,960)");
  });

  it("renderiza o mesmo layout editorial em Feed 4:5 e Reel 9:16", () => {
    expect(editorialDimensions("feed_portrait")).toEqual({
      width: EDITORIAL_WIDTH,
      height: EDITORIAL_HEIGHT,
      format: "feed_portrait",
    });
    expect(editorialDimensions("reels")).toEqual({
      width: EDITORIAL_WIDTH,
      height: EDITORIAL_REELS_HEIGHT,
      format: "reels",
    });

    const reelsFilter = buildEditorialVideoFilter({ duration: 18, framing: "blur_fit", format: "reels" });
    expect(reelsFilter).toContain("1080x1920");
    const reelsLayout = editorialLayout(EDITORIAL_WIDTH, EDITORIAL_REELS_HEIGHT);
    expect(reelsLayout.media.y + reelsLayout.media.height).toBeLessThan(reelsLayout.footerY);
    expect(reelsLayout.footerY).toBeLessThan(EDITORIAL_REELS_HEIGHT - 100);
  });

  it("mantém mídia, texto e rodapé dentro da área segura 4:5", () => {
    const layout = editorialLayout();
    expect([layout.width, layout.height]).toEqual([EDITORIAL_WIDTH, EDITORIAL_HEIGHT]);
    expect(layout.media.x).toBeGreaterThanOrEqual(60);
    expect(layout.media.y).toBeGreaterThan(350);
    expect(layout.media.x + layout.media.width).toBeLessThanOrEqual(1020);
    expect(layout.media.y + layout.media.height).toBeLessThan(layout.footerY);
  });

  it("mantém timestamps das legendas no vídeo 4:5", () => {
    const ass = buildAssSubtitleFile([
      { word: "Primeira", start: 0.2, end: 0.8 },
      { word: "frase.", start: 0.82, end: 1.5 },
      { word: "Depois", start: 2.1, end: 2.7 },
    ], "clean", "feed_portrait", { width: 1080, height: 1350 }, 5, { subtitlePosition: "safe_bottom" });
    expect(ass).toContain("PlayResX: 1080");
    expect(ass).toContain("PlayResY: 1350");
    expect(ass).toContain("0:00:00.20");
    expect(ass).toContain("0:00:01.50");
    expect(ass).toContain("0:00:02.10");
  });

  it("bloqueia agendamento até existir confirmação e vídeo final", () => {
    expect(canScheduleEditorialCut({ videoUrl: null, reviewConfirmedAt: null })).toBe(false);
    expect(canScheduleEditorialCut({ videoUrl: "https://cdn.test/final.mp4", reviewConfirmedAt: null })).toBe(false);
    expect(canScheduleEditorialCut({ videoUrl: null, reviewConfirmedAt: "2026-08-02T00:00:00Z" })).toBe(false);
    expect(canScheduleEditorialCut({ videoUrl: "https://cdn.test/final.mp4", reviewConfirmedAt: "2026-08-02T00:00:00Z" })).toBe(true);
  });

  it("fixa no banco a revisão explícita e o bloqueio de autopublicação", () => {
    const migration = read("supabase/migrations/20260802090000_add_editorial_video_cuts.sql");
    expect(migration).toContain("create_editorial_video_cut_job");
    expect(migration).toContain("create_editorial_video_cut_upload_job");
    expect(migration).toMatch(/cut_mode = 'editorial'[\s\S]*auto_publish = false/);
    expect(migration).toContain("request_editorial_cut_render");
    expect(migration).toContain("editorial_review_confirmed_at = now()");
    expect(migration).toContain("guard_unreviewed_editorial_cut_schedule");
  });

  it("aceita Bold/Clean na criação editorial e mantém Feed ou Reel sem corrida com o worker", () => {
    const migration = read("supabase/migrations/20260802164442_2b52a212-51a9-42c0-ad0f-681037be48ea.sql");
    const page = read("src/pages/dashboard/Cuts.tsx");
    const preview = read("src/components/cuts/EditorialCutPreview.tsx");
    const types = read("src/integrations/supabase/types.ts");

    expect(migration).toContain("create_editorial_video_cut_job_v2");
    expect(migration).toContain("create_editorial_video_cut_upload_job_v2");
    expect(migration.match(/WHEN v_style IN \('bold', 'clean'\) THEN 'classic'/g)).toHaveLength(2);
    expect(migration.match(/subtitle_style = v_style/g)).toHaveLength(2);
    expect(migration.match(/v_format NOT IN \('feed_portrait', 'reels'\)/g)).toHaveLength(2);
    expect(migration).toMatch(/subtitle_style = v_style,[\s\S]*auto_publish = false/);

    expect(page).toContain('"create_editorial_video_cut_job_v2"');
    expect(page).toContain('"create_editorial_video_cut_upload_job_v2"');
    expect(page).toContain('_format: formats[0]');
    expect(page).toContain('media_type: "reel"');
    expect(preview).toContain('"aspect-[9/16]"');
    expect(preview).toContain('Reel 1080 × 1920');
    expect(types).toContain("create_editorial_video_cut_job_v2");
    expect(types).toContain("create_editorial_video_cut_upload_job_v2");
  });

  it("mantém a Beta editorial exclusiva para administradores na tela e no banco", () => {
    const page = read("src/pages/dashboard/Cuts.tsx");
    const migration = read("supabase/migrations/20260802090000_add_editorial_video_cuts.sql");
    const edge = read("supabase/functions/regenerate-cut-editorial-text/index.ts");

    expect(page).toContain('<TabsTrigger value="create">Criar corte</TabsTrigger>');
    expect(page).toContain('<TabsTrigger value="history">Meus cortes</TabsTrigger>');
    expect(page).toContain('option.value !== "editorial" || isAdmin');
    expect(page).toContain("Beta admin");
    expect(page).toMatch(/cutMode === "editorial" && !isAdmin/);

    expect(migration).toContain("guard_editorial_cut_beta_access");
    expect(migration).toContain("trg_guard_editorial_cut_beta_access");
    expect(migration.match(/IF NOT public\.is_admin\(\) THEN/g)).toHaveLength(3);
    expect(migration).toContain("USING ERRCODE = '42501'");

    expect(edge).toContain('userClient.rpc("is_admin")');
    expect(edge).toContain('editorial_beta_admin_only');
    expect(edge).toContain("403");
  });

  it("cria prévia sem video final e impede auto-publish no worker", () => {
    const worker = read("worker/index.js");
    expect(worker).toMatch(/previewOnly\s*\?\s*\{ editorial_preview_url: url, video_url: null \}/);
    expect(worker).toContain('if (!isEditorialCut && job.auto_publish');
    expect(worker).toContain('job?.cut_mode === "editorial"');
    expect(worker).toContain("source_encode_count: 1");
    expect(worker).toContain("loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a]");
  });

  it("impõe 20 segundos e isola a identidade real da conta no Corte Editorial", () => {
    const worker = read("worker/index.js");
    const overlay = read("worker/editorialCut.js");
    const migration = read("supabase/migrations/20260802200000_enforce_editorial_cut_identity_duration.sql");

    expect(worker).toContain("const EDITORIAL_MIN_CUT_SECONDS = 20");
    expect(worker).toContain("resolveInstagramEditorialIdentity");
    expect(worker).toContain("instagram_profile_identity");
    expect(overlay).toContain("accountVerified = false");
    expect(overlay).toContain('ctx.fillStyle = "#1D9BF0"');
    expect(migration).toContain("trg_guard_editorial_cut_min_duration");
    expect(migration).toContain("v_duration < 20");
  });

  it("regenera somente texto sem persistir nem processar vídeo", () => {
    const edge = read("supabase/functions/regenerate-cut-editorial-text/index.ts");
    expect(edge).toContain("persisted: false");
    expect(edge).toContain("video_reprocessed: false");
    expect(edge).not.toContain('.update(');
    expect(edge).not.toContain("scheduled_posts");
  });
});
