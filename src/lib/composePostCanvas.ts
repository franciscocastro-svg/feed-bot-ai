// Renderiza o template do post (1080x1080) no canvas e retorna PNG blob.
// Mesma lógica visual do PostCanvasEditor — usado em auto-processamento.
import { supabase } from "@/integrations/supabase/client";

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

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
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

export async function composeAndUploadPost(item: any): Promise<string> {
  const { data: settings } = await supabase
    .from("user_settings")
    .select("brand_handle, brand_name, brand_logo_url")
    .maybeSingle();

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
    const ratio = Math.max(SIZE / photoImg.width, ph / photoImg.height);
    const sw = SIZE / ratio, sh = ph / ratio;
    const sx = (photoImg.width - sw) / 2, sy = (photoImg.height - sh) / 2;
    ctx.drawImage(photoImg, sx, sy, sw, sh, 0, py, SIZE, ph);
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
