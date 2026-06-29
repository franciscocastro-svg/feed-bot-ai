import { exec } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
import dotenv from "dotenv";
import WebSocket from "ws";
import { drawTemplateGradient } from "../supabase/functions/_shared/template-gradients.js";
import { normalizeTemplateConfig, textXForBox } from "../supabase/functions/_shared/template-layouts.js";

const execAsync = promisify(exec);
const RETRY_DELAYS_MS = [1000, 3000, 7000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

function isManagedReelVideoUrl(url, userId, itemId) {
  if (!url || !userId || !itemId) return false;
  const clean = String(url).split("?")[0];
  let decoded = clean;
  try { decoded = decodeURIComponent(clean); } catch { /* keep raw url */ }
  const expectedPath = `${userId}/${itemId}.mp4`;
  return decoded.includes(`/post-images/${expectedPath}`) || decoded.endsWith(`/${expectedPath}`);
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

// Configura as fontes Inter (Regular e Bold)
async function setupFonts() {
  const fontRegularPath = path.join(FONTS_DIR, "Inter-Regular.ttf");
  const fontBoldPath = path.join(FONTS_DIR, "Inter-Bold.ttf");

  if (!fs.existsSync(fontRegularPath)) {
    console.log("Baixando fonte Inter-Regular.ttf...");
    try {
      await downloadFile("https://github.com/google/fonts/raw/main/ofl/inter/static/Inter-Regular.ttf", fontRegularPath);
    } catch (err) {
      console.warn("Aviso: não foi possível baixar Inter-Regular.ttf; usando fonte padrão do sistema.", err);
    }
  }
  if (!fs.existsSync(fontBoldPath)) {
    console.log("Baixando fonte Inter-Bold.ttf...");
    try {
      await downloadFile("https://github.com/google/fonts/raw/main/ofl/inter/static/Inter-Bold.ttf", fontBoldPath);
    } catch (err) {
      console.warn("Aviso: não foi possível baixar Inter-Bold.ttf; usando fonte padrão do sistema.", err);
    }
  }

  // Registra as fontes no Canvas global
  if (fs.existsSync(fontRegularPath)) {
    GlobalFonts.registerFromPath(fontRegularPath, "Inter");
  }
  if (fs.existsSync(fontBoldPath)) {
    GlobalFonts.registerFromPath(fontBoldPath, "InterBold");
  }
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

async function loadTemplateForFormat(userId, settings, format) {
  const templateId = templateIdForFormat(settings, format);
  if (!templateId) return null;
  const normalized = format === "story" ? "stories" : format === "reel" ? "reels" : "feed";
  const { data, error } = await supabase
    .from("post_templates")
    .select("*")
    .eq("id", templateId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.warn(`[template] Falha ao buscar template ${templateId}:`, error.message);
    return null;
  }
  if (!data || (data.format || "feed") !== normalized) return null;
  return data;
}

function drawCoverImage(ctx, img, x, y, w, h) {
  const ratio = Math.max(w / img.width, h / img.height);
  const sw = w / ratio;
  const sh = h / ratio;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function drawContainImage(ctx, img, x, y, w, h) {
  const ratio = Math.min(w / img.width, h / img.height);
  const dw = img.width * ratio;
  const dh = img.height * ratio;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
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
        ctx.font = `${weight} ${size}px InterBold, Inter, sans-serif`;
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
  const title = (item.rewritten_title || item.original_title || "Notícia").toUpperCase();
  const subtitle = item.rewritten_summary || "";
  const handle = (settings?.brand_handle || settings?.brand_name || "").replace(/^@/, "");

  if (template.background_url) {
    const bgImg = await loadImageHelper(template.background_url);
    if (bgImg) drawCoverImage(ctx, bgImg, 0, 0, width, height);
    else drawTemplateGradient(ctx, template.preset_key, template.config, width, height);
  } else {
    drawTemplateGradient(ctx, template.preset_key, template.config, width, height);
  }

  if (cfg.showPhoto && item.original_image_url) {
    const photoImg = await loadImageHelper(item.original_image_url);
    if (photoImg) drawCoverImage(ctx, photoImg, cfg.photoX, cfg.photoY, cfg.photoW, cfg.photoH);
  }

  if (cfg.overlayOpacity > 0) {
    ctx.fillStyle = `rgba(0,0,0,${cfg.overlayOpacity})`;
    ctx.fillRect(0, 0, width, height);
  }

  if (cfg.showHandle && handle) {
    ctx.fillStyle = cfg.handleColor;
    ctx.font = `800 ${cfg.handleSize}px InterBold, Inter, sans-serif`;
    ctx.fillText(`@${handle.toUpperCase()}`, cfg.handleX, cfg.handleY);
  }

  ctx.fillStyle = cfg.titleColor;
  ctx.font = `900 ${cfg.titleSize}px InterBold, Inter, sans-serif`;
  ctx.textAlign = cfg.titleAlign;
  const titleX = textXForBox(cfg.titleX, cfg.titleW, cfg.titleAlign);
  wrapText(ctx, title, cfg.titleW, cfg.titleMaxChars).slice(0, cfg.titleMaxLines).forEach((line, i) => {
    ctx.fillText(line, titleX, cfg.titleY + i * Math.round(cfg.titleSize * 1.05));
  });

  if (subtitle) {
    ctx.fillStyle = cfg.subtitleColor;
    ctx.font = `500 ${cfg.subtitleSize}px Inter, sans-serif`;
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
    ctx.font = `900 ${cfg.badgeSize}px InterBold, Inter, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(cfg.badgeText, cfg.badgeX + cfg.badgeW / 2, cfg.badgeY + cfg.badgeH / 2 + cfg.badgeSize * 0.35);
    ctx.textAlign = "left";
  }
  await drawBrandElementsNode(ctx, cfg, width, height);
}

// 1. Renderiza e faz upload do Post (1080x1080)
async function composeAndUploadPostNode(item, settings) {
  const SIZE = 1080;
  const template = await loadTemplateForFormat(item.user_id, settings, "feed");
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
    const buffer = await canvas.encode("png");
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
  const template = await loadTemplateForFormat(item.user_id, settings, opts.withFollowCta ? "reel" : "story");

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
    const buffer = await canvas.encode("jpeg");
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
        .select("id, user_id, media_type, instagram_account_id, news_item_id, news_items(*)")
        .eq("status", "scheduled")
        .limit(5);

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
            if (p.media_type === "reel" && !isManagedReelVideoUrl(n.generated_video_url, n.user_id || p.user_id, n.id)) return true;
            return false;
          }
          return true;
        });

        if (todo.length > 0) {
          console.log(`Fila: ${todo.length} posts pendentes encontrados.`);
          for (const post of todo.slice(0, 1)) {
            await processPost(post);
          }
        }
      }
    } catch (err) {
      console.error("Erro no ciclo do worker:", err);
    }
    
    // Aguarda 30 segundos antes do próximo polling para reduzir picos de CPU no VPS.
    await new Promise((resolve) => setTimeout(resolve, 30000));
  }
}

main();
