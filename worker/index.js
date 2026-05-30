import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import dotenv from "dotenv";

const execAsync = promisify(exec);

// Configuração de caminhos e env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Tenta carregar env do diretório do worker ou da raiz do projeto
if (fs.existsSync(path.join(__dirname, ".env"))) {
  dotenv.config({ path: path.join(__dirname, ".env") });
} else {
  dotenv.config({ path: path.join(__dirname, "..", ".env") });
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const WORKER_ID = process.env.WORKER_ID || `vps-${process.pid}`;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("ERRO: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não definidos no .env!");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const TEMP_DIR = path.join(__dirname, "temp");
const FONTS_DIR = path.join(__dirname, "fonts");

// Garante que as pastas necessárias existam
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
if (!fs.existsSync(FONTS_DIR)) fs.mkdirSync(FONTS_DIR, { recursive: true });

// Baixa um arquivo de forma simples
async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao baixar ${url}: ${res.statusText}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.promises.writeFile(destPath, buffer);
}

// Configura as fontes Inter (Regular e Bold)
async function setupFonts() {
  const fontRegularPath = path.join(FONTS_DIR, "Inter-Regular.ttf");
  const fontBoldPath = path.join(FONTS_DIR, "Inter-Bold.ttf");

  if (!fs.existsSync(fontRegularPath)) {
    console.log("Baixando fonte Inter-Regular.ttf...");
    await downloadFile("https://github.com/google/fonts/raw/main/ofl/inter/static/Inter-Regular.ttf", fontRegularPath);
  }
  if (!fs.existsSync(fontBoldPath)) {
    console.log("Baixando fonte Inter-Bold.ttf...");
    await downloadFile("https://github.com/google/fonts/raw/main/ofl/inter/static/Inter-Bold.ttf", fontBoldPath);
  }

  // Registra as fontes no Canvas global
  GlobalFonts.registerFromPath(fontRegularPath, "Inter");
  GlobalFonts.registerFromPath(fontBoldPath, "InterBold");
  console.log("Fontes Inter carregadas com sucesso!");
}

// Carrega imagem localmente para evitar problemas de CORS
async function loadImageHelper(url) {
  if (!url) return null;
  // Proxy de imagem do weserv (igual ao front)
  const cleanUrl = url.replace(/&amp;/gi, "&").replace(/^https?:\/\//, "");
  const proxiedUrl = `https://images.weserv.nl/?url=${encodeURIComponent(cleanUrl)}&output=jpg`;
  
  const tempFile = path.join(TEMP_DIR, `img_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`);
  try {
    await downloadFile(proxiedUrl, tempFile);
    const img = await loadImage(tempFile);
    try { await fs.promises.unlink(tempFile); } catch {}
    return img;
  } catch (e) {
    console.warn(`Aviso: falha ao carregar imagem via proxy: ${url}. Tentando direto...`);
    try {
      await downloadFile(url, tempFile);
      const img = await loadImage(tempFile);
      try { await fs.promises.unlink(tempFile); } catch {}
      return img;
    } catch (err) {
      console.error(`Erro ao carregar imagem: ${url}`, err);
      try { if (fs.existsSync(tempFile)) await fs.promises.unlink(tempFile); } catch {}
      return null;
    }
  }
}

// Quebra de texto do Canvas
function wrapText(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

// 1. Renderiza e faz upload do Post (1080x1080)
async function composeAndUploadPostNode(item, settings) {
  const SIZE = 1080;
  const handle = (settings?.brand_handle || settings?.brand_name || "").replace(/^@/, "");
  const title = (item.rewritten_title || item.original_title || "").toUpperCase();
  const subtitle = item.rewritten_summary || "";

  let photoImg = null;
  let logoImg = null;
  if (item.original_image_url) photoImg = await loadImageHelper(item.original_image_url);
  if (settings?.brand_logo_url) logoImg = await loadImageHelper(settings.brand_logo_url);

  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");

  // Fundo branco no topo
  const headerH = 528;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, SIZE, headerH);

  // Avatar/Logo do usuário
  const ax = 70, ay = 80, ar = 36;
  ctx.beginPath();
  ctx.arc(ax, ay, ar + 2, 0, Math.PI * 2);
  ctx.fillStyle = "#F4F4F5";
  ctx.fill();
  if (logoImg) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, ay, ar, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logoImg, ax - ar, ay - ar, ar * 2, ar * 2);
    ctx.restore();
  }

  // Handle do usuário
  ctx.fillStyle = "#000000";
  ctx.font = "800 22px InterBold, Inter, sans-serif";
  ctx.fillText(`@${handle.toUpperCase()}`, ax + ar + 22, ay + 10);

  // Ponto vermelho (badge decorativa)
  ctx.beginPath();
  ctx.arc(1020, ay, 9, 0, Math.PI * 2);
  ctx.fillStyle = "#DC2626";
  ctx.fill();

  // Linha divisória
  ctx.fillStyle = "#000000";
  ctx.fillRect(60, 140, 960, 1.5);

  // Título
  ctx.fillStyle = "#000000";
  ctx.font = "900 56px InterBold, Inter, sans-serif";
  const titleLines = wrapText(ctx, title, 960).slice(0, 4);
  titleLines.forEach((l, i) => ctx.fillText(l, 60, 210 + i * 60));

  // Subtítulo/Resumo
  ctx.fillStyle = "#52525B";
  ctx.font = "500 24px Inter, sans-serif";
  const subLines = wrapText(ctx, subtitle, 960).slice(0, 2);
  subLines.forEach((l, i) => ctx.fillText(l, 60, 440 + i * 32));

  // Imagem principal na parte de baixo
  const py = headerH, ph = SIZE - headerH;
  if (photoImg) {
    const ratio = Math.max(SIZE / photoImg.width, ph / photoImg.height);
    const sw = SIZE / ratio, sh = ph / ratio;
    const sx = (photoImg.width - sw) / 2, sy = (photoImg.height - sh) / 2;
    ctx.drawImage(photoImg, sx, sy, sw, sh, 0, py, SIZE, ph);
  } else {
    // Gradiente caso não tenha imagem
    const grad = ctx.createLinearGradient(0, py, SIZE, SIZE);
    grad.addColorStop(0, "#1E1B4B");
    grad.addColorStop(0.5, "#7C3AED");
    grad.addColorStop(1, "#FFD400");
    ctx.fillStyle = grad;
    ctx.fillRect(0, py, SIZE, ph);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "900 64px InterBold, Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`@${handle.toUpperCase()}`, SIZE / 2, py + ph / 2);
    ctx.textAlign = "left";
  }

  // Badge "LEIA A LEGENDA"
  const bw = 360, bh = 60, bx = SIZE - bw - 60, by = 498;
  ctx.fillStyle = "#FFD400";
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = "#000000";
  ctx.font = "900 22px InterBold, Inter, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("LEIA A LEGENDA →", bx + bw / 2, by + 40);
  ctx.textAlign = "left";

  const buffer = await canvas.encode("png");
  const pathStorage = `${item.user_id}/${item.id}.png`;

  const { error } = await supabase.storage.from("post-images").upload(pathStorage, buffer, {
    contentType: "image/png",
    upsert: true,
  });

  if (error) throw error;

  const { data: pub } = supabase.storage.from("post-images").getPublicUrl(pathStorage);
  const url = `${pub.publicUrl}?t=${Date.now()}`;

  await supabase.from("news_items").update({ generated_image_url: url }).eq("id", item.id);
  return url;
}

// 2. Renderiza e faz upload do Story Cover (1080x1920)
async function composeAndUploadStoryNode(item, settings, opts = {}) {
  const W = 1080;
  const H = 1920;

  const title = (item.rewritten_title?.trim() || item.original_title?.trim() || "Notícia");
  const subtitle = (item.rewritten_summary?.trim() || item.original_content?.replace(/<[^>]+>/g, " ").trim().slice(0, 220) || "");
  const sourceName = (item.source_name || "").trim();
  const handle = (settings?.brand_handle || settings?.brand_name || "").replace(/^@/, "").trim();

  let photoImg = null;
  if (item.original_image_url) photoImg = await loadImageHelper(item.original_image_url);

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  // Imagem fullscreen
  if (photoImg) {
    const ratio = Math.max(W / photoImg.width, H / photoImg.height);
    const sw = W / ratio, sh = H / ratio;
    const sx = (photoImg.width - sw) / 2;
    const sy = (photoImg.height - sh) / 2;
    ctx.drawImage(photoImg, sx, sy, sw, sh, 0, 0, W, H);
  } else {
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#1E1B4B");
    grad.addColorStop(1, "#0A0A0A");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  const SAFE_TOP = 230;
  const SAFE_BOTTOM = 320;

  // Gradiente do topo
  const topGrad = ctx.createLinearGradient(0, 0, 0, SAFE_TOP + 200);
  topGrad.addColorStop(0, "rgba(0,0,0,0.65)");
  topGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, W, SAFE_TOP + 200);

  // Gradiente da base
  const bottomGradH = 700;
  const bottomGrad = ctx.createLinearGradient(0, H - bottomGradH, 0, H);
  bottomGrad.addColorStop(0, "rgba(0,0,0,0)");
  bottomGrad.addColorStop(0.45, "rgba(0,0,0,0.6)");
  bottomGrad.addColorStop(1, "rgba(0,0,0,0.92)");
  ctx.fillStyle = bottomGrad;
  ctx.fillRect(0, H - bottomGradH, W, bottomGradH);

  // Badge "URGENTE"
  const badgeText = "URGENTE";
  ctx.font = "900 44px InterBold, Inter, sans-serif";
  const bw = ctx.measureText(badgeText).width + 70;
  const bh = 84;
  const bx = 60, by = SAFE_TOP + 20;
  ctx.fillStyle = "#DC2626";
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = "#FFFFFF";
  ctx.textBaseline = "middle";
  ctx.fillText(badgeText, bx + 35, by + bh / 2 + 2);

  // Nome da fonte da notícia ao lado do badge
  if (sourceName) {
    ctx.font = "700 32px InterBold, Inter, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fillText(sourceName.toUpperCase(), bx + bw + 24, by + bh / 2 + 2);
  }

  const padX = 70;
  const maxW = W - padX * 2;
  ctx.textBaseline = "alphabetic";

  // Título
  ctx.font = "900 76px InterBold, Inter, sans-serif";
  const titleLines = wrapText(ctx, title, maxW).slice(0, 5);
  const titleLH = 86;
  const titleBlockH = titleLines.length * titleLH;

  // Subtítulo
  ctx.font = "500 32px Inter, sans-serif";
  const subLines = subtitle ? wrapText(ctx, subtitle, maxW).slice(0, 3) : [];
  const subLH = 44;
  const subBlockH = subLines.length * subLH;

  // Posicionamento do bloco
  const blockBottom = H - SAFE_BOTTOM;
  const totalH = titleBlockH + (subBlockH ? subBlockH + 30 : 0);
  const y = blockBottom - totalH;

  // Backdrop preto suave
  const backdropPadTop = 80;
  const backdropPadBottom = 40;
  const backdropY = y - backdropPadTop;
  const backdropH = totalH + backdropPadTop + backdropPadBottom;
  const textGrad = ctx.createLinearGradient(0, backdropY, 0, backdropY + backdropH);
  textGrad.addColorStop(0, "rgba(0,0,0,0)");
  textGrad.addColorStop(0.25, "rgba(0,0,0,0.55)");
  textGrad.addColorStop(1, "rgba(0,0,0,0.85)");
  ctx.fillStyle = textGrad;
  ctx.fillRect(0, backdropY, W, backdropH + 200);

  // Título com sombra
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "900 76px InterBold, Inter, sans-serif";
  titleLines.forEach((l, i) => {
    ctx.fillText(l, padX, y + (i + 1) * titleLH - 14);
  });

  // Subtítulo
  if (subLines.length) {
    const subY = y + titleBlockH + 30;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "500 32px Inter, sans-serif";
    subLines.forEach((l, i) => {
      ctx.fillText(l, padX, subY + (i + 1) * subLH - 12);
    });
  }

  // Acento editorial amarelo
  ctx.fillStyle = "#FFD400";
  ctx.fillRect(padX, y - 28, 100, 6);

  // CTA Siga
  if (handle && opts.withFollowCta) {
    const ctaText = `👉 SIGA @${handle.toUpperCase()} PARA MAIS`;
    ctx.font = "800 28px InterBold, Inter, sans-serif";
    const ctw = ctx.measureText(ctaText).width + 44;
    const cth = 56;
    const cx = padX, cy = y - 28 - cth - 22;

    ctx.fillStyle = "rgba(255, 212, 0, 0.95)";
    ctx.beginPath();
    const r = cth / 2;
    ctx.moveTo(cx + r, cy);
    ctx.arcTo(cx + ctw, cy, cx + ctw, cy + cth, r);
    ctx.arcTo(cx + ctw, cy + cth, cx, cy + cth, r);
    ctx.arcTo(cx, cy + cth, cx, cy, r);
    ctx.arcTo(cx, cy, cx + ctw, cy, r);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#000000";
    ctx.textBaseline = "middle";
    ctx.fillText(ctaText, cx + 22, cy + cth / 2 + 1);
    ctx.textBaseline = "alphabetic";
  }

  const buffer = await canvas.encode("jpeg");
  const pathStorage = `${item.user_id}/${item.id}-story.jpg`;

  const { error } = await supabase.storage.from("post-images").upload(pathStorage, buffer, {
    contentType: "image/jpeg",
    upsert: true,
  });

  if (error) throw error;

  const { data: pub } = supabase.storage.from("post-images").getPublicUrl(pathStorage);
  const url = `${pub.publicUrl}?t=${Date.now()}`;

  await supabase.from("news_items").update({ generated_cover_url: url }).eq("id", item.id);
  return url;
}

// 3. Mescla imagem de capa + áudio com FFmpeg e gera o Reel (MP4)
async function generateReelVideoNode(item, settings) {
  // 1) Garante a capa editorial 9:16
  let sourceUrl = item.generated_cover_url;
  if (!sourceUrl) {
    console.log(`[reel] Gerando capa editorial para o item ${item.id}...`);
    sourceUrl = await composeAndUploadStoryNode(item, settings, { withFollowCta: true });
  }

  // 2) Caminhos dos arquivos temporários locais
  const idStr = `${item.user_id.substring(0, 5)}_${item.id.substring(0, 8)}`;
  const tempImgPath = path.join(TEMP_DIR, `cover_${idStr}.jpg`);
  const tempAudioPath = path.join(TEMP_DIR, `audio_${idStr}.mp3`);
  const tempVideoPath = path.join(TEMP_DIR, `reel_${idStr}.mp4`);

  try {
    // Limpa arquivos velhos caso existam
    for (const f of [tempImgPath, tempAudioPath, tempVideoPath]) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }

    console.log(`[reel] Baixando imagem da capa de ${sourceUrl}...`);
    await downloadFile(sourceUrl, tempImgPath);

    const audioUrl = item.chosen_audio_url || settings?.reel_audio_url;
    let hasAudio = false;

    if (audioUrl) {
      // Remove cache buster
      const cleanAudioUrl = audioUrl.split("?")[0];
      console.log(`[reel] Baixando áudio de ${cleanAudioUrl}...`);
      try {
        await downloadFile(cleanAudioUrl, tempAudioPath);
        hasAudio = true;
      } catch (err) {
        console.warn(`[reel] Aviso: falha ao baixar áudio, gerando Reel sem som.`, err);
      }
    }

    // Executa ffmpeg local
    console.log(`[reel] Iniciando compilação do vídeo no FFmpeg...`);
    let ffmpegCmd = "";
    if (hasAudio) {
      // Mescla imagem estática em loop de 6 segundos com a música cortada em 6 segundos
      ffmpegCmd = `ffmpeg -y -loop 1 -i "${tempImgPath}" -i "${tempAudioPath}" -c:v libx264 -t 6 -pix_fmt yuv420p -c:a aac -shortest -b:v 6M -b:a 128k "${tempVideoPath}"`;
    } else {
      // Gera vídeo de 6 segundos apenas com imagem estática (sem som)
      ffmpegCmd = `ffmpeg -y -loop 1 -i "${tempImgPath}" -c:v libx264 -t 6 -pix_fmt yuv420p -b:v 6M "${tempVideoPath}"`;
    }

    console.log(`[ffmpeg] Rodando comando: ${ffmpegCmd}`);
    const { stdout, stderr } = await execAsync(ffmpegCmd);
    
    if (!fs.existsSync(tempVideoPath) || fs.statSync(tempVideoPath).size < 1000) {
      throw new Error(`Vídeo não foi gerado ou está vazio. stderr: ${stderr}`);
    }

    console.log(`[reel] Vídeo gerado localmente com sucesso (${fs.statSync(tempVideoPath).size} bytes). Realizando upload...`);

    const videoBuffer = await fs.promises.readFile(tempVideoPath);
    const pathStorage = `${item.user_id}/${item.id}.mp4`;

    const { error: uploadError } = await supabase.storage.from("post-images").upload(pathStorage, videoBuffer, {
      contentType: "video/mp4",
      upsert: true,
    });

    if (uploadError) throw uploadError;

    const { data: pub } = supabase.storage.from("post-images").getPublicUrl(pathStorage);
    const videoUrl = pub.publicUrl;

    console.log(`[reel] Upload de vídeo concluído: ${videoUrl}`);

    await supabase.from("news_items")
      .update({ generated_video_url: videoUrl, editorial_ready: true })
      .eq("id", item.id);

    return videoUrl;

  } finally {
    // Limpeza de arquivos temporários
    for (const f of [tempImgPath, tempAudioPath, tempVideoPath]) {
      try {
        if (fs.existsSync(f)) {
          fs.unlinkSync(f);
        }
      } catch {}
    }
  }
}

async function generateReelVideoFromJob(job) {
  if (!job.cover_url) throw new Error("Job de Reel sem cover_url");

  const idStr = `${job.user_id.substring(0, 5)}_${job.news_item_id.substring(0, 8)}_${job.id.substring(0, 8)}`;
  const tempImgPath = path.join(TEMP_DIR, `job_cover_${idStr}.jpg`);
  const tempAudioPath = path.join(TEMP_DIR, `job_audio_${idStr}.mp3`);
  const tempVideoPath = path.join(TEMP_DIR, `job_reel_${idStr}.mp4`);

  try {
    for (const f of [tempImgPath, tempAudioPath, tempVideoPath]) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }

    console.log(`[job:${job.id}] Baixando capa do Reel...`);
    await downloadFile(job.cover_url, tempImgPath);

    let hasAudio = false;
    if (job.audio_url) {
      try {
        console.log(`[job:${job.id}] Baixando áudio do Reel...`);
        await downloadFile(job.audio_url.split("?")[0], tempAudioPath);
        hasAudio = true;
      } catch (err) {
        console.warn(`[job:${job.id}] Falha ao baixar áudio, gerando sem som.`, err);
      }
    }

    const ffmpegCmd = hasAudio
      ? `ffmpeg -y -loop 1 -i "${tempImgPath}" -i "${tempAudioPath}" -c:v libx264 -t 6 -pix_fmt yuv420p -c:a aac -shortest -b:v 6M -b:a 128k "${tempVideoPath}"`
      : `ffmpeg -y -loop 1 -i "${tempImgPath}" -c:v libx264 -t 6 -pix_fmt yuv420p -b:v 6M "${tempVideoPath}"`;

    console.log(`[job:${job.id}] Gerando MP4 com FFmpeg...`);
    const { stderr } = await execAsync(ffmpegCmd);
    if (!fs.existsSync(tempVideoPath) || fs.statSync(tempVideoPath).size < 1000) {
      throw new Error(`Vídeo não foi gerado ou está vazio. stderr: ${stderr}`);
    }

    const videoBuffer = await fs.promises.readFile(tempVideoPath);
    const pathStorage = `${job.user_id}/${job.news_item_id}.mp4`;
    const { error: uploadError } = await supabase.storage.from("post-images").upload(pathStorage, videoBuffer, {
      contentType: "video/mp4",
      upsert: true,
    });
    if (uploadError) throw uploadError;

    const { data: pub } = supabase.storage.from("post-images").getPublicUrl(pathStorage);
    const videoUrl = pub.publicUrl;

    await supabase.from("news_items")
      .update({ generated_video_url: videoUrl, editorial_ready: true, error_message: null })
      .eq("id", job.news_item_id);

    await supabase.from("reel_render_jobs")
      .update({ status: "done", output_url: videoUrl, completed_at: new Date().toISOString(), error_message: null })
      .eq("id", job.id);

    console.log(`[job:${job.id}] Reel pronto: ${videoUrl}`);
    return videoUrl;
  } catch (err) {
    const message = err?.message || String(err);
    const finalStatus = job.attempts >= job.max_attempts ? "failed" : "queued";
    await supabase.from("reel_render_jobs")
      .update({
        status: finalStatus,
        claimed_at: null,
        claimed_by: null,
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    await supabase.from("news_items")
      .update({ error_message: `Worker VPS erro: ${message}` })
      .eq("id", job.news_item_id);
    throw err;
  } finally {
    for (const f of [tempImgPath, tempAudioPath, tempVideoPath]) {
      try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch {}
    }
  }
}

async function processQueuedReelJobs() {
  const { data: jobs, error } = await supabase.rpc("claim_reel_jobs", { _worker: WORKER_ID, _limit: 3 });
  if (error) {
    console.error("Erro ao reclamar jobs de Reel:", error);
    return 0;
  }
  if (!jobs?.length) return 0;

  console.log(`Fila reel_render_jobs: ${jobs.length} job(s) reclamado(s).`);
  for (const job of jobs) {
    try {
      await generateReelVideoFromJob(job);
    } catch (err) {
      console.error(`[job:${job.id}] Falha ao gerar Reel:`, err);
    }
  }
  return jobs.length;
}

// Processa uma publicação agendada
async function processPost(post) {
  const news = post.news_items;
  console.log(`--- [PROCESSANDO] Post ${post.id} (Tipo: ${post.media_type}) | Usuário: ${post.user_id} | News: ${news.id} ---`);

  // Busca configurações da marca do usuário
  const { data: settings, error: settingsError } = await supabase
    .from("user_settings")
    .select("brand_handle, brand_name, brand_logo_url, reel_audio_url")
    .eq("user_id", post.user_id)
    .maybeSingle();

  if (settingsError) {
    console.error(`Erro ao buscar configurações do usuário ${post.user_id}:`, settingsError);
    return;
  }

  try {
    if (post.media_type === "feed") {
      const url = await composeAndUploadPostNode(news, settings);
      await supabase.from("news_items").update({ editorial_ready: true }).eq("id", news.id);
      console.log(`[OK] Post no Feed processado: ${url}`);
    } else if (post.media_type === "story") {
      const url = await composeAndUploadStoryNode(news, settings);
      await supabase.from("news_items").update({ editorial_ready: true }).eq("id", news.id);
      console.log(`[OK] Story processado: ${url}`);
    } else if (post.media_type === "reel") {
      const url = await generateReelVideoNode(news, settings);
      console.log(`[OK] Reel processado com vídeo: ${url}`);
    } else {
      console.warn(`[WARN] Tipo de mídia desconhecido: ${post.media_type}`);
    }
  } catch (err) {
    console.error(`[ERRO] Falha ao processar post ${post.id}:`, err);
    // Atualiza o news_items com a mensagem de erro para o painel mostrar
    await supabase.from("news_items")
      .update({ error_message: `Worker VPS erro: ${err.message || err}` })
      .eq("id", news.id);
  }
}

// Loop principal de polling
async function main() {
  console.log("Iniciando Worker de Geração de Mídias...");
  
  try {
    await setupFonts();
  } catch (err) {
    console.error("Erro fatal ao configurar fontes do sistema:", err);
    process.exit(1);
  }

  while (true) {
    try {
      await processQueuedReelJobs();

      // Busca posts agendados
      const { data: pending, error } = await supabase
        .from("scheduled_posts")
        .select("id, user_id, media_type, news_item_id, news_items(*)")
        .eq("status", "scheduled")
        .limit(15);

      if (error) {
        console.error("Erro ao buscar posts da fila:", error);
      } else if (pending && pending.length > 0) {
        // Filtra posts que precisam de geração de mídia
        const todo = pending.filter((p) => {
          const n = p.news_items;
          if (!n) return false;
          // Aguarda reescrita de IA terminar
          if (!n.rewritten_title || !n.rewritten_summary) return false;
          // Se já está pronto, mas é reel sem vídeo, precisa processar
          if (n.editorial_ready) {
            if (p.media_type === "reel" && !n.generated_video_url) return true;
            return false;
          }
          return true;
        });

        if (todo.length > 0) {
          console.log(`Fila: ${todo.length} posts pendentes encontrados.`);
          for (const post of todo) {
            await processPost(post);
          }
        }
      }
    } catch (err) {
      console.error("Erro no ciclo do worker:", err);
    }
    
    // Aguarda 20 segundos antes do próximo polling
    await new Promise((resolve) => setTimeout(resolve, 20000));
  }
}

main();
