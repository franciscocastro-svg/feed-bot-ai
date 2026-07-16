import { exec } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import WebSocket from "ws";
import { drawTemplateGradient } from "../supabase/functions/_shared/template-gradients.js";
import { normalizeTemplateConfig, textXForBox } from "../supabase/functions/_shared/template-layouts.js";
import { containDestinationRect, coverSourceRect } from "../supabase/functions/_shared/image-framing.js";
import { loadPublishedTemplate } from "../supabase/functions/_shared/template-versioning.js";
import { brandFontStack } from "../supabase/functions/_shared/brand-kit.js";
import { buildAssSubtitleFile } from "./subtitleStyles.js";
import { resolveCutPreset } from "./cutPresets.js";
import {
  normalizeTimedWords,
  providerCapabilities,
  requestStructuredAnalysis,
  transcriptionProviderOrder,
} from "./aiProviders.js";

const execAsync = promisify(exec);
const RETRY_DELAYS_MS = [1000, 3000, 7000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let canvasRuntimePromise = null;

async function getCanvasRuntime() {
  if (!canvasRuntimePromise) {
    canvasRuntimePromise = import("@napi-rs/canvas").catch((error) => {
      canvasRuntimePromise = null;
      const message = "Dependência visual @napi-rs/canvas não instalada. Rode npm install no VPS antes de gerar artes, stories, reels ou cortes.";
      const wrapped = new Error(message);
      wrapped.cause = error;
      throw wrapped;
    });
  }
  return canvasRuntimePromise;
}

async function encodeCanvas(canvas, format) {
  if (typeof canvas.encode === "function") return canvas.encode(format);
  if (typeof canvas.toBuffer === "function") {
    const mime = format === "jpeg" ? "image/jpeg" : "image/png";
    return canvas.toBuffer(mime);
  }
  throw new Error("Runtime visual não conseguiu exportar a imagem.");
}

function errorStatus(error) {
  const raw = error?.statusCode ?? error?.status ?? error?.cause?.statusCode;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function isTransientError(error) {
  const status = errorStatus(error);
  if (status && (status === 408 || status === 425 || status === 429 || status >= 500)) return true;
  const text = `${error?.message || ""} ${error?.code || ""} ${error?.cause?.code || ""}`.toLowerCase();
  return /fetch failed|timeout|timed out|econnreset|econnrefused|enotfound|eai_again|socket|gateway/.test(text);
}

async function withTransientRetry(label, operation, delays = RETRY_DELAYS_MS) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isTransientError(error) || attempt >= delays.length) throw error;
      const waitMs = delays[attempt];
      console.warn(`[retry] ${label} falhou (${error?.message || error}); nova tentativa em ${waitMs}ms (${attempt + 2}/${delays.length + 1}).`);
      await sleep(waitMs);
    }
  }
}

function detailedServiceError(label, error, details = {}) {
  const status = errorStatus(error);
  const suffix = Object.entries(details)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${key}=${value}`)
    .join(" ");
  const wrapped = new Error(`${label}: ${error?.message || String(error)}${status ? ` (status ${status})` : ""}${suffix ? `; ${suffix}` : ""}`);
  wrapped.status = status;
  wrapped.code = error?.code;
  wrapped.cause = error;
  return wrapped;
}

async function uploadPostAsset(pathStorage, contents, options) {
  return await withTransientRetry(`upload ${pathStorage}`, async () => {
    const { error } = await supabase.storage.from("post-images").upload(pathStorage, contents, options);
    if (error) {
      throw detailedServiceError("Falha no upload ao Storage", error, {
        path: pathStorage,
        contentType: options?.contentType,
        bytes: contents?.byteLength ?? contents?.length,
      });
    }
  });
}

function isManagedReelVideoUrl(url, userId, itemId, contentType) {
  if (contentType === "video_cut") return Boolean(url);
  if (!url || !userId || !itemId) return false;
  const clean = String(url).split("?")[0];
  let decoded = clean;
  try { decoded = decodeURIComponent(clean); } catch { /* keep raw url */ }
  const expectedPath = `${userId}/${itemId}.mp4`;
  return decoded.includes(`/post-images/${expectedPath}`) || decoded.endsWith(`/${expectedPath}`);
}

const STANDARD_NEWS_REEL_DURATION_SECONDS = 6;

function buildStandardNewsReelCommand(imagePath, audioPath, outputPath) {
  const audioInput = audioPath
    ? `-stream_loop -1 -i ${shellQuote(audioPath)}`
    : `-f lavfi -i ${shellQuote("anullsrc=r=48000:cl=stereo")}`;
  return [
    "ffmpeg -y",
    `-loop 1 -framerate 30 -i ${shellQuote(imagePath)}`,
    audioInput,
    `-t ${STANDARD_NEWS_REEL_DURATION_SECONDS}`,
    `-vf ${shellQuote("scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p")}`,
    "-r 30 -c:v libx264 -preset medium -crf 20 -profile:v high -level 4.1",
    "-g 60 -keyint_min 60 -sc_threshold 0",
    "-c:a aac -ar 48000 -b:a 128k",
    "-movflags +faststart -shortest",
    shellQuote(outputPath),
  ].join(" ");
}

async function validateStandardNewsReel(filePath) {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration:stream=codec_type,codec_name,width,height,pix_fmt,r_frame_rate -of json ${shellQuote(filePath)}`,
  );
  const probe = JSON.parse(stdout || "{}");
  const duration = Number(probe?.format?.duration || 0);
  const video = (probe?.streams || []).find((stream) => stream.codec_type === "video");
  const audio = (probe?.streams || []).find((stream) => stream.codec_type === "audio");
  if (duration < 5.5 || duration > 6.5) throw new Error(`Duração inválida do Reel normalizado: ${duration}s`);
  if (video?.codec_name !== "h264" || video?.width !== 1080 || video?.height !== 1920 || video?.pix_fmt !== "yuv420p") {
    throw new Error(`Vídeo fora do padrão Meta: ${video?.codec_name || "sem codec"} ${video?.width || 0}x${video?.height || 0} ${video?.pix_fmt || ""}`);
  }
  if (audio?.codec_name !== "aac") throw new Error(`Áudio fora do padrão Meta: ${audio?.codec_name || "ausente"}`);
  return { duration, videoCodec: video.codec_name, audioCodec: audio.codec_name };
}

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
const WORKER_QUEUES = new Set(
  String(process.env.WORKER_QUEUES || "all")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
);
const WORKER_VERSION = process.env.WORKER_VERSION || "2026.07.15-autopilot-render-worker-1b";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY || "";
const GEMINI_VIDEO_MODEL = process.env.GEMINI_VIDEO_MODEL || process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash-lite";
const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_WHISPER_MODEL = process.env.GROQ_WHISPER_MODEL || "whisper-large-v3";
const CUT_SUBTITLE_LEAD_MS = Number(process.env.CUT_SUBTITLE_LEAD_MS || 80);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("ERRO: SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não definidos no .env!");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  realtime: {
    transport: WebSocket,
  },
});

const TEMP_DIR = path.join(__dirname, "temp");
const FONTS_DIR = path.join(__dirname, "fonts");

function queueEnabled(queue) {
  return WORKER_QUEUES.has("all") || WORKER_QUEUES.has(queue);
}

async function reportWorkerHealth() {
  const capabilities = {
    cuts: queueEnabled("cuts"),
    media: queueEnabled("media"),
    editorial_render: queueEnabled("media"),
    ffmpeg: await commandExists("ffmpeg"),
    ffprobe: await commandExists("ffprobe"),
    yt_dlp: await commandExists("yt-dlp"),
    transcription: Boolean(GEMINI_API_KEY || GROQ_API_KEY),
    ai_providers: providerCapabilities(),
  };
  const { error } = await supabase.from("worker_health").upsert({
    worker_id: WORKER_ID,
    queue_mode: Array.from(WORKER_QUEUES).sort().join(","),
    last_seen_at: new Date().toISOString(),
    version: WORKER_VERSION,
    capabilities,
  }, { onConflict: "worker_id" });
  if (error && !/worker_health|schema cache|does not exist/i.test(error.message || "")) {
    console.warn("[health] Não foi possível registrar heartbeat:", error.message || error);
  }
}

// Garante que as pastas necessárias existam
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
if (!fs.existsSync(FONTS_DIR)) fs.mkdirSync(FONTS_DIR, { recursive: true });

// Baixa um arquivo de forma simples
async function downloadFile(url, destPath) {
  await withTransientRetry(`download ${new URL(url).hostname}`, async () => {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) {
      const error = new Error(`Falha ao baixar ${url}: ${res.status} ${res.statusText}`);
      error.status = res.status;
      throw error;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    await fs.promises.writeFile(destPath, buffer);
  });
}

// Mantém no VPS as mesmas famílias oferecidas pelo Kit de Marca do navegador.
async function setupFonts() {
  const { GlobalFonts } = await getCanvasRuntime();
  const fonts = [
    ["Inter", "inter/static/Inter-Regular.ttf", "inter/static/Inter-Bold.ttf"],
    ["Montserrat", "montserrat/static/Montserrat-Regular.ttf", "montserrat/static/Montserrat-Bold.ttf"],
    ["Poppins", "poppins/Poppins-Regular.ttf", "poppins/Poppins-Bold.ttf"],
    ["Lora", "lora/static/Lora-Regular.ttf", "lora/static/Lora-Bold.ttf"],
  ];
  for (const [family, regularSource, boldSource] of fonts) {
    for (const [suffix, source, alias] of [
      ["Regular", regularSource, family],
      ["Bold", boldSource, `${family}Bold`],
    ]) {
      const filePath = path.join(FONTS_DIR, `${family}-${suffix}.ttf`);
      if (!fs.existsSync(filePath)) {
        try {
          await downloadFile(`https://github.com/google/fonts/raw/main/ofl/${source}`, filePath);
        } catch (error) {
          console.warn(`Fonte ${family} ${suffix} indisponível; será usado fallback.`, error?.message || error);
        }
      }
      if (fs.existsSync(filePath)) GlobalFonts.registerFromPath(filePath, alias);
    }
  }
  console.log("Fontes do Kit de Marca carregadas no worker.");
}

// Carrega imagem localmente para evitar problemas de CORS
async function loadImageHelper(url) {
  if (!url) return null;
  const { loadImage } = await getCanvasRuntime();
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
function wrapText(ctx, text, maxWidth, maxChars = Number.POSITIVE_INFINITY) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if ((test.length > maxChars || ctx.measureText(test).width > maxWidth) && cur) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

function templateIdForFormat(settings, format) {
  if (format === "story" || format === "stories") {
    return settings?.default_story_template_id || settings?.default_template_id || null;
  }
  if (format === "reel" || format === "reels") {
    return settings?.default_reel_template_id || settings?.default_template_id || null;
  }
  return settings?.default_feed_template_id || settings?.default_template_id || null;
}

async function loadTemplateForFormat(userId, accountId, settings, format) {
  const templateId = templateIdForFormat(settings, format);
  return loadPublishedTemplate(supabase, {
    accountId,
    userId,
    fallbackTemplateId: templateId,
    format,
  });
}

function drawCoverImage(ctx, img, x, y, w, h) {
  const source = coverSourceRect(img.width, img.height, w, h);
  ctx.drawImage(img, source.x, source.y, source.width, source.height, x, y, w, h);
}

function drawContainImage(ctx, img, x, y, w, h) {
  const destination = containDestinationRect(img.width, img.height, x, y, w, h);
  ctx.drawImage(img, destination.x, destination.y, destination.width, destination.height);
}

function drawProtectedImage(ctx, img, x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = "#111111";
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 0.62;
  drawCoverImage(ctx, img, x - 28, y - 28, w + 56, h + 56);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  ctx.fillRect(x, y, w, h);
  drawContainImage(ctx, img, x, y, w, h);
  ctx.restore();
}

function safeTemplateNumber(value, min, max, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function safeTemplateColor(value, fallback = "#FFFFFF") {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

async function drawBrandElementsNode(ctx, config, width, height) {
  const elements = Array.isArray(config?.brandElements) ? config.brandElements.slice(0, 12) : [];
  for (const element of elements) {
    const x = safeTemplateNumber(element?.x, 0, width, 0);
    const y = safeTemplateNumber(element?.y, 0, height, 0);
    const opacity = safeTemplateNumber(element?.opacity, 0.1, 1, 1);
    ctx.save();
    ctx.globalAlpha = opacity;
    if (element?.type === "image" && typeof element.url === "string") {
      const image = await loadImageHelper(element.url);
      if (image) {
        const elementWidth = safeTemplateNumber(element.width, 20, width, 240);
        const elementHeight = safeTemplateNumber(element.height, 20, height, 120);
        drawContainImage(ctx, image, x, y, elementWidth, elementHeight);
      }
    }
    if (element?.type === "text") {
      const text = typeof element.text === "string" ? element.text.slice(0, 80) : "";
      if (text) {
        const textWidth = safeTemplateNumber(element.width, 40, width, 420);
        const size = safeTemplateNumber(element.fontSize, 12, 160, 34);
        const weight = safeTemplateNumber(element.fontWeight, 300, 900, 700);
        const align = ["left", "center", "right"].includes(element.align) ? element.align : "left";
        ctx.fillStyle = safeTemplateColor(element.color);
        ctx.font = `${weight} ${size}px ${brandFontStack(config.bodyFontFamily || config.subtitleFontFamily, weight >= 700)}`;
        ctx.textAlign = align;
        ctx.fillText(text, textXForBox(x, textWidth, align), y + size);
      }
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
}

async function drawConfiguredTemplate(ctx, item, settings, template, width, height, opts = {}) {
  const cfg = normalizeTemplateConfig(template.config, height === 1080 ? "feed" : opts.withFollowCta ? "reels" : "stories");
  const usesOverlayFrame = cfg.backgroundLayer === "overlay" && Boolean(template.background_url);
  const title = (item.rewritten_title || item.original_title || "Notícia").toUpperCase();
  const subtitle = item.rewritten_summary || "";
  const handle = (settings?.brand_handle || settings?.brand_name || "").replace(/^@/, "");

  const templateBackground = template.background_url ? await loadImageHelper(template.background_url) : null;
  if (!usesOverlayFrame && templateBackground) {
    drawCoverImage(ctx, templateBackground, 0, 0, width, height);
  } else {
    drawTemplateGradient(ctx, template.preset_key, template.config, width, height);
  }

  if (cfg.showPhoto && item.original_image_url) {
    const photoImg = await loadImageHelper(item.original_image_url);
    if (photoImg) drawProtectedImage(ctx, photoImg, cfg.photoX, cfg.photoY, cfg.photoW, cfg.photoH);
  }

  if (cfg.overlayOpacity > 0) {
    ctx.fillStyle = `rgba(0,0,0,${cfg.overlayOpacity})`;
    ctx.fillRect(0, 0, width, height);
  }

  if (usesOverlayFrame && templateBackground) {
    drawCoverImage(ctx, templateBackground, 0, 0, width, height);
  }

  if (cfg.showBrandLogo && cfg.brandLogoUrl) {
    const brandLogo = await loadImageHelper(cfg.brandLogoUrl);
    if (brandLogo) drawContainImage(ctx, brandLogo, cfg.brandLogoX, cfg.brandLogoY, cfg.brandLogoSize, cfg.brandLogoSize);
  }

  if (cfg.showHandle && handle) {
    ctx.fillStyle = cfg.handleColor;
    ctx.font = `800 ${cfg.handleSize}px ${brandFontStack(cfg.handleFontFamily, true)}`;
    ctx.fillText(`@${handle.toUpperCase()}`, cfg.handleX, cfg.handleY);
  }

  ctx.fillStyle = cfg.titleColor;
  ctx.font = `900 ${cfg.titleSize}px ${brandFontStack(cfg.titleFontFamily, true)}`;
  ctx.textAlign = cfg.titleAlign;
  const titleX = textXForBox(cfg.titleX, cfg.titleW, cfg.titleAlign);
  wrapText(ctx, title, cfg.titleW, cfg.titleMaxChars).slice(0, cfg.titleMaxLines).forEach((line, i) => {
    ctx.fillText(line, titleX, cfg.titleY + i * Math.round(cfg.titleSize * 1.05));
  });

  if (subtitle) {
    ctx.fillStyle = cfg.subtitleColor;
    ctx.font = `500 ${cfg.subtitleSize}px ${brandFontStack(cfg.subtitleFontFamily)}`;
    ctx.textAlign = cfg.subtitleAlign;
    const subtitleX = textXForBox(cfg.subtitleX, cfg.subtitleW, cfg.subtitleAlign);
    wrapText(ctx, subtitle, cfg.subtitleW, Math.floor(cfg.titleMaxChars * 2.2)).slice(0, cfg.subtitleMaxLines).forEach((line, i) => {
      ctx.fillText(line, subtitleX, cfg.subtitleY + i * Math.round(cfg.subtitleSize * 1.3));
    });
  }

  if (cfg.showBadge && cfg.badgeText) {
    ctx.fillStyle = cfg.badgeBg;
    ctx.fillRect(cfg.badgeX, cfg.badgeY, cfg.badgeW, cfg.badgeH);
    ctx.fillStyle = cfg.badgeColor;
    ctx.font = `900 ${cfg.badgeSize}px ${brandFontStack(cfg.badgeFontFamily, true)}`;
    ctx.textAlign = "center";
    ctx.fillText(cfg.badgeText, cfg.badgeX + cfg.badgeW / 2, cfg.badgeY + cfg.badgeH / 2 + cfg.badgeSize * 0.35);
    ctx.textAlign = "left";
  }
  await drawBrandElementsNode(ctx, cfg, width, height);
}

// 1. Renderiza e faz upload do Post (1080x1080)
async function composeAndUploadPostNode(item, settings) {
  const SIZE = 1080;
  const { createCanvas } = await getCanvasRuntime();
  const template = await loadTemplateForFormat(item.user_id, item.instagram_account_id, settings, "feed");
  const handle = (settings?.brand_handle || settings?.brand_name || "").replace(/^@/, "");
  const title = (item.rewritten_title || item.original_title || "").toUpperCase();
  const subtitle = item.rewritten_summary || "";

  let photoImg = null;
  let logoImg = null;
  if (item.original_image_url) photoImg = await loadImageHelper(item.original_image_url);
  if (settings?.brand_logo_url) logoImg = await loadImageHelper(settings.brand_logo_url);

  const canvas = createCanvas(SIZE, SIZE);
  const ctx = canvas.getContext("2d");

  if (template) {
    await drawConfiguredTemplate(ctx, item, settings, template, SIZE, SIZE);
    const buffer = await encodeCanvas(canvas, "png");
    const pathStorage = `${item.user_id}/${item.id}.png`;
    await uploadPostAsset(pathStorage, buffer, {
      contentType: "image/png",
      upsert: true,
    });
    const { data: pub } = supabase.storage.from("post-images").getPublicUrl(pathStorage);
    const url = `${pub.publicUrl}?t=${Date.now()}`;
    await supabase.from("news_items").update({ generated_image_url: url }).eq("id", item.id);
    return url;
  }

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
    drawProtectedImage(ctx, photoImg, 0, py, SIZE, ph);
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

  const buffer = await encodeCanvas(canvas, "png");
  const pathStorage = `${item.user_id}/${item.id}.png`;

  await uploadPostAsset(pathStorage, buffer, {
    contentType: "image/png",
    upsert: true,
  });

  const { data: pub } = supabase.storage.from("post-images").getPublicUrl(pathStorage);
  const url = `${pub.publicUrl}?t=${Date.now()}`;

  await supabase.from("news_items").update({ generated_image_url: url }).eq("id", item.id);
  return url;
}

// 2. Renderiza e faz upload do Story Cover (1080x1920)
async function composeAndUploadStoryNode(item, settings, opts = {}) {
  const W = 1080;
  const H = 1920;
  const { createCanvas } = await getCanvasRuntime();
  const template = await loadTemplateForFormat(item.user_id, item.instagram_account_id, settings, opts.withFollowCta ? "reel" : "story");

  const title = (item.rewritten_title?.trim() || item.original_title?.trim() || "Notícia");
  const subtitle = (item.rewritten_summary?.trim() || item.original_content?.replace(/<[^>]+>/g, " ").trim().slice(0, 220) || "");
  const sourceName = (item.source_name || "").trim();
  const handle = (settings?.brand_handle || settings?.brand_name || "").replace(/^@/, "").trim();

  let photoImg = null;
  if (item.original_image_url) photoImg = await loadImageHelper(item.original_image_url);

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  if (template) {
    await drawConfiguredTemplate(ctx, item, settings, template, W, H, opts);
    const buffer = await encodeCanvas(canvas, "jpeg");
    const pathStorage = `${item.user_id}/${item.id}-story.jpg`;
    await uploadPostAsset(pathStorage, buffer, {
      contentType: "image/jpeg",
      upsert: true,
    });
    const { data: pub } = supabase.storage.from("post-images").getPublicUrl(pathStorage);
    const url = `${pub.publicUrl}?t=${Date.now()}`;
    await supabase.from("news_items").update({ generated_cover_url: url }).eq("id", item.id);
    return url;
  }

  // Imagem fullscreen com enquadramento protegido
  if (photoImg) {
    drawProtectedImage(ctx, photoImg, 0, 0, W, H);
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

  const buffer = await encodeCanvas(canvas, "jpeg");
  const pathStorage = `${item.user_id}/${item.id}-story.jpg`;

  await uploadPostAsset(pathStorage, buffer, {
    contentType: "image/jpeg",
    upsert: true,
  });

  const { data: pub } = supabase.storage.from("post-images").getPublicUrl(pathStorage);
  const url = `${pub.publicUrl}?t=${Date.now()}`;

  await supabase.from("news_items").update({ generated_cover_url: url }).eq("id", item.id);
  return url;
}

// 3. Mescla imagem de capa + áudio com FFmpeg e gera o Reel (MP4)
async function generateReelVideoNode(item, settings) {
  // 1) Sempre recompõe a capa editorial 9:16 para respeitar o template atual da conta.
  console.log(`[reel] Gerando capa editorial para o item ${item.id}...`);
  const sourceUrl = await composeAndUploadStoryNode(item, settings, { withFollowCta: true });

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
    const ffmpegCmd = buildStandardNewsReelCommand(tempImgPath, hasAudio ? tempAudioPath : null, tempVideoPath);

    console.log(`[ffmpeg] Rodando comando: ${ffmpegCmd}`);
    const { stdout, stderr } = await execAsync(ffmpegCmd);
    
    if (!fs.existsSync(tempVideoPath) || fs.statSync(tempVideoPath).size < 1000) {
      throw new Error(`Vídeo não foi gerado ou está vazio. stderr: ${stderr}`);
    }
    const validation = await validateStandardNewsReel(tempVideoPath);
    console.log(`[reel] Validação Meta concluída: ${JSON.stringify(validation)}`);

    console.log(`[reel] Vídeo gerado localmente com sucesso (${fs.statSync(tempVideoPath).size} bytes). Realizando upload...`);

    const videoBuffer = await fs.promises.readFile(tempVideoPath);
    const pathStorage = `${item.user_id}/${item.id}.mp4`;

    await uploadPostAsset(pathStorage, videoBuffer, {
      contentType: "video/mp4",
      upsert: true,
    });

    const { data: pub } = supabase.storage.from("post-images").getPublicUrl(pathStorage);
    const videoUrl = pub.publicUrl;

    console.log(`[reel] Upload de vídeo concluído: ${videoUrl}`);

    await supabase.from("news_items")
      .update({ generated_video_url: videoUrl, editorial_ready: true, error_message: null })
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
  const idStr = `${job.user_id.substring(0, 5)}_${job.news_item_id.substring(0, 8)}_${job.id.substring(0, 8)}`;
  const tempImgPath = path.join(TEMP_DIR, `job_cover_${idStr}.jpg`);
  const tempAudioPath = path.join(TEMP_DIR, `job_audio_${idStr}.mp3`);
  const tempVideoPath = path.join(TEMP_DIR, `job_reel_${idStr}.mp4`);

  try {
    for (const f of [tempImgPath, tempAudioPath, tempVideoPath]) {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    }

    let sourceUrl = job.cover_url;
    try {
      const { data: item, error: itemError } = await supabase
        .from("news_items")
        .select("*")
        .eq("id", job.news_item_id)
        .single();

      if (itemError || !item) {
        throw itemError || new Error("Notícia não encontrada");
      }

      // Jobs criados antes da proteção de Cortes IA podem continuar na fila.
      // Recupere o MP4 original do corte e finalize o job sem gerar o Reel
      // editorial estático de 6 segundos.
      if (item.content_type === "video_cut") {
        const { data: clip, error: clipError } = await supabase
          .from("video_cut_clips")
          .select("video_url")
          .eq("news_item_id", item.id)
          .maybeSingle();
        if (clipError) throw clipError;

        const originalVideoUrl = clip?.video_url || item.generated_video_url;
        if (!originalVideoUrl) {
          throw new Error("Corte IA sem MP4 original disponível");
        }

        await supabase.from("news_items")
          .update({ generated_video_url: originalVideoUrl, editorial_ready: true, error_message: null })
          .eq("id", item.id);
        await supabase.from("scheduled_posts")
          .update({ error_message: null })
          .eq("news_item_id", item.id)
          .eq("status", "scheduled");
        await supabase.from("reel_render_jobs")
          .update({
            status: "done",
            output_url: originalVideoUrl,
            completed_at: new Date().toISOString(),
            error_message: null,
          })
          .eq("id", job.id);

        console.log(`[job:${job.id}] Corte IA preservado; geração de 6s ignorada.`);
        return originalVideoUrl;
      }

      const { data: settings, error: settingsError } = await supabase
        .from("user_settings")
        .select("brand_handle, brand_name, brand_logo_url, reel_audio_url")
        .eq("user_id", job.user_id)
        .maybeSingle();

      if (settingsError) {
        throw settingsError;
      }

      console.log(`[job:${job.id}] Gerando capa editorial do Reel...`);
      sourceUrl = await composeAndUploadStoryNode(item, settings, { withFollowCta: true });

      await supabase.from("reel_render_jobs")
        .update({ cover_url: sourceUrl, updated_at: new Date().toISOString() })
        .eq("id", job.id);
    } catch (coverErr) {
      throw new Error(`Falha ao gerar capa editorial do Reel com template: ${coverErr?.message || coverErr}`);
    }

    console.log(`[job:${job.id}] Baixando capa do Reel...`);
    await downloadFile(sourceUrl, tempImgPath);

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

    const ffmpegCmd = buildStandardNewsReelCommand(tempImgPath, hasAudio ? tempAudioPath : null, tempVideoPath);

    console.log(`[job:${job.id}] Gerando MP4 com FFmpeg...`);
    const { stderr } = await execAsync(ffmpegCmd);
    if (!fs.existsSync(tempVideoPath) || fs.statSync(tempVideoPath).size < 1000) {
      throw new Error(`Vídeo não foi gerado ou está vazio. stderr: ${stderr}`);
    }
    const validation = await validateStandardNewsReel(tempVideoPath);
    console.log(`[job:${job.id}] Validação Meta concluída: ${JSON.stringify(validation)}`);

    const videoBuffer = await fs.promises.readFile(tempVideoPath);
    const pathStorage = `${job.user_id}/${job.news_item_id}.mp4`;
    await uploadPostAsset(pathStorage, videoBuffer, {
      contentType: "video/mp4",
      upsert: true,
    });

    const { data: pub } = supabase.storage.from("post-images").getPublicUrl(pathStorage);
    const videoUrl = pub.publicUrl;

    await supabase.from("news_items")
      .update({ generated_video_url: videoUrl, editorial_ready: true, error_message: null })
      .eq("id", job.news_item_id);

    await supabase.from("scheduled_posts")
      .update({ error_message: null })
      .eq("news_item_id", job.news_item_id)
      .eq("status", "scheduled")
      .ilike("error_message", "%Aguardando geração da arte/vídeo com template%");

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

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

async function commandExists(command) {
  try {
    await execAsync(`command -v ${shellQuote(command)}`, { maxBuffer: 1024 * 1024 });
    return true;
  } catch {
    return false;
  }
}

async function hasAudioStream(videoPath) {
  if (!(await commandExists("ffprobe"))) return true;
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -select_streams a:0 -show_entries stream=index -of csv=p=0 ${shellQuote(videoPath)}`,
      { maxBuffer: 1024 * 1024 },
    );
    return Boolean(String(stdout || "").trim());
  } catch {
    return false;
  }
}

function parseJsonFromText(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function toSeconds(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.max(0, Math.round(value));
  const text = String(value || "").trim();
  if (!text) return 0;
  if (/^\d+(\.\d+)?$/.test(text)) return Math.max(0, Math.round(Number(text)));
  const parts = text.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return 0;
  return parts.reduce((total, part) => total * 60 + part, 0);
}

function cleanCutText(value, fallback = "") {
  return String(value || fallback || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHashtags(value) {
  const source = Array.isArray(value) ? value.join(" ") : String(value || "");
  return source
    .split(/[,\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
    .slice(0, 12);
}

function clampScore(value, fallback = null) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.min(100, Math.round(num)));
}

function clampClipSuggestion(clip, index, durationSeconds) {
  const start = Math.max(0, toSeconds(clip?.start_seconds ?? clip?.start ?? clip?.inicio));
  let end = Math.max(start + 8, toSeconds(clip?.end_seconds ?? clip?.end ?? clip?.fim));
  const videoDuration = Math.max(0, Number(durationSeconds || 0));
  if (videoDuration > 0) end = Math.min(end, videoDuration);
  if (end - start > 90) end = start + 90;
  if (end - start < 8) end = start + 20;

  const hookScore = clampScore(clip?.hook_score ?? clip?.gancho_score, null);
  const emotionScore = clampScore(clip?.emotion_score ?? clip?.emocao_score, null);
  const clarityScore = clampScore(clip?.clarity_score ?? clip?.clareza_score, null);
  let viralScore = clampScore(clip?.viral_score ?? clip?.viralidade, null);
  if (viralScore == null && (hookScore != null || emotionScore != null || clarityScore != null)) {
    viralScore = Math.round(
      (hookScore ?? 60) * 0.5 + (emotionScore ?? 60) * 0.3 + (clarityScore ?? 60) * 0.2,
    );
  }

  const hookText = cleanCutText(clip?.hook_text || clip?.chamada || clip?.big_hook, "").slice(0, 60);

  return {
    clip_index: index,
    start_seconds: start,
    end_seconds: end,
    duration_seconds: Math.max(1, end - start),
    title: cleanCutText(clip?.title || clip?.titulo, `Corte ${index}`),
    hook: cleanCutText(clip?.hook || clip?.gancho, "Momento importante do vídeo"),
    hook_text: hookText,
    caption: cleanCutText(clip?.caption || clip?.legenda, ""),
    reason: cleanCutText(clip?.reason || clip?.motivo, "Trecho com potencial para Reel."),
    score: clampScore(clip?.score || clip?.nota, 70),
    hook_score: hookScore,
    emotion_score: emotionScore,
    clarity_score: clarityScore,
    viral_score: viralScore,
    hashtags: normalizeHashtags(clip?.hashtags || "#reels #cortes #instagram"),
  };
}

function fallbackClipSuggestions(job, metadata) {
  const requested = Math.max(1, Math.min(5, Number(job.requested_clips || 1)));
  const duration = Math.max(30, Number(metadata?.duration_seconds || 180));
  const safeWindow = Math.min(duration - 10, 90);
  const step = Math.max(25, Math.floor(safeWindow / requested));

  return Array.from({ length: requested }).map((_, idx) => {
    const start = Math.min(Math.max(0, idx * step), Math.max(0, duration - 45));
    const end = Math.min(duration, start + 35);
    return clampClipSuggestion({
      start_seconds: start,
      end_seconds: end,
      title: metadata?.title || `Corte ${idx + 1}`,
      hook: "Trecho selecionado para revisão",
      caption: `${metadata?.title || "Novo corte"}\n\nAssista ao trecho e ajuste a legenda antes de agendar.`,
      reason: "Fallback automático para permitir revisão quando a IA não retorna timestamps confiáveis.",
      score: 60 - idx,
      hashtags: ["#cortes", "#reels", "#instagram"],
    }, idx + 1, duration);
  });
}

function getYtCookiesFile() {
  const configured = String(process.env.YT_COOKIES_FILE || "").trim();
  if (configured) return configured;
  const fallback = path.join(os.homedir(), "yt-cookies.txt");
  return fs.existsSync(fallback) ? fallback : null;
}

function validateYtCookiesFile(cookiesFile) {
  if (!cookiesFile) return null;
  try {
    const stats = fs.statSync(cookiesFile);
    if (!stats.isFile()) return `arquivo de cookies não é um arquivo válido: ${cookiesFile}`;
    if (stats.size < 100) return `arquivo de cookies parece vazio/incompleto: ${cookiesFile}`;
    return null;
  } catch {
    return `arquivo de cookies não encontrado no worker: ${cookiesFile}`;
  }
}

function buildYtDlpCookieFlags() {
  const cookiesFile = getYtCookiesFile();
  const validationError = validateYtCookiesFile(cookiesFile);
  if (!cookiesFile || validationError) return { flags: [], cookiesFile, validationError };
  return { flags: ["--cookies", shellQuote(cookiesFile)], cookiesFile, validationError: null };
}

function buildYtDlpCommonFlags() {
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";
  const flags = [
    "--no-warnings",
    "--geo-bypass",
    "--user-agent", shellQuote(ua),
  ];
  const remoteComponents = String(process.env.YT_DLP_REMOTE_COMPONENTS || "").trim();
  if (remoteComponents) flags.push("--remote-components", shellQuote(remoteComponents));
  return flags;
}

function buildYtDlpStrategies() {
  const cookieConfig = buildYtDlpCookieFlags();
  const customExtractorArgs = String(process.env.YT_DLP_EXTRACTOR_ARGS || "").trim();
  const common = buildYtDlpCommonFlags();
  const strategies = [
    { name: "public-default", flags: [...common] },
    {
      name: "public-compatible-clients",
      flags: [...common, "--extractor-args", shellQuote("youtube:player_client=web_safari,android_vr,web_embedded")],
    },
  ];
  if (customExtractorArgs) {
    strategies.push({ name: "public-custom", flags: [...common, "--extractor-args", shellQuote(customExtractorArgs)] });
  }
  if (cookieConfig.flags.length) {
    strategies.push({ name: "authenticated-default", flags: [...common, ...cookieConfig.flags] });
    if (customExtractorArgs) {
      strategies.push({ name: "authenticated-custom", flags: [...common, ...cookieConfig.flags, "--extractor-args", shellQuote(customExtractorArgs)] });
    }
  } else if (cookieConfig.validationError) {
    console.warn(`[cuts] Cookies do YouTube ignorados: ${cookieConfig.validationError}`);
  }
  return strategies;
}

async function runYtDlpWithStrategies(label, commandFactory) {
  const errors = [];
  for (const strategy of buildYtDlpStrategies()) {
    try {
      console.log(`[cuts] YouTube ${label}: tentativa ${strategy.name}`);
      return await commandFactory(strategy);
    } catch (error) {
      const message = String(error?.stderr || error?.message || error || "").replace(/\s+/g, " ").trim();
      errors.push(`${strategy.name}: ${message.slice(0, 350)}`);
      console.warn(`[cuts] YouTube ${label} falhou em ${strategy.name}: ${message.slice(0, 220)}`);
    }
  }
  throw new Error(`Todas as estratégias de captura por link falharam. ${errors.join(" | ")}`.slice(0, 1800));
}

async function probeYoutubeMetadata(youtubeUrl) {
  if (!(await commandExists("yt-dlp"))) {
    throw new Error("yt-dlp não está instalado no VPS.");
  }

  const { stdout } = await runYtDlpWithStrategies("metadados", ({ flags }) => execAsync(
    ["yt-dlp", ...flags, "--dump-json", "--skip-download", "--no-playlist", shellQuote(youtubeUrl)].join(" "),
    { maxBuffer: 15 * 1024 * 1024 },
  ));
  const data = JSON.parse(stdout);
  return {
    duration_seconds: Number(data.duration || 0),
    title: cleanCutText(data.title, "Vídeo do YouTube"),
    webpage_url: data.webpage_url || youtubeUrl,
  };
}


async function analyzeYoutubeForCuts(job, metadata, videoUri = job.youtube_url) {
  if (!GEMINI_API_KEY) {
    console.warn(`[cuts:${job.id}] GEMINI_API_KEY ausente; usando sugestões fallback.`);
    return fallbackClipSuggestions(job, metadata);
  }

  const wantsHook = job.hook_enabled !== false;
  const prompt = `Você é editor senior de Reels para Instagram, especializado em identificar momentos com ALTO potencial viral. Analise este vídeo autorizado e escolha os ${Math.min(5, job.requested_clips || 1)} MELHORES cortes.

Priorize trechos com:
- GANCHO forte nos primeiros 3 segundos (pergunta provocativa, revelação, promessa, número marcante)
- Picos EMOCIONAIS (surpresa, indignação, riso, tensão, empolgação)
- Frases de IMPACTO ou "quotables"
- Cliffhangers e revelações
- Dados/números que chocam ou intrigam
- Início e fim naturais (nada de começar no meio de frase)

Regras:
- Retorne APENAS JSON válido, sem markdown, sem comentários.
- Cortes de 15 a 60 segundos.
- Dê para cada corte 3 notas separadas (0-100): hook_score (força do gancho), emotion_score (intensidade emocional), clarity_score (clareza da mensagem).
- Calcule viral_score = round(hook_score*0.5 + emotion_score*0.3 + clarity_score*0.2).
${wantsHook ? '- Escreva um hook_text CURTO (máximo 6 palavras, MAIÚSCULAS, sem pontuação final) que aparecerá em texto grande sobreposto nos primeiros 3s. Exemplos: "VOCÊ NÃO VAI ACREDITAR", "OLHA ISSO", "3 COISAS QUE MUDAM TUDO".' : '- Deixe hook_text como string vazia "".'}
- Legenda em português brasileiro, curta, sem prometer viralização enganosa.

Formato exato:
{"clips":[{"start_seconds":12,"end_seconds":42,"title":"Título curto","hook":"Gancho descritivo","hook_text":"${wantsHook ? 'OLHA ISSO' : ''}","caption":"Legenda curta","reason":"Por que esse trecho funciona","hook_score":85,"emotion_score":78,"clarity_score":80,"viral_score":82,"score":82,"hashtags":["#tema","#reels"]}]}`;

  try {
    const res = await withTransientRetry(`Gemini video cuts ${job.id}`, async () => {
      const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify({
          model: GEMINI_VIDEO_MODEL,
          input: [
            { type: "text", text: prompt },
            { type: "video", uri: videoUri },
          ],
        }),
        signal: AbortSignal.timeout(120000),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        const error = new Error(`Gemini retornou ${response.status}: ${body.slice(0, 500)}`);
        error.status = response.status;
        throw error;
      }
      return response;
    }, [2000, 5000]);

    const payload = await res.json();
    const text =
      payload.output_text ||
      payload.outputText ||
      payload.response?.output_text ||
      payload.steps?.flatMap((step) => step.content || []).map((part) => part.text).filter(Boolean).join("\n");
    const parsed = parseJsonFromText(text);
    const clips = Array.isArray(parsed?.clips) ? parsed.clips : [];
    if (!clips.length) {
      console.warn(`[cuts:${job.id}] Gemini não retornou cortes úteis; usando fallback.`);
      return fallbackClipSuggestions(job, metadata);
    }
    return clips
      .slice(0, Math.min(5, job.requested_clips || 1))
      .map((clip, index) => clampClipSuggestion(clip, index + 1, metadata?.duration_seconds));
  } catch (err) {
    console.warn(`[cuts:${job.id}] Falha na análise Gemini; usando fallback:`, err?.message || err);
    return fallbackClipSuggestions(job, metadata);
  }
}

async function probeLocalVideoMetadata(videoPath, fallbackTitle = "Vídeo enviado") {
  if (!(await commandExists("ffprobe"))) {
    console.warn("[cuts] ffprobe não está instalado; usando duração estimada para o MP4 enviado.");
    return {
      duration_seconds: 180,
      title: cleanCutText(fallbackTitle, "Vídeo enviado"),
      webpage_url: videoPath,
    };
  }

  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration -of json ${shellQuote(videoPath)}`,
    { maxBuffer: 2 * 1024 * 1024 },
  );
  const data = parseJsonFromText(stdout) || {};
  const duration = Number(data?.format?.duration || 0);
  return {
    duration_seconds: Number.isFinite(duration) && duration > 0 ? Math.round(duration) : 180,
    title: cleanCutText(fallbackTitle, "Vídeo enviado"),
    webpage_url: videoPath,
  };
}

async function downloadUploadedVideo(videoUrl, outputPath) {
  if (!videoUrl) throw new Error("URL do MP4 enviado não encontrada.");
  const parsed = new URL(videoUrl);
  const supabaseOrigin = new URL(SUPABASE_URL).origin;
  if (parsed.origin !== supabaseOrigin || !parsed.pathname.includes("/storage/v1/object/")) {
    throw new Error("Origem do MP4 enviado não é confiável.");
  }
  if (await commandExists("curl")) {
    await execAsync(
      `curl -L --fail --retry 3 --connect-timeout 20 --max-time 900 -o ${shellQuote(outputPath)} ${shellQuote(videoUrl)}`,
      { maxBuffer: 10 * 1024 * 1024 },
    );
  } else {
    await downloadFile(videoUrl, outputPath);
  }
  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1000) {
    throw new Error("MP4 enviado não foi baixado ou está vazio.");
  }
}

async function downloadStoredVideo(job, outputPath) {
  if (job.source_storage_path) {
    const bucket = job.source_storage_bucket || "video-cut-inputs";
    if (bucket !== "video-cut-inputs") throw new Error("Bucket de entrada de vídeo inválido.");
    const expectedPrefix = `${job.user_id}/cuts/uploads/`;
    if (!job.source_storage_path.startsWith(expectedPrefix) || job.source_storage_path.includes("..")) {
      throw new Error("Caminho privado do MP4 inválido.");
    }
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(job.source_storage_path, 900);
    if (error || !data?.signedUrl) throw new Error(error?.message || "Não foi possível autorizar o download do MP4.");
    await downloadUploadedVideo(data.signedUrl, outputPath);
    return;
  }

  // Compatibility for jobs created before private inputs were introduced.
  await downloadUploadedVideo(job.source_video_url || job.youtube_url, outputPath);
}

async function downloadYoutubeVideo(youtubeUrl, outputPath) {
  if (!(await commandExists("yt-dlp"))) {
    throw new Error("yt-dlp não está instalado no VPS.");
  }

  try {
    const { stderr } = await runYtDlpWithStrategies("download", async ({ flags }) => {
      try { await fs.promises.rm(outputPath, { force: true }); } catch {}
      return execAsync([
        "yt-dlp",
        ...flags,
        "--no-playlist",
        "-f", shellQuote("bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/best"),
        "--merge-output-format", "mp4",
        "-o", shellQuote(outputPath),
        shellQuote(youtubeUrl),
      ].join(" "), { maxBuffer: 30 * 1024 * 1024 });
    });
    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1000) {
      throw new Error(`Vídeo original não foi baixado. ${stderr || ""}`.trim());
    }
  } catch (err) {
    const msg = String(err?.stderr || err?.message || err || "");
    // Repropaga com mensagem mais clara pro humanVideoCutError detectar
    if (/sign in to confirm|not a bot|precondition check failed|unable to download api page|HTTP Error 403|HTTP Error 429/i.test(msg)) {
      throw new Error(`YouTube bloqueou o download automático (anti-bot). ${msg}`);
    }
    throw err;
  }
}


function drawOverlayText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const lines = wrapText(ctx, cleanCutText(text), maxWidth).slice(0, maxLines);
  lines.forEach((line, idx) => ctx.fillText(line, x, y + idx * lineHeight));
  return y + lines.length * lineHeight;
}

function getCutFormatDims(format) {
  switch (format) {
    case "feed_square":   return { width: 1080, height: 1080, label: "1:1" };
    case "feed_portrait": return { width: 1080, height: 1350, label: "4:5" };
    case "reels":
    default:              return { width: 1080, height: 1920, label: "9:16" };
  }
}

async function writeCutOverlayPng(clip, settings, outputPath, format = "reels") {
  const { width, height } = getCutFormatDims(format);
  const { createCanvas } = await getCanvasRuntime();
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, width, height);

  // Overlay mínimo para Cortes: apenas @handle discreto no topo.
  // Sem barra amarela, sem título grande e sem rodapé "Corte gerado...".
  // O conteúdo do corte fala por si; as legendas queimadas (ASS) entram em outra etapa.
  const handle = cleanCutText(settings?.brand_handle || settings?.brand_name || "");
  if (handle) {
    const label = handle.startsWith("@") ? handle : `@${handle}`;
    ctx.font = "28px InterBold, Inter, Arial";
    ctx.textBaseline = "top";

    // Fundo pill semitransparente atrás do handle para legibilidade
    const paddingX = 18;
    const paddingY = 10;
    const metrics = ctx.measureText(label);
    const pillW = Math.ceil(metrics.width) + paddingX * 2;
    const pillH = 44;
    const pillX = 60;
    const pillY = 60;

    ctx.fillStyle = "rgba(0,0,0,0.45)";
    if (typeof ctx.roundRect === "function") {
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, 22);
      ctx.fill();
    } else {
      ctx.fillRect(pillX, pillY, pillW, pillH);
    }

    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.fillText(label, pillX + paddingX, pillY + paddingY);
  }

  const buffer = await encodeCanvas(canvas, "png");
  await fs.promises.writeFile(outputPath, buffer);
}


// ---- Transcrição via Groq Whisper (palavra-por-palavra) ----
async function transcribeClipGroq(audioPath) {
  if (!GROQ_API_KEY) return null;
  try {
    return await withTransientRetry("groq transcribe", async () => {
      const form = new FormData();
      const buffer = await fs.promises.readFile(audioPath);
      form.append("file", new Blob([buffer], { type: "audio/mpeg" }), "clip.mp3");
      form.append("model", GROQ_WHISPER_MODEL);
      form.append("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "word");
      const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
        body: form,
        signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        const err = new Error(`Groq ${res.status}: ${body.slice(0, 300)}`);
        err.status = res.status;
        throw err;
      }
      const data = await res.json();
      const words = Array.isArray(data?.words) ? data.words : [];
      return words
        .map((w) => ({
          word: String(w.word || "").trim(),
          start: Number(w.start) || 0,
          end: Number(w.end) || 0,
        }))
        .filter((w) => w.word && w.end > w.start);
    }, [2000, 5000]);
  } catch (err) {
    console.warn(`[cuts] Transcrição Groq falhou: ${err?.message || err}`);
    return null;
  }
}

// ---- Transcrição via Gemini (áudio nativo, palavra-por-palavra) ----
// Fallback quando Groq está congestionado. Usa GEMINI_API_KEY já disponível no worker.
async function transcribeClipGemini(audioPath) {
  if (!GEMINI_API_KEY) return null;
  try {
    return await withTransientRetry("gemini transcribe", async () => {
      const buffer = await fs.promises.readFile(audioPath);
      // Inline: limite ~20MB. Nossos clips são curtos (16kHz mono 64kbps ≈ 480KB/min).
      const audioB64 = buffer.toString("base64");
      const model = process.env.GEMINI_TRANSCRIBE_MODEL || "gemini-2.5-flash";
      const prompt = `Transcreva este áudio em português (ou o idioma falado) devolvendo APENAS um array JSON válido, sem markdown, sem comentários, no formato:
[{"word":"palavra","start":0.12,"end":0.48}, ...]
Regras:
- Uma entrada por palavra falada, em ordem.
- start/end em segundos (float, relativo ao início do áudio).
- Sem pontuação isolada; anexe pontuação à palavra (ex: "olá,").
- Se não houver fala, devolva [].`;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              { inline_data: { mime_type: "audio/mpeg", data: audioB64 } },
            ],
          }],
          generationConfig: {
            temperature: 0,
            responseMimeType: "application/json",
          },
        }),
        signal: AbortSignal.timeout(180000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        const err = new Error(`Gemini transcribe ${res.status}: ${body.slice(0, 300)}`);
        err.status = res.status;
        throw err;
      }
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        const match = text.match(/\[[\s\S]*\]/);
        if (!match) throw new Error("Gemini não devolveu JSON válido");
        parsed = JSON.parse(match[0]);
      }
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((w) => ({
          word: String(w?.word || "").trim(),
          start: Number(w?.start) || 0,
          end: Number(w?.end) || 0,
        }))
        .filter((w) => w.word && w.end > w.start);
    }, [2000, 5000]);
  } catch (err) {
    console.warn(`[cuts] Transcrição Gemini falhou: ${err?.message || err}`);
    return null;
  }
}

// Groq/Whisper vem primeiro porque fornece timestamps reais por palavra.
// Gemini continua como fallback. O contrato de providers fica isolado para que
// um provedor futuro não obrigue a reescrever renderização ou legendas.
async function transcribeClip(audioPath, maxDuration = Number.POSITIVE_INFINITY) {
  for (const provider of transcriptionProviderOrder()) {
    const rawWords = provider === "groq"
      ? await transcribeClipGroq(audioPath)
      : provider === "gemini"
        ? await transcribeClipGemini(audioPath)
        : null;
    const words = normalizeTimedWords(rawWords, {
      maxDuration,
      leadMs: CUT_SUBTITLE_LEAD_MS,
    });
    if (words.length > 0) {
      console.log(`[cuts] Transcrição via ${provider}: ${words.length} palavras; lead=${CUT_SUBTITLE_LEAD_MS}ms`);
      return { words, provider };
    }
  }
  return { words: [], provider: null };
}

async function transcribeSourceForAnalysis(sourcePath, tempDir) {
  const segmentDir = path.join(tempDir, "analysis-audio");
  await fs.promises.mkdir(segmentDir, { recursive: true });
  const segmentPattern = path.join(segmentDir, "part-%03d.mp3");
  await execAsync(
    `ffmpeg -y -i ${shellQuote(sourcePath)} -vn -ac 1 -ar 16000 -b:a 48k -f segment -segment_time 600 -reset_timestamps 1 ${shellQuote(segmentPattern)}`,
    { maxBuffer: 20 * 1024 * 1024 },
  );

  const parts = (await fs.promises.readdir(segmentDir))
    .filter((name) => /^part-\d+\.mp3$/.test(name))
    .sort();
  const words = [];
  for (let index = 0; index < parts.length; index += 1) {
    const transcription = await transcribeClip(path.join(segmentDir, parts[index]), 600);
    const segmentWords = transcription.words;
    if (!segmentWords.length) continue;
    const offset = index * 600;
    words.push(...segmentWords.map((word) => ({
      ...word,
      start: Number(word.start || 0) + offset,
      end: Number(word.end || 0) + offset,
    })));
  }
  return words;
}

function timedTranscript(words) {
  const lines = [];
  for (let index = 0; index < words.length; index += 18) {
    const group = words.slice(index, index + 18);
    if (!group.length) continue;
    lines.push(`[${group[0].start.toFixed(1)}-${group[group.length - 1].end.toFixed(1)}] ${group.map((item) => item.word).join(" ")}`);
  }
  return lines.join("\n").slice(0, 120000);
}

function snapClipToTranscript(clip, words, index, duration) {
  const normalized = clampClipSuggestion(clip, index, duration);
  const nearStart = words
    .filter((word) => Math.abs(word.start - normalized.start_seconds) <= 3)
    .sort((a, b) => Math.abs(a.start - normalized.start_seconds) - Math.abs(b.start - normalized.start_seconds))[0];
  const nearEnd = words
    .filter((word) => Math.abs(word.end - normalized.end_seconds) <= 3)
    .sort((a, b) => Math.abs(a.end - normalized.end_seconds) - Math.abs(b.end - normalized.end_seconds))[0];
  return clampClipSuggestion({
    ...normalized,
    start_seconds: nearStart?.start ?? normalized.start_seconds,
    end_seconds: nearEnd?.end ?? normalized.end_seconds,
  }, index, duration);
}

async function analyzeTranscriptForCuts(job, metadata, words) {
  if (!words?.length) {
    return {
      clips: fallbackClipSuggestions(job, metadata),
      mode: "timeline_fallback",
      warning: "Não foi possível transcrever o vídeo completo.",
    };
  }

  const preset = resolveCutPreset(job.preset_key, job);
  const wantsHook = job.hook_enabled !== false;
  const transcript = timedTranscript(words);
  const requested = Math.min(5, Number(job.requested_clips || 1));
  const prompt = `Você é um editor de vídeos curtos. Escolha os ${requested} melhores trechos desta TRANSCRIÇÃO COM TIMESTAMPS.

Use somente o que está na transcrição. Priorize começo e fim naturais, gancho forte, emoção, clareza e uma ideia completa. Não comece no meio de frase. Cada corte deve ter entre 15 e 60 segundos. Não invente falas.

PRESET DE EDIÇÃO (${preset.label}): ${preset.analysisInstruction}
${job.custom_prompt ? `ORIENTAÇÃO DO CLIENTE: ${String(job.custom_prompt).slice(0, 1200)}` : ""}

Retorne APENAS JSON válido:
{"clips":[{"start_seconds":12,"end_seconds":42,"title":"Título curto","hook":"Resumo do gancho","hook_text":"${wantsHook ? "OLHA ISSO" : ""}","caption":"Legenda fiel ao trecho","reason":"Motivo da escolha","hook_score":85,"emotion_score":75,"clarity_score":90,"viral_score":84,"score":84,"hashtags":["#reels"]}]}

TRANSCRIÇÃO:
${transcript}`;

  try {
    const model = process.env.GEMINI_CUT_ANALYSIS_MODEL || GEMINI_TEXT_MODEL;
    const result = await withTransientRetry(`AI transcript cuts ${job.id}`, () => requestStructuredAnalysis({
      prompt,
      gemini: { apiKey: GEMINI_API_KEY, model },
    }), [2000, 5000]);
    const parsed = parseJsonFromText(result.text);
    const clips = Array.isArray(parsed?.clips) ? parsed.clips : [];
    if (!clips.length) throw new Error("A IA não retornou trechos utilizáveis.");
    return {
      clips: clips.slice(0, requested).map((clip, index) => snapClipToTranscript(clip, words, index + 1, metadata.duration_seconds)),
      mode: `transcript_ai:${result.provider}`,
      warning: null,
      provider: result.provider,
    };
  } catch (error) {
    console.warn(`[cuts:${job.id}] Análise da transcrição falhou; usando modo básico:`, error?.message || error);
    return {
      clips: fallbackClipSuggestions(job, metadata),
      mode: "timeline_fallback",
      warning: `Análise inteligente indisponível: ${error?.message || error}`.slice(0, 500),
    };
  }
}

// ---- Detecção de silêncios via ffmpeg silencedetect ----
async function detectSilences(videoPath, minDuration = 0.7) {
  try {
    const { stderr } = await execAsync(
      `ffmpeg -i ${shellQuote(videoPath)} -af silencedetect=noise=-32dB:d=${minDuration} -f null - 2>&1`,
      { maxBuffer: 10 * 1024 * 1024 },
    );
    const output = stderr || "";
    const silences = [];
    const startRe = /silence_start:\s*([\d.]+)/g;
    const endRe = /silence_end:\s*([\d.]+)/g;
    const starts = [];
    let m;
    while ((m = startRe.exec(output))) starts.push(Number(m[1]));
    const ends = [];
    while ((m = endRe.exec(output))) ends.push(Number(m[1]));
    for (let i = 0; i < Math.min(starts.length, ends.length); i += 1) {
      silences.push({ start: starts[i], end: ends[i] });
    }
    return silences;
  } catch {
    return [];
  }
}

function buildKeepSegments(clipDuration, silences) {
  // Devolve trechos [start, end] a manter (sem silêncios)
  const segments = [];
  let cursor = 0;
  for (const s of silences) {
    if (s.start > cursor + 0.1) segments.push({ start: cursor, end: s.start });
    cursor = Math.max(cursor, s.end);
  }
  if (cursor < clipDuration - 0.1) segments.push({ start: cursor, end: clipDuration });
  return segments.filter((seg) => seg.end - seg.start > 0.2);
}

function applyManualTranscript(words, transcriptText) {
  const tokens = String(transcriptText || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!tokens.length || !words?.length) return words || [];
  if (tokens.length === 1) return [{ word: tokens[0], start: words[0].start, end: words[words.length - 1].end }];
  return tokens.map((word, index) => {
    const position = index / (tokens.length - 1);
    const sourceIndex = Math.min(words.length - 1, Math.round(position * (words.length - 1)));
    const nextIndex = Math.min(words.length - 1, Math.max(sourceIndex, Math.round(((index + 1) / tokens.length) * words.length) - 1));
    return {
      word,
      start: words[sourceIndex].start,
      end: Math.max(words[sourceIndex].start + 0.04, words[nextIndex].end),
    };
  });
}

async function detectPrimarySubjectFocus(videoPath, durationSeconds, tempDir) {
  const fallback = { x: 0.5, y: 0.44, confidence: 0, provider: "center_fallback", points: [] };
  if (!GEMINI_API_KEY) return fallback;
  const contactSheetPath = path.join(tempDir, `${path.basename(videoPath, path.extname(videoPath))}-faces.jpg`);
  try {
    const interval = Math.max(1, Number(durationSeconds || 1) / 6);
    const filter = `fps=1/${interval.toFixed(3)},scale=320:-2,tile=3x2:padding=4:margin=4`;
    await execAsync(
      `ffmpeg -y -i ${shellQuote(videoPath)} -vf ${shellQuote(filter)} -frames:v 1 -q:v 4 ${shellQuote(contactSheetPath)}`,
      { maxBuffer: 12 * 1024 * 1024 },
    );
    if (!fs.existsSync(contactSheetPath)) return fallback;
    const image = (await fs.promises.readFile(contactSheetPath)).toString("base64");
    const model = process.env.GEMINI_FACE_MODEL || GEMINI_TEXT_MODEL;
    const prompt = `Observe esta grade 3x2 com até seis quadros consecutivos de um vídeo curto, da esquerda para a direita e de cima para baixo. Identifique a pessoa principal que fala ou conduz a cena em cada quadro. Retorne APENAS JSON: {"frames":[{"x":0.5,"y":0.42,"confidence":0.9},{"x":0.52,"y":0.41,"confidence":0.9}],"focus_x":0.5,"focus_y":0.44,"confidence":0.9}. x/y ficam entre 0 e 1 e apontam para o centro do rosto/torso principal. Inclua um item por quadro visível. Se a pessoa desaparecer em um quadro, repita a última posição confiável; se não houver pessoa em nenhum quadro, use centro e confidence 0.`;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: prompt },
          { inline_data: { mime_type: "image/jpeg", data: image } },
        ] }],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      }),
      signal: AbortSignal.timeout(90000),
    });
    if (!response.ok) return fallback;
    const payload = await response.json();
    const parsed = parseJsonFromText(payload?.candidates?.[0]?.content?.parts?.[0]?.text || "") || {};
    const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value)));
    const rawFrames = Array.isArray(parsed.frames) ? parsed.frames.slice(0, 6) : [];
    const points = rawFrames.map((frame, index) => ({
      time: rawFrames.length <= 1 ? 0 : (index / (rawFrames.length - 1)) * Number(durationSeconds || 0),
      x: clamp(frame?.x ?? parsed.focus_x ?? 0.5, 0.08, 0.92),
      y: clamp(frame?.y ?? parsed.focus_y ?? 0.44, 0.08, 0.92),
      confidence: clamp(frame?.confidence ?? parsed.confidence ?? 0, 0, 1),
    }));
    // Suavização simples evita que pequenas variações da detecção produzam um
    // recorte tremendo entre quadros.
    const smoothed = points.map((point, index) => {
      const neighborhood = points.slice(Math.max(0, index - 1), Math.min(points.length, index + 2));
      return {
        ...point,
        x: neighborhood.reduce((sum, item) => sum + item.x, 0) / neighborhood.length,
        y: neighborhood.reduce((sum, item) => sum + item.y, 0) / neighborhood.length,
      };
    });
    return {
      x: clamp(parsed.focus_x ?? 0.5, 0.08, 0.92),
      y: clamp(parsed.focus_y ?? 0.44, 0.08, 0.92),
      confidence: clamp(parsed.confidence ?? 0, 0, 1),
      provider: "gemini_vision",
      points: smoothed,
    };
  } catch (error) {
    console.warn(`[cuts] Reenquadramento inteligente indisponível: ${error?.message || error}`);
    return fallback;
  }
}

function focusAxisExpression(focus, axis) {
  const points = Array.isArray(focus?.points) ? focus.points : [];
  if (points.length < 2) return Number(focus?.[axis] ?? (axis === "x" ? 0.5 : 0.44)).toFixed(4);
  let expression = Number(points[points.length - 1][axis]).toFixed(4);
  for (let index = points.length - 2; index >= 0; index -= 1) {
    const current = points[index];
    const next = points[index + 1];
    const from = Number(current[axis]).toFixed(4);
    const to = Number(next[axis]).toFixed(4);
    const span = Math.max(0.1, next.time - current.time).toFixed(4);
    const progress = `max(0,min(1,(t-${current.time.toFixed(4)})/${span}))`;
    expression = `if(lt(t,${next.time.toFixed(4)}),${from}+(${to}-${from})*${progress},${expression})`;
  }
  return expression;
}

function buildSubjectCropFilter(outW, outH, focus) {
  const x = focusAxisExpression(focus, "x");
  const y = focusAxisExpression(focus, "y");
  return `crop=${outW}:${outH}:x='max(0,min(iw-out_w,(${x})*iw-out_w/2))':y='max(0,min(ih-out_h,(${y})*ih-out_h/2))'`;
}

async function validateAiCutOutput(filePath, expected) {
  const { stdout } = await execAsync(
    `ffprobe -v error -show_entries format=duration,size:stream=codec_type,codec_name,width,height,pix_fmt,r_frame_rate,sample_rate -of json ${shellQuote(filePath)}`,
    { maxBuffer: 4 * 1024 * 1024 },
  );
  const probe = JSON.parse(stdout || "{}");
  const video = (probe.streams || []).find((stream) => stream.codec_type === "video");
  const audio = (probe.streams || []).find((stream) => stream.codec_type === "audio");
  const duration = Number(probe?.format?.duration || 0);
  const size = Number(probe?.format?.size || 0);
  const failures = [];
  if (!video || video.codec_name !== "h264") failures.push("codec de vídeo diferente de H.264");
  if (video?.width !== expected.width || video?.height !== expected.height) failures.push(`resolução ${video?.width || 0}x${video?.height || 0}`);
  if (video?.pix_fmt !== "yuv420p") failures.push(`pixel format ${video?.pix_fmt || "ausente"}`);
  if (!audio || audio.codec_name !== "aac") failures.push("áudio AAC ausente");
  if (duration < 3 || duration > Math.max(65, Number(expected.duration || 0) + 2)) failures.push(`duração ${duration.toFixed(2)}s`);
  if (size < 25_000) failures.push("arquivo final muito pequeno");
  const report = {
    ok: failures.length === 0,
    checked_at: new Date().toISOString(),
    duration_seconds: duration,
    width: video?.width || 0,
    height: video?.height || 0,
    video_codec: video?.codec_name || null,
    audio_codec: audio?.codec_name || null,
    pixel_format: video?.pix_fmt || null,
    size_bytes: size,
    failures,
  };
  if (!report.ok) throw Object.assign(new Error(`Validação de qualidade falhou: ${failures.join(", ")}.`), { qualityReport: report });
  return report;
}

async function generateVideoCutClip(job, clip, sourcePath, settings, tempDir) {
  const overlayPath = path.join(tempDir, `${clip.id}-overlay.png`);
  const rawCutPath = path.join(tempDir, `${clip.id}-raw.mp4`);
  const trimmedPath = path.join(tempDir, `${clip.id}-trimmed.mp4`);
  const audioPath = path.join(tempDir, `${clip.id}.mp3`);
  const subtitlePath = path.join(tempDir, `${clip.id}.ass`);
  const outputPath = path.join(tempDir, `${clip.id}.mp4`);
  const thumbPath = path.join(tempDir, `${clip.id}.jpg`);

  const format = clip.format || job.format || "reels";
  const preset = resolveCutPreset(job.preset_key, job);
  const subtitleStyle = clip.subtitle_style || preset.subtitleStyle || "classic";
  const wantsSubtitles = subtitleStyle && subtitleStyle !== "none";
  const wantsSilenceRemoval = preset.removeSilences;
  const wantsZoom = preset.zoomEffect;
  const wantsSmartCrop = preset.smartCrop;
  const { width: outW, height: outH } = getCutFormatDims(format);

  await writeCutOverlayPng(clip, settings, overlayPath, format);

  // === PASS 1: extrai o trecho bruto (só o intervalo, sem edição pesada) ===
  const pass1Cmd = [
    "ffmpeg -y",
    "-ss", shellQuote(clip.start_seconds),
    "-i", shellQuote(sourcePath),
    "-t", shellQuote(clip.duration_seconds),
    "-c:v libx264 -preset veryfast -crf 22 -pix_fmt yuv420p",
    "-c:a aac -b:a 128k",
    shellQuote(rawCutPath),
  ].join(" ");
  await execAsync(pass1Cmd, { maxBuffer: 20 * 1024 * 1024 });
  if (!fs.existsSync(rawCutPath) || fs.statSync(rawCutPath).size < 1000) {
    throw new Error("Trecho bruto não foi gerado.");
  }

  // === PASS 1.5 (opcional): remove silêncios ===
  let workingPath = rawCutPath;
  let workingDuration = Number(clip.duration_seconds) || 0;
  if (wantsSilenceRemoval && workingDuration > 5) {
    const silences = await detectSilences(rawCutPath, 0.7);
    const keep = buildKeepSegments(workingDuration, silences);
    if (silences.length > 0 && keep.length > 0 && keep.length < 20) {
      const selectV = keep.map((s) => `between(t,${s.start.toFixed(3)},${s.end.toFixed(3)})`).join("+");
      const selectA = selectV;
      const filter = `[0:v]select='${selectV}',setpts=N/FRAME_RATE/TB[v];[0:a]aselect='${selectA}',asetpts=N/SR/TB[a]`;
      try {
        await execAsync([
          "ffmpeg -y",
          "-i", shellQuote(rawCutPath),
          "-filter_complex", shellQuote(filter),
          "-map", shellQuote("[v]"),
          "-map", shellQuote("[a]"),
          "-c:v libx264 -preset veryfast -crf 22 -pix_fmt yuv420p",
          "-c:a aac -b:a 128k",
          shellQuote(trimmedPath),
        ].join(" "), { maxBuffer: 20 * 1024 * 1024 });
        if (fs.existsSync(trimmedPath) && fs.statSync(trimmedPath).size > 1000) {
          workingPath = trimmedPath;
          workingDuration = keep.reduce((acc, s) => acc + (s.end - s.start), 0);
        }
      } catch (err) {
        console.warn(`[cuts:${clip.id}] Falha na remoção de silêncios (mantendo original):`, err?.message);
      }
    }
  }

  // === Transcrição (extrai áudio e chama Gemini/Groq) ===
  let transcript = null;
  let subtitleError = false;
  const hookText = clip.hook_enabled === false ? "" : (clip.hook_text || "").trim();
  const hasHook = hookText.length > 0;
  if (wantsSubtitles || hasHook) {
    try {
      let words = [];
      if (wantsSubtitles) {
        await execAsync(
          `ffmpeg -y -i ${shellQuote(workingPath)} -vn -ar 16000 -ac 1 -b:a 64k ${shellQuote(audioPath)}`,
          { maxBuffer: 10 * 1024 * 1024 },
        );
        const transcriptionResult = await transcribeClip(audioPath, workingDuration);
        words = transcriptionResult.words;
        if (clip.edit_config?.manual_transcript && clip.transcript_text) {
          words = applyManualTranscript(words, clip.transcript_text);
        }
        clip.transcription_provider = transcriptionResult.provider;
        if (words.length > 0) {
          transcript = words;
        } else {
          subtitleError = true;
          console.warn(`[cuts:${clip.id}] Transcrição retornou vazia — clip ficará sem legenda.`);
        }
      }
      // Sempre grava o .ass se houver palavras OU hook — o hook aparece mesmo sem transcrição.
      if (words.length > 0 || hasHook) {
        const assContent = buildAssSubtitleFile(
          words,
          wantsSubtitles ? subtitleStyle : "classic",
          format,
          { width: outW, height: outH },
          workingDuration,
          {
            hookText: hasHook ? hookText : "",
            hookDurationSeconds: 3,
            maxWordsPerGroup: subtitleStyle === "clean" ? 5 : 3,
            maxCharsPerGroup: subtitleStyle === "clean" ? 34 : 24,
            fontFamily: settings?.cut_brand_profile?.font_family,
            primaryColor: settings?.cut_brand_profile?.primary_color,
            highlightColor: settings?.cut_brand_profile?.highlight_color,
            outlineColor: settings?.cut_brand_profile?.outline_color,
            subtitlePosition: settings?.cut_brand_profile?.subtitle_position,
          },
        );
        await fs.promises.writeFile(subtitlePath, assContent, "utf8");
      }
    } catch (err) {
      subtitleError = wantsSubtitles;
      console.warn(`[cuts:${clip.id}] Legenda não gerada:`, err?.message);
    }
  }

  // === PASS 2: composição final — crop 9:16 + overlay + subtitles + loudnorm + zoom ===
  const subjectFocus = wantsSmartCrop
    ? await detectPrimarySubjectFocus(workingPath, workingDuration, tempDir)
    : { x: 0.5, y: 0.5, confidence: 0, provider: "disabled" };
  const videoFilters = [];
  videoFilters.push(`scale=${outW}:${outH}:force_original_aspect_ratio=increase`);
  videoFilters.push(buildSubjectCropFilter(outW, outH, subjectFocus));
  videoFilters.push("setsar=1");
  if (wantsZoom) {
    // Zoom sutil (5%) ao longo do clip
    videoFilters.push(`zoompan=z='min(zoom+0.0006,1.05)':d=1:s=${outW}x${outH}:fps=30`);
  }
  const videoChain = `[0:v]${videoFilters.join(",")}[base];[base][1:v]overlay=0:0:format=auto[withOverlay]`;
  const subtitleChain = fs.existsSync(subtitlePath)
    ? `;[withOverlay]ass=${shellQuote(subtitlePath).replace(/^'|'$/g, "").replace(/:/g, "\\:")}[v]`
    : ";[withOverlay]copy[v]";
  // Mantém o vídeo renderizável mesmo quando o arquivo original não tem áudio.
  const sourceHasAudio = await hasAudioStream(workingPath);
  const audioChain = sourceHasAudio
    ? ";[0:a]loudnorm=I=-16:TP=-1.5:LRA=11[a]"
    : `;anullsrc=r=48000:cl=stereo,atrim=duration=${Math.max(1, workingDuration)},asetpts=N/SR/TB[a]`;
  const filterComplex = videoChain + subtitleChain + audioChain;

  const pass2Cmd = [
    "ffmpeg -y",
    "-i", shellQuote(workingPath),
    "-i", shellQuote(overlayPath),
    "-filter_complex", shellQuote(filterComplex),
    "-map", shellQuote("[v]"),
    "-map", shellQuote("[a]"),
    "-c:v libx264 -preset veryfast -crf 21 -pix_fmt yuv420p",
    "-c:a aac -b:a 128k -movflags +faststart",
    shellQuote(outputPath),
  ].join(" ");

  const { stderr } = await execAsync(pass2Cmd, { maxBuffer: 30 * 1024 * 1024 });
  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size < 1000) {
    throw new Error(`Corte não foi gerado. ${stderr || ""}`.trim());
  }
  const qualityReport = await validateAiCutOutput(outputPath, {
    width: outW,
    height: outH,
    duration: workingDuration,
  });

  await execAsync(
    `ffmpeg -y -ss 1 -i ${shellQuote(outputPath)} -frames:v 1 -q:v 3 ${shellQuote(thumbPath)}`,
    { maxBuffer: 10 * 1024 * 1024 },
  );

  const videoStoragePath = `${job.user_id}/cuts/${clip.id}.mp4`;
  const thumbStoragePath = `${job.user_id}/cuts/${clip.id}.jpg`;
  await uploadPostAsset(videoStoragePath, await fs.promises.readFile(outputPath), {
    contentType: "video/mp4",
    upsert: true,
  });

  let thumbnailUrl = null;
  if (fs.existsSync(thumbPath) && fs.statSync(thumbPath).size > 500) {
    await uploadPostAsset(thumbStoragePath, await fs.promises.readFile(thumbPath), {
      contentType: "image/jpeg",
      upsert: true,
    });
    thumbnailUrl = supabase.storage.from("post-images").getPublicUrl(thumbStoragePath).data.publicUrl;
  }

  const videoUrl = supabase.storage.from("post-images").getPublicUrl(videoStoragePath).data.publicUrl;
  await supabase.from("video_cut_clips")
    .update({
      status: "draft",
      video_url: videoUrl,
      thumbnail_url: thumbnailUrl,
      transcript: transcript ? { words: transcript } : null,
      transcript_text: transcript ? transcript.map((word) => word.word).join(" ") : null,
      quality_report: qualityReport,
      provider_trace: {
        transcription: clip.transcription_provider || null,
        framing: subjectFocus.provider,
        framing_confidence: subjectFocus.confidence,
        framing_points: subjectFocus.points?.length || 0,
      },
      subtitle_error: subtitleError,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", clip.id);

  return { videoUrl, thumbnailUrl, transcript, qualityReport };
}

// ---- Auto-publish: transforma corte pronto em scheduled_post ----
async function autoPublishClip(job, clip, videoUrl, thumbnailUrl) {
  try {
    const title = clip.title || "Corte IA";
    const caption = clip.caption || clip.hook || title;
    const hashtags = Array.isArray(clip.hashtags) ? clip.hashtags : [];
    const newsId = clip.id;
    const scheduledFor = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // +10min

    const { error: newsErr } = await supabase.from("news_items").upsert({
      id: newsId,
      user_id: job.user_id,
      instagram_account_id: job.instagram_account_id,
      source_name: "Cortes IA",
      original_title: title,
      original_content: clip.reason || clip.hook || caption,
      original_url: job.source_kind === "upload"
        ? `upload://${job.id}/cut-${clip.clip_index}-${clip.id}`
        : `${job.youtube_url}#cut-${clip.clip_index}-${clip.id}`,
      original_image_url: thumbnailUrl,
      published_at: new Date().toISOString(),
      niche: "video",
      status: "processed",
      rewritten_title: title,
      rewritten_summary: clip.hook || clip.reason || title,
      caption,
      reel_caption: caption,
      hashtags,
      generated_image_url: thumbnailUrl,
      generated_cover_url: thumbnailUrl,
      generated_video_url: videoUrl,
      content_type: "video_cut",
      content_format: "reel",
      editorial_ready: true,
    }, { onConflict: "id" });
    if (newsErr) throw newsErr;

    const { data: sp, error: spErr } = await supabase.from("scheduled_posts").insert({
      user_id: job.user_id,
      news_item_id: newsId,
      instagram_account_id: job.instagram_account_id,
      scheduled_for: scheduledFor,
      status: "scheduled",
      media_type: "reel",
    }).select("id").single();
    if (spErr) throw spErr;

    await supabase.from("video_cut_clips")
      .update({ status: "scheduled", scheduled_post_id: sp.id, news_item_id: newsId })
      .eq("id", clip.id);

    console.log(`[cuts:${clip.id}] Auto-publicado. Agendado para ${scheduledFor}`);
  } catch (err) {
    console.error(`[cuts:${clip.id}] Auto-publish falhou:`, err?.message || err);
  }
}


async function finishVideoCutUsage(jobId, generatedCount) {
  const { error } = await supabase.rpc("finalize_video_cut_job_usage", {
    _job_id: jobId,
    _generated_count: generatedCount,
  });
  if (error) console.warn(`[cuts:${jobId}] Falha ao finalizar uso diário:`, error.message || error);
}

async function failVideoCutJob(job, message, fallbackRequired = false, generatedCount = 0) {
  await supabase.from("video_cut_jobs")
    .update({
      status: "failed",
      progress: 100,
      error_message: message,
      fallback_required: fallbackRequired,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);
  await finishVideoCutUsage(job.id, generatedCount);
}

function shouldSuggestUploadFallback(job, message) {
  if (job?.source_kind === "upload") return false;
  return /youtube|yt-dlp|baixar|download|sign in to confirm|not a bot|precondition/i.test(String(message || ""));
}

async function processLocalAudioCutJob(job, tempDir) {
  const audioPath = path.join(tempDir, "local-analysis.mp3");
  let createdCount = 0;
  try {
    await supabase.from("video_cut_jobs").update({
      status: "analyzing", progress: 12, error_message: null, updated_at: new Date().toISOString(),
    }).eq("id", job.id);

    if (job.source_storage_bucket !== "video-cut-audio" || !job.source_storage_path) {
      throw new Error("Áudio local do trabalho não foi encontrado.");
    }
    const expectedPrefix = `${job.user_id}/cuts/audio/`;
    if (!job.source_storage_path.startsWith(expectedPrefix) || job.source_storage_path.includes("..")) {
      throw new Error("Caminho do áudio local é inválido.");
    }
    const { data: signed, error: signedError } = await supabase.storage
      .from("video-cut-audio").createSignedUrl(job.source_storage_path, 900);
    if (signedError || !signed?.signedUrl) throw new Error(signedError?.message || "Não foi possível ler o áudio local.");
    await downloadFile(signed.signedUrl, audioPath);

    const duration = Math.max(3, Number(job.duration_seconds || 0));
    const transcriptWords = await transcribeSourceForAnalysis(audioPath, tempDir);
    if (!transcriptWords.length) throw new Error("Não foi possível identificar fala no áudio enviado.");
    await supabase.from("video_cut_jobs").update({ progress: 45, updated_at: new Date().toISOString() }).eq("id", job.id);

    const analysis = await analyzeTranscriptForCuts(job, {
      title: job.source_title || job.local_file_name || "Vídeo local",
      duration_seconds: duration,
    }, transcriptWords);
    const suggestions = analysis.clips || [];
    if (!suggestions.length) throw new Error("A IA não encontrou trechos utilizáveis neste áudio.");

    await supabase.from("video_cut_clips").delete().eq("job_id", job.id);
    const jobFormats = Array.isArray(job.formats) && job.formats.length
      ? job.formats.filter((format) => ["reels", "feed_square", "feed_portrait"].includes(format))
      : [job.format || "reels"];
    const formats = Array.from(new Set(jobFormats.length ? jobFormats : ["reels"]));

    for (let suggestionIndex = 0; suggestionIndex < suggestions.length; suggestionIndex += 1) {
      const suggestion = suggestions[suggestionIndex];
      const words = transcriptWords
        .filter((word) => word.end >= suggestion.start_seconds && word.start <= suggestion.end_seconds)
        .map((word) => ({
          ...word,
          start: Math.max(0, word.start - suggestion.start_seconds),
          end: Math.max(0.04, word.end - suggestion.start_seconds),
        }));
      for (let formatIndex = 0; formatIndex < formats.length; formatIndex += 1) {
        const clipIndex = suggestionIndex * formats.length + formatIndex + 1;
        const { error: clipError } = await supabase.from("video_cut_clips").insert({
          job_id: job.id,
          user_id: job.user_id,
          instagram_account_id: job.instagram_account_id,
          clip_index: clipIndex,
          status: "rendering",
          title: suggestion.title,
          hook: suggestion.hook,
          hook_text: suggestion.hook_text || null,
          hook_score: suggestion.hook_score,
          emotion_score: suggestion.emotion_score,
          clarity_score: suggestion.clarity_score,
          viral_score: suggestion.viral_score,
          caption: suggestion.caption || suggestion.title,
          hashtags: suggestion.hashtags || [],
          reason: suggestion.reason,
          score: suggestion.score,
          start_seconds: suggestion.start_seconds,
          end_seconds: suggestion.end_seconds,
          duration_seconds: suggestion.duration_seconds,
          format: formats[formatIndex],
          subtitle_style: job.subtitle_style || "classic",
          transcript: { words },
          transcript_text: words.map((word) => word.word).join(" "),
          edit_config: { local_render_pending: true },
          provider_trace: { analysis: analysis.provider || null, render: "local_device_pending" },
        });
        if (clipError) throw clipError;
        createdCount += 1;
      }
    }

    await supabase.from("video_cut_jobs").update({
      status: "ready",
      progress: 100,
      analysis_mode: analysis.mode,
      analysis_warning: analysis.warning,
      provider_trace: { analysis: analysis.provider || null, render: "local_device" },
      generated_clips: 0,
      error_message: null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", job.id);
    console.log(`[cuts:${job.id}] Áudio analisado; ${createdCount} corte(s) aguardando renderização no dispositivo.`);
  } catch (error) {
    await failVideoCutJob(job, error?.message || String(error), false, 0);
  }
}

async function processVideoCutJob(job) {
  const tempDir = path.join(TEMP_DIR, `cut_${job.id}`);
  const sourcePath = path.join(tempDir, "source.mp4");
  let generatedCount = 0;
  const isUploadJob = job.source_kind === "upload";

  try {
    await fs.promises.mkdir(tempDir, { recursive: true });

    if (!(await commandExists("ffmpeg"))) {
      throw new Error("FFmpeg não está instalado no VPS.");
    }

    if (job.processing_mode === "local_device" || job.source_kind === "local_audio") {
      await processLocalAudioCutJob(job, tempDir);
      return;
    }

    await supabase.from("video_cut_jobs")
      .update({
        status: "analyzing",
        progress: 10,
        error_message: null,
        fallback_required: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    let metadata;
    if (isUploadJob) {
      await supabase.from("video_cut_jobs")
        .update({ progress: 15, updated_at: new Date().toISOString() })
        .eq("id", job.id);
      await downloadStoredVideo(job, sourcePath);
      metadata = await probeLocalVideoMetadata(sourcePath, job.source_title || job.source_file_name || "Vídeo enviado");
    } else {
      metadata = await probeYoutubeMetadata(job.youtube_url);
      try {
        await downloadYoutubeVideo(job.youtube_url, sourcePath);
      } catch (err) {
        await failVideoCutJob(
          job,
          `Não foi possível baixar o vídeo público do YouTube. Envie o MP4 autorizado como alternativa. Detalhe: ${err?.message || err}`,
          true,
          0,
        );
        return;
      }
    }

    const { data: limits } = await supabase.rpc("get_user_plan_limits", { _user_id: job.user_id });
    const maxMinutes = Math.max(1, Number(limits?.max_cut_video_minutes || 60));
    if (metadata.duration_seconds > maxMinutes * 60) {
      throw new Error(`Este vídeo tem ${Math.ceil(metadata.duration_seconds / 60)} min. O limite do plano é ${maxMinutes} min por link.`);
    }

    await supabase.from("video_cut_jobs")
      .update({
        source_title: metadata.title,
        duration_seconds: metadata.duration_seconds,
        source_video_url: isUploadJob ? null : job.source_video_url,
        progress: 25,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    let transcriptWords = [];
    try {
      transcriptWords = await transcribeSourceForAnalysis(sourcePath, tempDir);
    } catch (error) {
      console.warn(`[cuts:${job.id}] Transcrição para análise indisponível:`, error?.message || error);
    }
    const analysis = await analyzeTranscriptForCuts(job, metadata, transcriptWords);
    const suggestions = analysis.clips;

    await supabase.from("video_cut_jobs")
      .update({
        analysis_mode: analysis.mode,
        analysis_warning: analysis.warning,
        provider_trace: {
          analysis: analysis.provider || null,
          transcription_order: transcriptionProviderOrder(),
        },
        progress: 35,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);

    await supabase.from("video_cut_jobs")
      .update({ status: "processing", progress: 40, updated_at: new Date().toISOString() })
      .eq("id", job.id);

    const { error: staleClipsError } = await supabase.from("video_cut_clips")
      .delete()
      .eq("job_id", job.id)
      .gt("clip_index", suggestions.length);
    if (staleClipsError) {
      console.warn(`[cuts:${job.id}] Falha ao limpar cortes antigos:`, staleClipsError.message || staleClipsError);
    }

    const settings = await loadEffectivePostSettings({
      user_id: job.user_id,
      instagram_account_id: job.instagram_account_id,
    });
    const { data: cutBrandProfile } = await supabase
      .from("video_cut_brand_profiles")
      .select("*")
      .eq("instagram_account_id", job.instagram_account_id)
      .maybeSingle();
    const cutSettings = {
      ...settings,
      brand_handle: cutBrandProfile?.watermark_enabled === false
        ? ""
        : (cutBrandProfile?.watermark_text || settings?.brand_handle),
      cut_brand_profile: cutBrandProfile || null,
    };

    // Retry idempotente: se um processamento anterior deixou clips órfãos,
    // limpa antes de inserir novos (senão bate no unique(job_id, clip_index)).
    const { error: cleanupError } = await supabase
      .from("video_cut_clips")
      .delete()
      .eq("job_id", job.id);
    if (cleanupError) {
      console.warn(`[cuts:${job.id}] Falha ao limpar clips antigos: ${cleanupError.message}`);
    }

    // Multi-formato: cada sugestão × cada formato = 1 clip
    const jobFormats = Array.isArray(job.formats) && job.formats.length
      ? job.formats.filter((f) => ["reels", "feed_square", "feed_portrait"].includes(f))
      : [job.format || "reels"];
    const uniqueFormats = Array.from(new Set(jobFormats.length ? jobFormats : ["reels"]));
    const total = (suggestions.length || 1) * uniqueFormats.length;
    let processed = 0;
    for (let idx = 0; idx < suggestions.length; idx += 1) {
      const suggestion = suggestions[idx];
      for (let fIdx = 0; fIdx < uniqueFormats.length; fIdx += 1) {
        const clipFormat = uniqueFormats[fIdx];
        const clipIndex = idx * uniqueFormats.length + fIdx + 1;
        const { data: clip, error: clipError } = await supabase.from("video_cut_clips")
          .upsert({
            job_id: job.id,
            user_id: job.user_id,
            instagram_account_id: job.instagram_account_id,
            clip_index: clipIndex,
            title: suggestion.title,
            hook: suggestion.hook,
            hook_text: suggestion.hook_text || null,
            hook_score: suggestion.hook_score,
            emotion_score: suggestion.emotion_score,
            clarity_score: suggestion.clarity_score,
            viral_score: suggestion.viral_score,
            caption: suggestion.caption || `${suggestion.title}\n\n${suggestion.hashtags.join(" ")}`.trim(),
            hashtags: suggestion.hashtags,
            reason: suggestion.reason,
            score: suggestion.score,
            start_seconds: suggestion.start_seconds,
            end_seconds: suggestion.end_seconds,
            duration_seconds: suggestion.duration_seconds,
            status: "rendering",
            format: clipFormat,
            subtitle_style: job.subtitle_style || "classic",
            subtitle_error: false,
            video_url: null,
            thumbnail_url: null,
            error_message: null,
          }, { onConflict: "job_id,clip_index" })
          .select("*")
          .single();

        if (clipError) throw clipError;
        // Sinal para generateVideoCutClip renderizar hook_text se hook_enabled
        clip.hook_enabled = job.hook_enabled !== false;
        const { videoUrl, thumbnailUrl } = await generateVideoCutClip(job, clip, sourcePath, cutSettings, tempDir);
        generatedCount += 1;
        processed += 1;

        if (job.auto_publish && videoUrl && fIdx === 0) {
          // Auto-publica só o primeiro formato pra não spammar a conta
          const { data: fullClip } = await supabase
            .from("video_cut_clips").select("*").eq("id", clip.id).maybeSingle();
          if (fullClip) await autoPublishClip(job, fullClip, videoUrl, thumbnailUrl);
        }

        await supabase.from("video_cut_jobs")
          .update({
            generated_clips: generatedCount,
            progress: Math.min(95, 45 + Math.round((processed / total) * 45)),
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);
      }
    }


    await supabase.from("video_cut_jobs")
      .update({
        status: "ready",
        progress: 100,
        generated_clips: generatedCount,
        error_message: null,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    await finishVideoCutUsage(job.id, generatedCount);
    // O original privado fica disponível por uma janela curta para permitir
    // regeneração de estilo/transcrição sem exigir novo upload. A limpeza deve
    // respeitar source_expires_at e pode ser executada por rotina dedicada.
    console.log(`[cuts:${job.id}] ${generatedCount} corte(s) pronto(s) para revisão.`);
  } catch (err) {
    const message = err?.message || String(err);
    console.error(`[cuts:${job.id}] Falha no processamento:`, message);
    await failVideoCutJob(job, message, shouldSuggestUploadFallback(job, message), generatedCount);
  } finally {
    try { await fs.promises.rm(tempDir, { recursive: true, force: true }); } catch {}
  }
}

async function processQueuedVideoCutJobs() {
  let jobs;
  try {
    const result = await withTransientRetry("reclamar jobs de Cortes IA", async () => {
      const response = await supabase.rpc("claim_video_cut_jobs", { _worker: WORKER_ID, _limit: 1 });
      if (response.error) throw detailedServiceError("Falha ao reclamar jobs de Cortes IA", response.error);
      return response;
    });
    jobs = result.data;
  } catch (error) {
    console.error("Erro ao reclamar jobs de Cortes IA após as tentativas:", error);
    return 0;
  }
  if (!jobs?.length) return 0;

  console.log(`Fila video_cut_jobs: ${jobs.length} job(s) reclamado(s).`);
  for (const job of jobs) {
    await processVideoCutJob(job);
  }
  return jobs.length;
}

async function cleanupExpiredVideoCutSources() {
  const { data: sources, error } = await supabase.rpc("claim_expired_video_cut_sources", { _limit: 50 });
  if (error) {
    if (!/claim_expired_video_cut_sources|schema cache|does not exist/i.test(error.message || "")) {
      console.warn("[cuts-cleanup] Não foi possível listar originais vencidos:", error.message || error);
    }
    return 0;
  }
  let removed = 0;
  for (const source of sources || []) {
    const { error: removeError } = await supabase.storage.from(source.bucket || "video-cut-inputs").remove([source.storage_path]);
    if (removeError) {
      console.warn(`[cuts-cleanup:${source.job_id}] Falha ao apagar original:`, removeError.message || removeError);
      continue;
    }
    const { error: markError } = await supabase.rpc("mark_video_cut_source_deleted", {
      _job_id: source.job_id,
      _storage_path: source.storage_path,
    });
    if (markError) console.warn(`[cuts-cleanup:${source.job_id}] Original apagado, mas registro não foi limpo:`, markError.message || markError);
    removed += 1;
  }
  if (removed) console.log(`[cuts-cleanup] ${removed} original(is) privado(s) vencido(s) removido(s).`);
  return removed;
}

async function processVideoCutRerenderRequests() {
  const { data: requests, error } = await supabase.rpc("claim_video_cut_rerenders", { _worker: WORKER_ID, _limit: 1 });
  if (error) {
    if (!/claim_video_cut_rerenders|schema cache|does not exist/i.test(error.message || "")) {
      console.warn("[cuts-rerender] Não foi possível reclamar a fila:", error.message || error);
    }
    return 0;
  }
  for (const request of requests || []) {
    const tempDir = path.join(TEMP_DIR, `cut_rerender_${request.id}`);
    const sourcePath = path.join(tempDir, "source.mp4");
    try {
      await fs.promises.mkdir(tempDir, { recursive: true });
      const [{ data: job, error: jobError }, { data: clip, error: clipError }] = await Promise.all([
        supabase.from("video_cut_jobs").select("*").eq("id", request.job_id).single(),
        supabase.from("video_cut_clips").select("*").eq("id", request.clip_id).single(),
      ]);
      if (jobError || !job) throw new Error(jobError?.message || "Job original não encontrado.");
      if (clipError || !clip) throw new Error(clipError?.message || "Corte não encontrado.");

      if (job.source_kind === "upload") await downloadStoredVideo(job, sourcePath);
      else await downloadYoutubeVideo(job.youtube_url, sourcePath);

      const settings = await loadEffectivePostSettings(job);
      const { data: brand } = await supabase.from("video_cut_brand_profiles")
        .select("*").eq("instagram_account_id", job.instagram_account_id).maybeSingle();
      const cutSettings = {
        ...settings,
        brand_handle: brand?.watermark_enabled === false ? "" : (brand?.watermark_text || settings?.brand_handle),
        cut_brand_profile: brand || null,
      };
      clip.hook_enabled = job.hook_enabled !== false;
      await generateVideoCutClip(job, clip, sourcePath, cutSettings, tempDir);
      await supabase.from("video_cut_rerender_requests").update({
        status: "completed",
        completed_at: new Date().toISOString(),
        error_message: null,
      }).eq("id", request.id);
      console.log(`[cuts-rerender:${request.id}] Corte ${clip.id} reprocessado.`);
    } catch (rerenderError) {
      const message = String(rerenderError?.message || rerenderError).slice(0, 1000);
      await Promise.all([
        supabase.from("video_cut_rerender_requests").update({
          status: "failed", error_message: message, completed_at: new Date().toISOString(),
        }).eq("id", request.id),
        supabase.from("video_cut_clips").update({ status: "failed", error_message: message }).eq("id", request.clip_id),
      ]);
      console.warn(`[cuts-rerender:${request.id}] Falhou: ${message}`);
    } finally {
      try { await fs.promises.rm(tempDir, { recursive: true, force: true }); } catch {}
    }
  }
  return requests?.length || 0;
}

async function processQueuedReelJobs() {
  let jobs;
  try {
    const result = await withTransientRetry("reclamar jobs de Reel", async () => {
      const response = await supabase.rpc("claim_reel_jobs", { _worker: WORKER_ID, _limit: 1 });
      if (response.error) throw detailedServiceError("Falha ao reclamar jobs de Reel", response.error);
      return response;
    });
    jobs = result.data;
  } catch (error) {
    console.error("Erro ao reclamar jobs de Reel após as tentativas:", error);
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

async function recoverFailedNewsReels() {
  const { data: failedPosts, error } = await supabase
    .from("scheduled_posts")
    .select("id, user_id, instagram_account_id, news_item_id, scheduled_for, retry_count, error_message, news_items(id, content_type, generated_cover_url, generated_image_url)")
    .eq("status", "failed")
    .eq("media_type", "reel")
    .ilike("error_message", "%Erro ao processar mídia%")
    .lt("retry_count", 3)
    .order("scheduled_for", { ascending: true })
    .limit(50);
  if (error) {
    console.warn("Não foi possível consultar Reels rejeitados para recuperação:", error.message || error);
    return 0;
  }

  const recoverable = (failedPosts || []).filter((post) => {
    const news = Array.isArray(post.news_items) ? post.news_items[0] : post.news_items;
    return news && news.content_type !== "video_cut" && (news.generated_cover_url || news.generated_image_url);
  });
  if (!recoverable.length) return 0;

  const nextByAccount = new Map();
  for (const post of recoverable) {
    const news = Array.isArray(post.news_items) ? post.news_items[0] : post.news_items;
    const accountKey = post.instagram_account_id || post.user_id;
    const previous = nextByAccount.get(accountKey) || Date.now();
    const scheduledFor = new Date(Math.max(Date.now() + 2 * 60_000, previous + 10 * 60_000));
    nextByAccount.set(accountKey, scheduledFor.getTime());

    await supabase.from("news_items")
      .update({ generated_video_url: null, editorial_ready: false, error_message: null })
      .eq("id", news.id);
    await supabase.from("reel_render_jobs").delete().eq("scheduled_post_id", post.id);
    const { error: postError } = await supabase.from("scheduled_posts").update({
      status: "scheduled",
      scheduled_for: scheduledFor.toISOString(),
      retry_count: Number(post.retry_count || 0) + 1,
      error_message: "Reel rejeitado pela Meta; regenerando MP4 normalizado no VPS.",
    }).eq("id", post.id);
    if (postError) {
      console.warn(`[recover:${post.id}] Falha ao reenfileirar:`, postError.message || postError);
      continue;
    }
    await supabase.rpc("enqueue_reel_render_job_for_post", { _scheduled_post_id: post.id });
    console.log(`[recover:${post.id}] Reel comum reenfileirado para normalização Meta.`);
  }
  return recoverable.length;
}

async function loadEffectivePostSettings(post) {
  if (post.instagram_account_id) {
    const { data, error } = await supabase.rpc("get_effective_account_settings", { _account_id: post.instagram_account_id });
    if (!error && data) return data;
    if (error) console.warn(`Aviso: não consegui buscar configurações efetivas da conta ${post.instagram_account_id}:`, error.message || error);
  }

  const { data, error } = await supabase
    .from("user_settings")
    .select("brand_handle, brand_name, brand_logo_url, reel_audio_url, default_template_id, default_feed_template_id, default_story_template_id, default_reel_template_id")
    .eq("user_id", post.user_id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// Processa uma publicação agendada
async function processPost(post) {
  const news = {
    ...post.news_items,
    instagram_account_id: post.instagram_account_id || post.news_items?.instagram_account_id || null,
  };
  console.log(`--- [PROCESSANDO] Post ${post.id} (Tipo: ${post.media_type}) | Usuário: ${post.user_id} | News: ${news.id} ---`);

  try {
    const settings = await loadEffectivePostSettings(post);
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
      await supabase.from("scheduled_posts")
        .update({ error_message: null })
        .eq("id", post.id)
        .ilike("error_message", "%Aguardando geração da arte/vídeo com template%");
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
    throw err;
  }
}

async function processEditorialRenderQueue() {
  const { data: jobs, error: claimError } = await supabase.rpc("claim_editorial_render_jobs", {
    _worker: WORKER_ID,
    _limit: 1,
    _lease_seconds: 300,
  });
  if (claimError) {
    if (/claim_editorial_render_jobs|schema cache|does not exist/i.test(claimError.message || "")) {
      console.warn("[editorial-render] RPC ainda não disponível; aguardando a migration da 1B.");
      return 0;
    }
    throw detailedServiceError("Falha ao reclamar render editorial", claimError);
  }
  if (!jobs?.length) return 0;

  for (const job of jobs) {
    let completionError = null;
    try {
      const { data: post, error: postError } = await supabase
        .from("scheduled_posts")
        .select("id, user_id, media_type, instagram_account_id, news_item_id, news_items(*)")
        .eq("id", job.scheduled_post_id)
        .maybeSingle();
      if (postError) throw postError;
      if (!post?.news_items) throw new Error("Notícia do job editorial não encontrada.");

      await processPost(post);
      console.log(`[editorial-render:${job.scheduled_post_id}] concluído na tentativa ${job.attempt_count}.`);
    } catch (error) {
      completionError = String(error?.message || error).slice(0, 500);
      console.warn(`[editorial-render:${job.scheduled_post_id}] falhou: ${completionError}`);
    }

    const { data: completed, error: completeError } = await supabase.rpc("complete_editorial_render_job", {
      _scheduled_post_id: job.scheduled_post_id,
      _worker: WORKER_ID,
      _success: completionError === null,
      _error: completionError,
    });
    if (completeError) {
      console.error(`[editorial-render:${job.scheduled_post_id}] falha ao liberar claim:`, completeError.message || completeError);
    } else if (!completed) {
      console.warn(`[editorial-render:${job.scheduled_post_id}] claim expirou ou mudou de dono; conclusão ignorada com segurança.`);
    }
  }
  return jobs.length;
}

// Loop principal de polling
async function main() {
  console.log(`Iniciando worker ${WORKER_ID}. Filas: ${Array.from(WORKER_QUEUES).join(", ")}`);
  
  try {
    await setupFonts();
  } catch (err) {
    console.warn("Aviso: fontes/runtime visual não carregados na inicialização. O worker continua online, mas a geração visual vai falhar até corrigir a dependência.", err?.message || err);
  }

  await reportWorkerHealth();
  if (queueEnabled("media")) await recoverFailedNewsReels();
  if (queueEnabled("cuts")) await cleanupExpiredVideoCutSources();
  const heartbeatTimer = setInterval(() => {
    reportWorkerHealth().catch((error) => {
      console.warn("[health] Heartbeat falhou:", error?.message || error);
    });
  }, 30000);
  heartbeatTimer.unref();
  const sourceCleanupTimer = setInterval(() => {
    if (!queueEnabled("cuts")) return;
    cleanupExpiredVideoCutSources().catch((error) => {
      console.warn("[cuts-cleanup] Rotina falhou:", error?.message || error);
    });
  }, 60 * 60 * 1000);
  sourceCleanupTimer.unref();

  while (true) {
    try {
      if (queueEnabled("cuts")) {
        await processVideoCutRerenderRequests();
        await processQueuedVideoCutJobs();
      }

      if (queueEnabled("media")) {
        await processQueuedReelJobs();
        await processEditorialRenderQueue();
      }

    } catch (err) {
      console.error("Erro no ciclo do worker:", err);
    }
    
    // Aguarda 30 segundos antes do próximo polling para reduzir picos de CPU no VPS.
    await new Promise((resolve) => setTimeout(resolve, 30000));
  }
}

main();
