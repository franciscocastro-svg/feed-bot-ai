export const EDITORIAL_CAROUSEL_WIDTH = 1080;
export const EDITORIAL_CAROUSEL_HEIGHT = 1350;

function clean(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

export function normalizeEditorialCarouselSlide(slide, index, total) {
  const role = index === 0 ? "cover" : index === total - 1 ? "cta" : "content";
  const title = clean(slide?.title, 90);
  const body = clean(slide?.body, 260);
  const emphasis = Array.isArray(slide?.emphasis)
    ? slide.emphasis.map((entry) => clean(entry, 50)).filter(Boolean).slice(0, 3)
    : [];
  return {
    ...slide,
    position: index + 1,
    role,
    title,
    body,
    emphasis,
    image_mode: role !== "cta" && slide?.image_mode === "stock" ? "stock" : "text",
  };
}

function coverImage(ctx, image, x, y, width, height) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = width / scale;
  const sourceHeight = height / scale;
  const sourceX = Math.max(0, (image.width - sourceWidth) / 2);
  const sourceY = Math.max(0, (image.height - sourceHeight) / 2);
  ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
}

function wrapWords(ctx, text, maxWidth) {
  const words = clean(text, 400).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = [];
  for (const word of words) {
    const candidate = [...line, word].join(" ");
    if (line.length > 0 && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = [word];
    } else {
      line.push(word);
    }
  }
  if (line.length) lines.push(line);
  return lines;
}

function emphasizedWords(emphasis) {
  return new Set(
    emphasis
      .flatMap((phrase) => phrase.toLocaleLowerCase("pt-BR").split(/\s+/))
      .map((word) => word.replace(/[^\p{L}\p{N}]/gu, ""))
      .filter(Boolean),
  );
}

function drawWordLines(ctx, {
  text,
  x,
  y,
  maxWidth,
  fontSize,
  lineHeight,
  maxLines,
  emphasis = [],
  color = "#121212",
  regularWeight = 500,
  boldWeight = 800,
}) {
  ctx.font = `${regularWeight} ${fontSize}px Inter, Arial, sans-serif`;
  const lines = wrapWords(ctx, text, maxWidth).slice(0, maxLines);
  const boldWords = emphasizedWords(emphasis);
  ctx.fillStyle = color;
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    let cursorX = x;
    for (const word of lines[lineIndex]) {
      const normalized = word.toLocaleLowerCase("pt-BR").replace(/[^\p{L}\p{N}]/gu, "");
      const isBold = boldWords.has(normalized);
      ctx.font = `${isBold ? boldWeight : regularWeight} ${fontSize}px ${isBold ? "InterBold, Inter" : "Inter"}, Arial, sans-serif`;
      ctx.fillText(word, cursorX, y + lineIndex * lineHeight);
      cursorX += ctx.measureText(`${word} `).width;
    }
  }
  return y + lines.length * lineHeight;
}

function drawBrandHeader(ctx, { handle, logo, accentColor, position, total }) {
  const safeHandle = clean(handle, 80).replace(/^@/, "");
  if (logo) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(76, 70, 34, 0, Math.PI * 2);
    ctx.clip();
    coverImage(ctx, logo, 42, 36, 68, 68);
    ctx.restore();
  } else {
    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.arc(76, 70, 34, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#141414";
  ctx.font = "800 25px InterBold, Inter, Arial, sans-serif";
  ctx.fillText(safeHandle ? `@${safeHandle}` : "Flux & Feed", 126, 78);
  ctx.fillStyle = "#7A7A7A";
  ctx.font = "600 21px Inter, Arial, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText(`${position}/${total}`, 1010, 76);
  ctx.textAlign = "left";
}

export function drawEditorialCarouselSlide(ctx, {
  slide,
  total,
  handle,
  logo = null,
  image = null,
  accentColor = "#D92DA8",
}) {
  const width = EDITORIAL_CAROUSEL_WIDTH;
  const height = EDITORIAL_CAROUSEL_HEIGHT;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);
  drawBrandHeader(ctx, { handle, logo, accentColor, position: slide.position, total });

  ctx.fillStyle = accentColor;
  ctx.fillRect(48, 126, width - 96, 8);

  const hasImage = Boolean(image && slide.image_mode === "stock" && slide.role !== "cta");
  const titleSize = slide.role === "cover" ? 67 : slide.role === "cta" ? 62 : 54;
  const titleLines = slide.role === "cover" ? 4 : 3;
  let cursorY = drawWordLines(ctx, {
    text: slide.title,
    x: 58,
    y: 225,
    maxWidth: width - 116,
    fontSize: titleSize,
    lineHeight: Math.round(titleSize * 1.13),
    maxLines: titleLines,
    emphasis: slide.emphasis,
    regularWeight: slide.role === "cover" ? 700 : 600,
    boldWeight: 900,
  });

  if (slide.body) {
    cursorY = drawWordLines(ctx, {
      text: slide.body,
      x: 58,
      y: cursorY + 46,
      maxWidth: width - 116,
      fontSize: slide.role === "cta" ? 42 : 37,
      lineHeight: slide.role === "cta" ? 55 : 49,
      maxLines: hasImage ? 5 : 9,
      emphasis: slide.emphasis,
      color: "#303030",
      regularWeight: 500,
      boldWeight: 800,
    });
  }

  if (hasImage) {
    const imageY = Math.max(760, Math.min(860, cursorY + 25));
    const imageHeight = height - imageY - 82;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(48, imageY, width - 96, imageHeight, 26);
    ctx.clip();
    coverImage(ctx, image, 48, imageY, width - 96, imageHeight);
    ctx.restore();
  } else {
    ctx.fillStyle = accentColor;
    ctx.globalAlpha = 0.08;
    ctx.beginPath();
    ctx.arc(910, 1110, 230, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.fillStyle = "#6A6A6A";
  ctx.font = "500 20px Inter, Arial, sans-serif";
  ctx.fillText(slide.role === "cta" ? "Salve para consultar depois" : "Deslize para continuar →", 58, 1312);
}
