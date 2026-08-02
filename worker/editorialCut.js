export const EDITORIAL_WIDTH = 1080;
export const EDITORIAL_HEIGHT = 1350;
export const EDITORIAL_REELS_HEIGHT = 1920;

export function editorialDimensions(format = "feed_portrait") {
  return format === "reels"
    ? { width: EDITORIAL_WIDTH, height: EDITORIAL_REELS_HEIGHT, format: "reels" }
    : { width: EDITORIAL_WIDTH, height: EDITORIAL_HEIGHT, format: "feed_portrait" };
}

export function editorialLayout(width = EDITORIAL_WIDTH, height = EDITORIAL_HEIGHT) {
  const scale = width / EDITORIAL_WIDTH;
  const reels = height / width > 1.5;
  return {
    width,
    height,
    scale,
    safeX: Math.round(56 * scale),
    avatarX: Math.round(76 * scale),
    avatarY: Math.round((reels ? 140 : 70) * scale),
    avatarSize: Math.round(72 * scale),
    accountX: Math.round(174 * scale),
    accountNameY: Math.round((reels ? 146 : 76) * scale),
    accountHandleY: Math.round((reels ? 183 : 113) * scale),
    titleY: Math.round((reels ? 270 : 185) * scale),
    textWidth: Math.round(968 * scale),
    media: {
      x: Math.round(60 * scale),
      y: Math.round((reels ? 540 : 430) * scale),
      width: Math.round(960 * scale),
      height: Math.round((reels ? 1160 : 800) * scale),
    },
    footerY: Math.round((reels ? 1760 : 1272) * scale),
  };
}

const withoutControlCharacters = (value) => Array.from(String(value || ""))
  .map((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127 ? " " : character;
  })
  .join("");

const cleanText = (value, limit) => withoutControlCharacters(value)
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, limit);

const normalizeEvidence = (value) => cleanText(value, 2000)
  .toLocaleLowerCase("pt-BR")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

function transcriptExcerpt(transcript, limit = 240) {
  const cleaned = cleanText(transcript, 5000);
  if (!cleaned) return "O conteúdo deste trecho precisa ser conferido antes da publicação.";
  const excerpt = cleaned.slice(0, limit);
  return excerpt.length < cleaned.length ? `${excerpt.replace(/[,;:]?\s+\S*$/, "")}…` : excerpt;
}

function numbersSupported(text, transcript) {
  const claims = cleanText(text, 1000).match(/\b\d+(?:[.,]\d+)?\b/g) || [];
  if (!claims.length) return true;
  const source = cleanText(transcript, 10000);
  return claims.every((claim) => source.includes(claim));
}

export function neutralEditorialDraft(transcript, fallbackTitle = "O ponto principal deste trecho") {
  return {
    title: cleanText(fallbackTitle, 100) || "O ponto principal deste trecho",
    comment: transcriptExcerpt(transcript),
    confidence: 0,
    reviewRequired: true,
    evidence: [],
    safetyReason: "insufficient_confirmed_context",
  };
}

export function normalizeEditorialDraft(raw, transcript, fallbackTitle) {
  const fallback = neutralEditorialDraft(transcript, fallbackTitle);
  const title = cleanText(raw?.title, 140);
  const comment = cleanText(raw?.comment, 600);
  const confidence = Math.max(0, Math.min(1, Number(raw?.confidence) || 0));
  const source = normalizeEvidence(transcript);
  const evidence = (Array.isArray(raw?.evidence) ? raw.evidence : [])
    .map((item) => cleanText(item, 180))
    .filter(Boolean);
  const evidenceConfirmed = evidence.length > 0 && evidence.every((item) => {
    const normalized = normalizeEvidence(item);
    return normalized.length >= 8 && source.includes(normalized);
  });
  const numericClaimsConfirmed = numbersSupported(`${title} ${comment}`, transcript);
  const valid = title.length >= 4
    && comment.length >= 10
    && confidence >= 0.72
    && evidenceConfirmed
    && numericClaimsConfirmed;

  if (!valid) {
    return {
      ...fallback,
      safetyReason: !numericClaimsConfirmed
        ? "unsupported_numeric_claim"
        : !evidenceConfirmed
          ? "missing_transcript_evidence"
          : "low_confidence",
    };
  }

  return {
    title,
    comment,
    confidence,
    reviewRequired: Boolean(raw?.review_required),
    evidence,
    safetyReason: null,
  };
}

export function buildEditorialAnalysisPrompt({ transcript, visualContext, language, tone }) {
  return `Você é um editor factual. Crie o texto de um Corte Editorial usando a TRANSCRIÇÃO como fonte principal.

TRANSCRIÇÃO:
${cleanText(transcript, 12000)}

CONTEXTO VISUAL GENÉRICO (apenas complemento; nunca identifica pessoas):
${cleanText(visualContext, 1000) || "não disponível"}

Idioma: ${cleanText(language, 40) || "português do Brasil"}
Tom: ${cleanText(tone, 160) || "claro, natural e informativo"}

Regras obrigatórias:
- não invente nomes, fatos, datas, números ou contexto;
- não identifique uma pessoa pela aparência;
- só use nome, data ou número presente na transcrição;
- título curto, sem sensacionalismo;
- comentário entre 1 e 3 frases;
- evidence deve conter de 1 a 3 trechos LITERAIS curtos da transcrição que sustentam título e comentário;
- se faltar contexto ou houver dúvida, use título neutro e review_required=true;
- não inclua hashtags.

Retorne APENAS JSON:
{"title":"","comment":"","confidence":0.0,"review_required":true,"evidence":[""]}`;
}

function safeHex(value, fallback) {
  return /^#[0-9a-f]{6}$/i.test(String(value || "")) ? String(value) : fallback;
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = cleanText(text, 800).split(" ").filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    } else {
      current = candidate;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[.,;:]?$/, "")}…`;
  }
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
  return lines.length;
}

export async function writeEditorialOverlay({
  createCanvas,
  loadImage,
  encodeCanvas,
  outputPath,
  title,
  comment,
  accountName,
  accountHandle,
  accountVerified = false,
  logoUrl,
  sourceLabel,
  format = "feed_portrait",
  config = {},
}) {
  const dimensions = editorialDimensions(format);
  const layout = editorialLayout(dimensions.width, dimensions.height);
  const canvas = createCanvas(layout.width, layout.height);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, layout.width, layout.height);

  const color = safeHex(config.primary_color, "#111111");
  const accent = safeHex(config.accent_color, "#D92FA5");
  const font = cleanText(config.font_family, 80) || "Inter";
  const { avatarX, avatarY, avatarSize } = layout;

  let logo = null;
  if (logoUrl && typeof loadImage === "function") {
    try { logo = await loadImage(logoUrl); } catch { logo = null; }
  }
  ctx.save();
  ctx.beginPath();
  ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
  ctx.clip();
  if (logo) {
    const ratio = Math.max(avatarSize / logo.width, avatarSize / logo.height);
    const width = logo.width * ratio;
    const height = logo.height * ratio;
    ctx.drawImage(logo, avatarX + (avatarSize - width) / 2, avatarY + (avatarSize - height) / 2, width, height);
  } else {
    ctx.fillStyle = accent;
    ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = `700 34px ${font}, Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(cleanText(accountName || accountHandle, 1).toUpperCase() || "F", avatarX + avatarSize / 2, avatarY + avatarSize / 2 + 1);
  }
  ctx.restore();

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = color;
  ctx.font = `700 29px ${font}, Arial`;
  const renderedAccountName = cleanText(accountName || accountHandle, 48);
  ctx.fillText(renderedAccountName, layout.accountX, layout.accountNameY);
  if (accountVerified && renderedAccountName) {
    const nameWidth = ctx.measureText(renderedAccountName).width;
    const badgeRadius = 13 * layout.scale;
    const badgeX = Math.min(
      layout.width - layout.safeX - badgeRadius,
      layout.accountX + nameWidth + 22 * layout.scale,
    );
    const badgeY = layout.accountNameY + 15 * layout.scale;
    ctx.beginPath();
    ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
    ctx.fillStyle = "#1D9BF0";
    ctx.fill();
    ctx.beginPath();
    ctx.strokeStyle = "#FFFFFF";
    ctx.lineWidth = Math.max(2, 3 * layout.scale);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.moveTo(badgeX - 6 * layout.scale, badgeY);
    ctx.lineTo(badgeX - 1 * layout.scale, badgeY + 5 * layout.scale);
    ctx.lineTo(badgeX + 7 * layout.scale, badgeY - 6 * layout.scale);
    ctx.stroke();
  }
  ctx.fillStyle = "#6B7280";
  ctx.font = `400 22px ${font}, Arial`;
  const handle = cleanText(accountHandle, 60);
  ctx.fillText(handle ? (handle.startsWith("@") ? handle : `@${handle}`) : "", layout.accountX, layout.accountHandleY);

  ctx.fillStyle = color;
  ctx.font = `700 51px ${font}, Arial`;
  const titleLines = drawWrappedText(ctx, title, layout.safeX, layout.titleY, layout.textWidth, 58, 2);
  const commentY = layout.titleY + Math.max(2, titleLines) * 58 + 20;
  ctx.font = `400 28px ${font}, Arial`;
  drawWrappedText(ctx, comment, layout.safeX, commentY, layout.textWidth, 37, 3);

  ctx.strokeStyle = "#E5E7EB";
  ctx.lineWidth = 2;
  ctx.strokeRect(layout.media.x, layout.media.y, layout.media.width, layout.media.height);

  ctx.fillStyle = "#6B7280";
  ctx.font = `400 19px ${font}, Arial`;
  ctx.fillText("feito com Flux & Feed", layout.safeX, layout.footerY);
  ctx.textAlign = "right";
  const footer = [handle ? (handle.startsWith("@") ? handle : `@${handle}`) : "", cleanText(sourceLabel, 55)]
    .filter(Boolean)
    .join(" · ");
  ctx.fillText(footer, layout.width - layout.safeX, layout.footerY);

  const buffer = await encodeCanvas(canvas, "png");
  await import("fs").then(({ promises }) => promises.writeFile(outputPath, buffer));
  return layout;
}

export function buildEditorialVideoFilter({ duration, framing = "blur_fit", overlayInput = 1, format = "feed_portrait" }) {
  const dimensions = editorialDimensions(format);
  const { media } = editorialLayout(dimensions.width, dimensions.height);
  const safeDuration = Math.max(1, Number(duration) || 1).toFixed(3);
  const canvas = `color=c=white:s=${dimensions.width}x${dimensions.height}:r=30:d=${safeDuration}[canvas]`;
  let mediaChain;

  if (framing === "contain") {
    mediaChain = `[0:v]scale=w='min(iw,${media.width})':h='min(ih,${media.height})':force_original_aspect_ratio=decrease,setsar=1[media]`;
  } else {
    const foregroundWidth = framing === "smart_crop" ? `min(iw*2,${media.width})` : `min(iw,${media.width})`;
    const foregroundHeight = framing === "smart_crop" ? `min(ih*2,${media.height})` : `min(ih,${media.height})`;
    mediaChain = `[0:v]split=2[bgsrc][fgsrc];[bgsrc]scale=${media.width}:${media.height}:force_original_aspect_ratio=increase,crop=${media.width}:${media.height},gblur=sigma=28,setsar=1[bg];[fgsrc]scale=w='${foregroundWidth}':h='${foregroundHeight}':force_original_aspect_ratio=decrease,setsar=1[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2[media]`;
  }

  const mediaX = framing === "contain" ? `${media.x}+(${media.width}-w)/2` : String(media.x);
  const mediaY = framing === "contain" ? `${media.y}+(${media.height}-h)/2` : String(media.y);
  return `${canvas};${mediaChain};[canvas][media]overlay=${mediaX}:${mediaY}:shortest=1[composed];[composed][${overlayInput}:v]overlay=0:0:format=auto[vbase]`;
}
