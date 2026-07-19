import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

const migration = read("supabase/migrations/20260719180000_configurable_editorial_reel_duration.sql");
const settings = read("src/pages/dashboard/Settings.tsx");
const news = read("src/pages/dashboard/News.tsx");
const worker = read("worker/index.js");
const types = read("src/integrations/supabase/types.ts");

describe("Contrato dos Reels editoriais configuráveis", () => {
  it("persiste uma preferência global restrita a 6, 20 ou 30, com padrão 20", () => {
    expect(migration).toContain("alter table public.user_settings\n  add column if not exists editorial_reel_duration_seconds smallint not null default 20");
    expect(migration).toContain("alter table public.news_items\n  add column if not exists editorial_reel_duration_seconds smallint;");
    expect(migration).toContain("check (editorial_reel_duration_seconds in (6, 20, 30))");
    expect(settings).toContain("editorial_reel_duration_seconds: normalizeEditorialReelDuration");
    expect(settings).toContain('<SelectItem value="6">6 segundos — curto e direto</SelectItem>');
    expect(settings).toContain('<SelectItem value="20">20 segundos — equilibrado (padrão)</SelectItem>');
    expect(settings).toContain('<SelectItem value="30">30 segundos — mais contexto</SelectItem>');
    expect(news).toContain("Carregando duração…");
    expect(news).toContain("O agendamento foi bloqueado para evitar divergências");
    expect(news).toContain("itemDurationSnapshot !== null && itemDurationSnapshot !== undefined");
    expect(types.match(/editorial_reel_duration_seconds/g)?.length).toBe(6);
  });

  it("tira um snapshot apenas para Reel editorial sem MP4 e exclui Cortes IA", () => {
    expect(migration).toContain("if new.media_type is distinct from 'reel'");
    expect(migration).toContain("item.content_type is distinct from 'video_cut'");
    expect(migration).toContain("item.content_format is distinct from 'carrossel'");
    expect(migration).toContain("item.generated_video_url is null");
    expect(migration).toContain("item.editorial_reel_duration_seconds is null");
    expect(migration).toContain("before insert or update of media_type, news_item_id, user_id");
    expect(migration).toContain("set editorial_reel_duration_seconds = v_duration");
  });

  it("usa o snapshot nos dois caminhos de render e preserva o fallback de 20 segundos", () => {
    expect(worker.match(/normalizeEditorialReelDuration\(item\.editorial_reel_duration_seconds\)/g)?.length).toBe(2);
    expect(worker.match(/buildStandardNewsReelCommand\(/g)?.length).toBe(3);
    expect(worker.match(/validateStandardNewsReel\(tempVideoPath, durationSeconds\)/g)?.length).toBe(2);
    expect(worker).toContain("DEFAULT_EDITORIAL_REEL_DURATION_SECONDS = 20");
  });

  it("mantém Stories e Cortes IA fora da configuração editorial", () => {
    expect(news).toContain("imageToReelVideo(sourceUrl, 6)");
    expect(settings).toContain("Stories e Cortes IA não mudam");
    expect(worker).toContain('if (item.content_type === "video_cut")');
    expect(worker).toContain("originalVideoUrl");
  });
});
