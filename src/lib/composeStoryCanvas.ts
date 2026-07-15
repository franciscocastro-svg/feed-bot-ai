// Renderiza Story 1080x1920 — Opção 1: foto fullscreen + overlay editorial
// Sem CTA e sem @handle. Foco em título + resumo.
import { supabase } from "@/integrations/supabase/client";
import { drawTemplateGradient } from "../../supabase/functions/_shared/template-gradients.js";
import { normalizeTemplateConfig, textXForBox } from "../../supabase/functions/_shared/template-layouts.js";
import { containDestinationRect, coverSourceRect } from "../../supabase/functions/_shared/image-framing.js";
import { loadPublishedTemplate } from "../../supabase/functions/_shared/template-versioning.js";

const W = 1080;
const H = 1920;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function proxify(url: string, w = 1080, h = 1920) {
  const clean = url.replace(/&amp;/gi, "&").replace(/^https?:\/\//, "");
  return `https://images.weserv.nl/?url=${encodeURIComponent(clean)}&w=${w}&h=${h}&fit=cover&output=jpg`;
}

function proxifyPreserved(url: string, w = 1080) {
  const clean = url.replace(/&amp;/gi, "&").replace(/^https?:\/\//, "");
  return `https://images.weserv.nl/?url=${encodeURIComponent(clean)}&w=${w}&we&output=jpg`;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxChars = Number.POSITIVE_INFINITY): string[] {
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
  ctx.filter = "blur(30px)";
  ctx.globalAlpha = 0.76;
  drawCover(ctx, img, x - 36, y - 36, w + 72, h + 72);
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

async function drawBrandElements(ctx: CanvasRenderingContext2D, config: any) {
  const elements = Array.isArray(config?.brandElements) ? config.brandElements.slice(0, 12) : [];
  for (const element of elements) {
    const x = safeNumber(element?.x, 0, W, 0);
    const y = safeNumber(element?.y, 0, H, 0);
    const opacity = safeNumber(element?.opacity, 0.1, 1, 1);
    ctx.save();
    ctx.globalAlpha = opacity;
    if (element?.type === "image" && typeof element.url === "string") {
      try {
        const img = await loadImage(element.url);
        const width = safeNumber(element.width, 20, W, 240);
        const height = safeNumber(element.height, 20, H, 120);
        drawContain(ctx, img, x, y, width, height);
      } catch {}
    }
    if (element?.type === "text") {
      const text = typeof element.text === "string" ? element.text.slice(0, 80) : "";
      if (text) {
        const width = safeNumber(element.width, 40, W, 420);
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

async function drawTemplate(ctx: CanvasRenderingContext2D, item: any, settings: any, template: any, opts: { withFollowCta?: boolean }) {
  const handle = (settings?.brand_handle || settings?.brand_name || "").replace(/^@/, "").trim();
  const cfg = normalizeTemplateConfig(template.config, opts.withFollowCta ? "reels" : "stories");
  const title = (item.rewritten_title?.trim() || item.original_title?.trim() || "Notícia").toUpperCase();
  const subtitle = item.rewritten_summary?.trim() || item.original_content?.replace(/<[^>]+>/g, " ").trim().slice(0, 220) || "";

  if (template.background_url) {
    try {
      const bg = await loadImage(proxify(template.background_url, 1080, 1920));
      drawCover(ctx, bg, 0, 0, W, H);
    } catch {
      drawTemplateGradient(ctx, template.preset_key, template.config, W, H);
    }
  } else {
    drawTemplateGradient(ctx, template.preset_key, template.config, W, H);
  }

  if (cfg.showPhoto && item.original_image_url) {
    try {
      const photo = await loadImage(proxifyPreserved(item.original_image_url, 1600));
      drawProtectedPhoto(ctx, photo, cfg.photoX, cfg.photoY, cfg.photoW, cfg.photoH);
    } catch {}
  }
  if (cfg.overlayOpacity > 0) {
    ctx.fillStyle = `rgba(0,0,0,${cfg.overlayOpacity})`;
    ctx.fillRect(0, 0, W, H);
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
  wrap(ctx, title, cfg.titleW, cfg.titleMaxChars).slice(0, cfg.titleMaxLines).forEach((l, i) => ctx.fillText(l, titleX, cfg.titleY + i * Math.round(cfg.titleSize * 1.05)));
  if (subtitle) {
    ctx.fillStyle = cfg.subtitleColor;
    ctx.font = `500 ${cfg.subtitleSize}px Inter, system-ui, sans-serif`;
    ctx.textAlign = cfg.subtitleAlign;
    const subtitleX = textXForBox(cfg.subtitleX, cfg.subtitleW, cfg.subtitleAlign);
    wrap(ctx, subtitle, cfg.subtitleW, Math.floor(cfg.titleMaxChars * 2.2)).slice(0, cfg.subtitleMaxLines).forEach((l, i) => ctx.fillText(l, subtitleX, cfg.subtitleY + i * Math.round(cfg.subtitleSize * 1.3)));
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
  await drawBrandElements(ctx, cfg);
}

async function loadEffectiveSettings(item: any) {
  if (item?.instagram_account_id) {
    const { data, error } = await supabase.rpc("get_effective_account_settings", { _account_id: item.instagram_account_id });
    if (!error && data) return data as any;
  }

  const { data } = await supabase
    .from("user_settings")
    .select("brand_handle, brand_name, default_template_id, default_story_template_id, default_reel_template_id")
    .maybeSingle();

  return data as any;
}

export async function composeAndUploadStory(item: any, opts: { withFollowCta?: boolean } = {}): Promise<string> {
  // Fallbacks: se o AI rewrite ainda não populou os campos, usa os originais
  // para nunca renderizar um Story em branco.
  const title = (
    item.rewritten_title?.trim() ||
    item.original_title?.trim() ||
    "Notícia"
  );
  const subtitle = (
    item.rewritten_summary?.trim() ||
    item.original_content?.replace(/<[^>]+>/g, " ").trim().slice(0, 220) ||
    ""
  );
  const sourceName = (item.source_name || "").trim();

  // handle da marca para CTA discreto de "siga"
  const settings = await loadEffectiveSettings(item);
  const handle = (settings?.brand_handle || settings?.brand_name || "").replace(/^@/, "").trim();
  const templateId = opts.withFollowCta
    ? settings?.default_reel_template_id || settings?.default_template_id
    : settings?.default_story_template_id || settings?.default_template_id;
  const template = await loadPublishedTemplate(supabase, {
    accountId: item?.instagram_account_id,
    fallbackTemplateId: templateId,
    format: opts.withFollowCta ? "reels" : "stories",
  });

  let photoImg: HTMLImageElement | null = null;
  if (item.original_image_url) {
    // 1) tenta via proxy weserv (resolve CORS e hotlink)
    try { photoImg = await loadImage(proxifyPreserved(item.original_image_url, 1600)); } catch {}
    // 2) fallback: tenta direto (alguns CDNs servem CORS sem proxy)
    if (!photoImg) {
      try { photoImg = await loadImage(item.original_image_url); } catch {}
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  if (template) {
    await drawTemplate(ctx, item, settings, template, opts);
    const blob: Blob = await new Promise((resolve, reject) =>
      canvas.toBlob(b => b ? resolve(b) : reject(new Error("blob fail")), "image/jpeg", 0.92)
    );
    const { data: { user } } = await supabase.auth.getUser();
    const path = `${user!.id}/${item.id}-story.jpg`;
    const { error } = await supabase.storage.from("post-images").upload(path, blob, {
      contentType: "image/jpeg", upsert: true,
    });
    if (error) throw error;
    const { data: pub } = supabase.storage.from("post-images").getPublicUrl(path);
    const url = `${pub.publicUrl}?t=${Date.now()}`;
    await supabase.from("news_items").update({ generated_cover_url: url }).eq("id", item.id);
    return url;
  }

  // ===== Foto fullscreen com enquadramento protegido =====
  if (photoImg) {
    drawProtectedPhoto(ctx, photoImg, 0, 0, W, H);
  } else {
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#1E1B4B");
    grad.addColorStop(1, "#0A0A0A");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }

  // ===== Safe areas do Instagram Reels =====
  // Topo: ~220px (status bar + back + câmera)
  // Base: ~560px (avatar/username + legenda + botões laterais + "Inspirar-se")
  const SAFE_TOP = 230;
  const SAFE_BOTTOM = 320;

  // ===== Gradiente topo (para o badge ficar legível) =====
  const topGrad = ctx.createLinearGradient(0, 0, 0, SAFE_TOP + 200);
  topGrad.addColorStop(0, "rgba(0,0,0,0.65)");
  topGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, W, SAFE_TOP + 200);

  // ===== Gradiente base (mais curto e suave para não criar grande tarja preta) =====
  const bottomGradH = 700;
  const bottomGrad = ctx.createLinearGradient(0, H - bottomGradH, 0, H);
  bottomGrad.addColorStop(0, "rgba(0,0,0,0)");
  bottomGrad.addColorStop(0.45, "rgba(0,0,0,0.6)");
  bottomGrad.addColorStop(1, "rgba(0,0,0,0.92)");
  ctx.fillStyle = bottomGrad;
  ctx.fillRect(0, H - bottomGradH, W, bottomGradH);

  // ===== Badge URGENTE (maior e abaixo da safe area do IG) =====
  const badgeText = "URGENTE";
  ctx.font = "900 44px Inter, system-ui, sans-serif";
  const bw = ctx.measureText(badgeText).width + 70;
  const bh = 84;
  const bx = 60, by = SAFE_TOP + 20;
  ctx.fillStyle = "#DC2626";
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = "#FFFFFF";
  ctx.textBaseline = "middle";
  ctx.fillText(badgeText, bx + 35, by + bh / 2 + 2);

  // Fonte (origem da notícia) ao lado do badge
  if (sourceName) {
    ctx.font = "700 32px Inter, system-ui, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.textBaseline = "middle";
    ctx.fillText(sourceName.toUpperCase(), bx + bw + 24, by + bh / 2 + 2);
  }

  // ===== Conteúdo (título + subtítulo) acima da área de UI do IG =====
  const padX = 70;
  const maxW = W - padX * 2;

  ctx.textBaseline = "alphabetic";

  // Título
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "900 76px Inter, system-ui, sans-serif";
  const titleLines = wrap(ctx, title, maxW).slice(0, 5);
  const titleLH = 86;
  const titleBlockH = titleLines.length * titleLH;

  // Subtítulo/resumo
  ctx.font = "500 32px Inter, system-ui, sans-serif";
  const subLines = subtitle ? wrap(ctx, subtitle, maxW).slice(0, 3) : [];
  const subLH = 44;
  const subBlockH = subLines.length * subLH;

  // posicionar bloco título+subtitulo terminando ANTES da safe area inferior do IG
  const blockBottom = H - SAFE_BOTTOM;
  const totalH = titleBlockH + (subBlockH ? subBlockH + 30 : 0);
  let y = blockBottom - totalH;

  // ===== Backdrop suave atrás do bloco de texto (full-width, sem elipse) =====
  // Usa gradiente vertical full-bleed que se funde com o gradiente base já desenhado.
  // Garante legibilidade em fotos claras sem criar "bolha" visível.
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

  // título — com text-shadow para garantir contraste mesmo se o blur falhar
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.85)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = "#FFFFFF";
  ctx.font = "900 76px Inter, system-ui, sans-serif";
  titleLines.forEach((l, i) => {
    ctx.fillText(l, padX, y + (i + 1) * titleLH - 14);
  });

  // subtítulo
  if (subLines.length) {
    const subY = y + titleBlockH + 30;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.font = "500 32px Inter, system-ui, sans-serif";
    ctx.shadowBlur = 12;
    subLines.forEach((l, i) => {
      ctx.fillText(l, padX, subY + (i + 1) * subLH - 12);
    });
  }
  ctx.restore();

  // Linha amarela acima do título (acento editorial)
  ctx.fillStyle = "#FFD400";
  ctx.fillRect(padX, y - 28, 100, 6);

  // ===== CTA discreto: "👉 SIGA @handle" acima da linha amarela =====
  if (handle && opts.withFollowCta) {
    const ctaText = `👉 SIGA @${handle.toUpperCase()} PARA MAIS`;
    ctx.font = "800 28px Inter, system-ui, sans-serif";
    const ctw = ctx.measureText(ctaText).width + 44;
    const cth = 56;
    const cx = padX, cy = y - 28 - cth - 22;
    // pílula amarela translúcida
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
    ctx.fillStyle = "#000";
    ctx.textBaseline = "middle";
    ctx.fillText(ctaText, cx + 22, cy + cth / 2 + 1);
    ctx.textBaseline = "alphabetic";
  }

  // ===== Upload =====
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob(b => b ? resolve(b) : reject(new Error("blob fail")), "image/jpeg", 0.92)
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = `${user!.id}/${item.id}-story.jpg`;
  const { error } = await supabase.storage.from("post-images").upload(path, blob, {
    contentType: "image/jpeg", upsert: true,
  });
  if (error) throw error;
  const { data: pub } = supabase.storage.from("post-images").getPublicUrl(path);
  const url = `${pub.publicUrl}?t=${Date.now()}`;

  await supabase.from("news_items").update({ generated_cover_url: url }).eq("id", item.id);
  return url;
}
