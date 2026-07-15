// Renderiza o template do post (1080x1080) no canvas e retorna PNG blob.
// Mesma lógica visual do PostCanvasEditor — usado em auto-processamento.
import { supabase } from "@/integrations/supabase/client";
import { drawTemplateGradient } from "../../supabase/functions/_shared/template-gradients.js";
import { normalizeTemplateConfig, textXForBox } from "../../supabase/functions/_shared/template-layouts.js";
import { containDestinationRect, coverSourceRect } from "../../supabase/functions/_shared/image-framing.js";

const SIZE = 1080;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function proxify(url: string, w = 1080) {
  const clean = url.replace(/&amp;/gi, "&").replace(/^https?:\/\//, "");
  return `https://images.weserv.nl/?url=${encodeURIComponent(clean)}&w=${w}&output=jpg`;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxChars = Number.POSITIVE_INFINITY): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
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

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const source = coverSourceRect(img.width, img.height, w, h);
  ctx.drawImage(img, source.x, source.y, source.width, source.height, x, y, w, h);
}

function drawContain(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const destination = containDestinationRect(img.width, img.height, x, y, w, h);
  ctx.drawImage(img, destination.x, destination.y, destination.width, destination.height);
}

function drawProtectedPhoto(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = "#111111";
  ctx.fillRect(x, y, w, h);
  ctx.filter = "blur(24px)";
  ctx.globalAlpha = 0.72;
  drawCover(ctx, img, x - 28, y - 28, w + 56, h + 56);
  ctx.filter = "none";
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  ctx.fillRect(x, y, w, h);
  drawContain(ctx, img, x, y, w, h);
  ctx.restore();
}

function safeNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function safeColor(value: unknown, fallback = "#FFFFFF") {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

async function drawBrandElements(ctx: CanvasRenderingContext2D, config: any, canvasHeight: number) {
  const elements = Array.isArray(config?.brandElements) ? config.brandElements.slice(0, 12) : [];
  for (const element of elements) {
    const x = safeNumber(element?.x, 0, SIZE, 0);
    const y = safeNumber(element?.y, 0, canvasHeight, 0);
    const opacity = safeNumber(element?.opacity, 0.1, 1, 1);
    ctx.save();
    ctx.globalAlpha = opacity;
    if (element?.type === "image" && typeof element.url === "string") {
      try {
        const img = await loadImage(element.url);
        const w = safeNumber(element.width, 20, SIZE, 240);
        const h = safeNumber(element.height, 20, canvasHeight, 120);
        drawContain(ctx, img, x, y, w, h);
      } catch {}
    }
    if (element?.type === "text") {
      const text = typeof element.text === "string" ? element.text.slice(0, 80) : "";
      if (text) {
        const width = safeNumber(element.width, 40, SIZE, 420);
        const size = safeNumber(element.fontSize, 12, 160, 34);
        const weight = safeNumber(element.fontWeight, 300, 900, 700);
        const align = ["left", "center", "right"].includes(element.align) ? element.align : "left";
        ctx.fillStyle = safeColor(element.color);
        ctx.font = `${weight} ${size}px Inter, system-ui, sans-serif`;
        ctx.textAlign = align;
        ctx.fillText(text, textXForBox(x, width, align), y + size);
      }
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = "left";
}

async function drawTemplate(ctx: CanvasRenderingContext2D, item: any, settings: any, template: any) {
  const cfg = normalizeTemplateConfig(template.config, "feed");
  const handle = (settings?.brand_handle || settings?.brand_name || "").replace(/^@/, "");
  const title = (item.rewritten_title || item.original_title || "").toUpperCase();
  const subtitle = item.rewritten_summary || "";

  if (template.background_url) {
    try {
      const bg = await loadImage(proxify(template.background_url, SIZE));
      drawCover(ctx, bg, 0, 0, SIZE, SIZE);
    } catch {
      drawTemplateGradient(ctx, template.preset_key, template.config, SIZE, SIZE);
    }
  } else {
    drawTemplateGradient(ctx, template.preset_key, template.config, SIZE, SIZE);
  }

  if (cfg.showPhoto && item.original_image_url) {
    try {
      const photo = await loadImage(proxify(item.original_image_url, 1080));
      drawProtectedPhoto(ctx, photo, cfg.photoX, cfg.photoY, cfg.photoW, cfg.photoH);
    } catch {}
  }
  if (cfg.overlayOpacity > 0) {
    ctx.fillStyle = `rgba(0,0,0,${cfg.overlayOpacity})`;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }
  if (cfg.showHandle && handle) {
    ctx.fillStyle = cfg.handleColor;
    ctx.font = `800 ${cfg.handleSize}px Inter, system-ui, sans-serif`;
    ctx.fillText(`@${handle.toUpperCase()}`, cfg.handleX, cfg.handleY);
  }
  ctx.fillStyle = cfg.titleColor;
  ctx.font = `900 ${cfg.titleSize}px Inter, system-ui, sans-serif`;
  ctx.textAlign = cfg.titleAlign;
  const titleX = textXForBox(cfg.titleX, cfg.titleW, cfg.titleAlign);
  wrapText(ctx, title, cfg.titleW, cfg.titleMaxChars).slice(0, cfg.titleMaxLines).forEach((l, i) => ctx.fillText(l, titleX, cfg.titleY + i * Math.round(cfg.titleSize * 1.05)));
  if (subtitle) {
    ctx.fillStyle = cfg.subtitleColor;
    ctx.font = `500 ${cfg.subtitleSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = cfg.subtitleAlign;
    const subtitleX = textXForBox(cfg.subtitleX, cfg.subtitleW, cfg.subtitleAlign);
    wrapText(ctx, subtitle, cfg.subtitleW, Math.floor(cfg.titleMaxChars * 2.2)).slice(0, cfg.subtitleMaxLines).forEach((l, i) => ctx.fillText(l, subtitleX, cfg.subtitleY + i * Math.round(cfg.subtitleSize * 1.3)));
  }
  if (cfg.showBadge && cfg.badgeText) {
    ctx.fillStyle = cfg.badgeBg;
    ctx.fillRect(cfg.badgeX, cfg.badgeY, cfg.badgeW, cfg.badgeH);
    ctx.fillStyle = cfg.badgeColor;
    ctx.font = `900 ${cfg.badgeSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(cfg.badgeText, cfg.badgeX + cfg.badgeW / 2, cfg.badgeY + cfg.badgeH / 2 + cfg.badgeSize * 0.35);
    ctx.textAlign = "left";
  }
  await drawBrandElements(ctx, cfg, SIZE);
}

async function loadEffectiveSettings(item: any) {
  if (item?.instagram_account_id) {
    const { data, error } = await supabase.rpc("get_effective_account_settings", { _account_id: item.instagram_account_id });
    if (!error && data) return data as any;
  }

  const { data } = await supabase
    .from("user_settings")
    .select("brand_handle, brand_name, brand_logo_url, default_template_id, default_feed_template_id")
    .maybeSingle();

  return data as any;
}

export async function composeAndUploadPost(item: any): Promise<string> {
  const settings = await loadEffectiveSettings(item);
  const templateId = settings?.default_feed_template_id || settings?.default_template_id;
  const { data: template } = templateId
    ? await supabase.from("post_templates").select("*").eq("id", templateId).eq("format", "feed").maybeSingle()
    : { data: null };

  const handle = (settings?.brand_handle || settings?.brand_name || "").replace(/^@/, "");
  const title = (item.rewritten_title || item.original_title || "").toUpperCase();
  const subtitle = item.rewritten_summary || "";

  let photoImg: HTMLImageElement | null = null;
  let logoImg: HTMLImageElement | null = null;
  try { if (item.original_image_url) photoImg = await loadImage(proxify(item.original_image_url, 1080)); } catch {}
  try { if (settings?.brand_logo_url) logoImg = await loadImage(proxify(settings.brand_logo_url, 200)); } catch {}

  const canvas = document.createElement("canvas");
  canvas.width = SIZE; canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;

  if (template) {
    await drawTemplate(ctx, item, settings, template);
    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob(b => b ? resolve(b) : reject(new Error("blob fail")), "image/png", 0.95)
    );
    const { data: { user } } = await supabase.auth.getUser();
    const path = `${user!.id}/${item.id}.png`;
    const { error } = await supabase.storage.from("post-images").upload(path, blob, {
      contentType: "image/png", upsert: true,
    });
    if (error) throw error;
    const { data: pub } = supabase.storage.from("post-images").getPublicUrl(path);
    const url = `${pub.publicUrl}?t=${Date.now()}`;
    await supabase.from("news_items").update({ generated_image_url: url }).eq("id", item.id);
    return url;
  }

  // header
  const headerH = 528;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, SIZE, headerH);

  // avatar
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

  ctx.fillStyle = "#000";
  ctx.font = "800 22px Inter, system-ui, sans-serif";
  ctx.fillText(`@${handle.toUpperCase()}`, ax + ar + 22, ay + 10);

  ctx.beginPath();
  ctx.arc(1020, ay, 9, 0, Math.PI * 2);
  ctx.fillStyle = "#DC2626";
  ctx.fill();

  ctx.fillStyle = "#000";
  ctx.fillRect(60, 140, 960, 1.5);

  // título
  ctx.fillStyle = "#000";
  ctx.font = "900 56px Inter, system-ui, sans-serif";
  const titleLines = wrapText(ctx, title, 960).slice(0, 4);
  titleLines.forEach((l, i) => ctx.fillText(l, 60, 210 + i * 60));

  // subtítulo
  ctx.fillStyle = "#52525B";
  ctx.font = "500 24px Inter, system-ui, sans-serif";
  const subLines = wrapText(ctx, subtitle, 960).slice(0, 2);
  subLines.forEach((l, i) => ctx.fillText(l, 60, 440 + i * 32));

  // foto (parte de baixo)
  const py = headerH, ph = SIZE - headerH;
  if (photoImg) {
    drawProtectedPhoto(ctx, photoImg, 0, py, SIZE, ph);
  } else {
    const grad = ctx.createLinearGradient(0, py, SIZE, SIZE);
    grad.addColorStop(0, "#1E1B4B");
    grad.addColorStop(0.5, "#7C3AED");
    grad.addColorStop(1, "#FFD400");
    ctx.fillStyle = grad;
    ctx.fillRect(0, py, SIZE, ph);
    ctx.fillStyle = "#FFF";
    ctx.font = "900 64px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`@${handle.toUpperCase()}`, SIZE / 2, py + ph / 2);
    ctx.textAlign = "left";
  }

  // badge
  const bw = 360, bh = 60, bx = SIZE - bw - 60, by = 498;
  ctx.fillStyle = "#FFD400";
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = "#000";
  ctx.font = "900 22px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("LEIA A LEGENDA →", bx + bw / 2, by + 40);
  ctx.textAlign = "left";

  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(b => b ? resolve(b) : reject(new Error("blob fail")), "image/png", 0.95)
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = `${user!.id}/${item.id}.png`;
  const { error } = await supabase.storage.from("post-images").upload(path, blob, {
    contentType: "image/png", upsert: true,
  });
  if (error) throw error;
  const { data: pub } = supabase.storage.from("post-images").getPublicUrl(path);
  const url = `${pub.publicUrl}?t=${Date.now()}`;

  await supabase.from("news_items").update({ generated_image_url: url }).eq("id", item.id);
  return url;
}
