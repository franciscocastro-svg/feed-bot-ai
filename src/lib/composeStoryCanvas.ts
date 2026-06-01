// Renderiza Story 1080x1920 — Opção 1: foto fullscreen + overlay editorial
// Sem CTA e sem @handle. Foco em título + resumo.
import { supabase } from "@/integrations/supabase/client";

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

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
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

function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const ratio = Math.max(w / img.width, h / img.height);
  const sw = w / ratio;
  const sh = h / ratio;
  const sx = (img.width - sw) / 2;
  const sy = (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function drawPreset(ctx: CanvasRenderingContext2D, presetKey: string | null | undefined) {
  if (presetKey?.includes("yellow")) {
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#FFD400";
    ctx.fillRect(0, 0, W, 360);
    return;
  }
  if (presetKey?.includes("breaking")) {
    ctx.fillStyle = "#0A0A0A";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#DC2626";
    ctx.fillRect(0, 0, W, 320);
    return;
  }
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#18181B";
  ctx.fillRect(0, H - 700, W, 700);
}

async function drawTemplate(ctx: CanvasRenderingContext2D, item: any, settings: any, template: any, opts: { withFollowCta?: boolean }) {
  const handle = (settings?.brand_handle || settings?.brand_name || "").replace(/^@/, "").trim();
  const cfg = {
    titleY: 1160,
    titleSize: 76,
    titleColor: "#FFFFFF",
    subtitleY: 1480,
    subtitleSize: 32,
    subtitleColor: "#FFFFFF",
    showHandle: true,
    handleY: 120,
    handleColor: "#FFFFFF",
    showBadge: true,
    badgeText: opts.withFollowCta && handle ? `SIGA @${handle.toUpperCase()} PARA MAIS` : "URGENTE",
    badgeBg: "#FFD400",
    badgeColor: "#000000",
    badgeY: 1540,
    overlayOpacity: 0.45,
    showPhoto: true,
    photoX: 70,
    photoY: 440,
    photoW: 940,
    photoH: 620,
    ...(template.config || {}),
  };
  const title = (item.rewritten_title?.trim() || item.original_title?.trim() || "Notícia").toUpperCase();
  const subtitle = item.rewritten_summary?.trim() || item.original_content?.replace(/<[^>]+>/g, " ").trim().slice(0, 220) || "";

  if (template.background_url) {
    try {
      const bg = await loadImage(proxify(template.background_url, 1080, 1920));
      drawCover(ctx, bg, 0, 0, W, H);
    } catch {
      drawPreset(ctx, template.preset_key);
    }
  } else {
    drawPreset(ctx, template.preset_key);
  }

  if (cfg.showPhoto && item.original_image_url) {
    try {
      const photo = await loadImage(proxify(item.original_image_url, 1080, 1920));
      drawCover(ctx, photo, cfg.photoX, cfg.photoY, cfg.photoW, cfg.photoH);
    } catch {}
  }
  if (!template.background_url && cfg.overlayOpacity > 0) {
    ctx.fillStyle = `rgba(0,0,0,${cfg.overlayOpacity})`;
    ctx.fillRect(0, 0, W, H);
  }
  if (cfg.showHandle && handle) {
    ctx.fillStyle = cfg.handleColor;
    ctx.font = "800 28px Inter, system-ui, sans-serif";
    ctx.fillText(`@${handle.toUpperCase()}`, 60, cfg.handleY);
  }
  ctx.fillStyle = cfg.titleColor;
  ctx.font = `900 ${cfg.titleSize}px Inter, system-ui, sans-serif`;
  wrap(ctx, title, W - 120).slice(0, 5).forEach((l, i) => ctx.fillText(l, 60, cfg.titleY + i * Math.round(cfg.titleSize * 1.05)));
  if (subtitle) {
    ctx.fillStyle = cfg.subtitleColor;
    ctx.font = `500 ${cfg.subtitleSize}px Inter, system-ui, sans-serif`;
    wrap(ctx, subtitle, W - 120).slice(0, 3).forEach((l, i) => ctx.fillText(l, 60, cfg.subtitleY + i * Math.round(cfg.subtitleSize * 1.3)));
  }
  if (cfg.showBadge && cfg.badgeText) {
    const bw = Math.min(W - 120, Math.max(300, cfg.badgeText.length * 18 + 52));
    const bx = W - bw - 60;
    ctx.fillStyle = cfg.badgeBg;
    ctx.fillRect(bx, cfg.badgeY, bw, 64);
    ctx.fillStyle = cfg.badgeColor;
    ctx.font = "900 24px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(cfg.badgeText, bx + bw / 2, cfg.badgeY + 42);
    ctx.textAlign = "left";
  }
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
  const { data: settings } = await supabase
    .from("user_settings")
    .select("brand_handle, brand_name, default_template_id, default_story_template_id, default_reel_template_id")
    .maybeSingle();
  const handle = (settings?.brand_handle || settings?.brand_name || "").replace(/^@/, "").trim();
  const templateId = opts.withFollowCta
    ? (settings?.default_reel_template_id || settings?.default_template_id)
    : (settings?.default_story_template_id || settings?.default_template_id);
  const { data: template } = templateId
    ? await supabase
      .from("post_templates")
      .select("*")
      .eq("id", templateId)
      .eq("format", opts.withFollowCta ? "reels" : "stories")
      .maybeSingle()
    : { data: null };

  let photoImg: HTMLImageElement | null = null;
  if (item.original_image_url) {
    // 1) tenta via proxy weserv (resolve CORS e hotlink)
    try { photoImg = await loadImage(proxify(item.original_image_url, 1080, 1920)); } catch {}
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

  // ===== Foto fullscreen (cover) =====
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
