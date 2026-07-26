export const EDITORIAL_CAROUSEL_WIDTH = 1080;
export const EDITORIAL_CAROUSEL_HEIGHT = 1350;

const MAX_TITLE_LENGTH = 72;
const MAX_BODY_LENGTH = 190;

function clean(value, maxLength) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function normalizedWord(value) {
  return String(value || "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function validEmphasis(value, title, body) {
  if (!Array.isArray(value)) return [];
  const publicText = `${title}\n${body}`.toLocaleLowerCase("pt-BR");
  const seen = new Set();
  return value
    .map((entry) => clean(entry, 50))
    .filter((entry) => {
      const key = entry.toLocaleLowerCase("pt-BR");
      if (!entry || seen.has(key) || !publicText.includes(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 3);
}

export function normalizeEditorialCarouselSlide(slide, index, total) {
  const role = index === 0 ? "cover" : index === total - 1 ? "cta" : "content";
  const title = clean(slide?.title, MAX_TITLE_LENGTH);
  const body = clean(slide?.body, MAX_BODY_LENGTH);
  return {
    ...slide,
    position: index + 1,
    role,
    title,
    body,
    emphasis: validEmphasis(slide?.emphasis, title, body),
    image_mode: role === "cover" ? "stock" : "text",
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

function setWordFont(ctx, { bold, fontSize, regularWeight, boldWeight }) {
  const weight = bold ? boldWeight : regularWeight;
  const family = bold ? "InterBold, Inter, Arial, sans-serif" : "Inter, Arial, sans-serif";
  ctx.font = `${weight} ${fontSize}px ${family}`;
}

function wordsWithEmphasis(text, emphasis) {
  const words = clean(text, 420).split(/\s+/).filter(Boolean);
  const normalizedWords = words.map(normalizedWord);
  const boldIndexes = new Set();

  for (const phrase of emphasis) {
    const phraseWords = clean(phrase, 50).split(/\s+/).map(normalizedWord).filter(Boolean);
    if (!phraseWords.length) continue;
    for (let index = 0; index <= normalizedWords.length - phraseWords.length; index += 1) {
      const matches = phraseWords.every((word, offset) => normalizedWords[index + offset] === word);
      if (!matches) continue;
      for (let offset = 0; offset < phraseWords.length; offset += 1) {
        boldIndexes.add(index + offset);
      }
    }
  }

  return words.map((word, index) => ({ word, bold: boldIndexes.has(index) }));
}

function layoutWordLines(ctx, {
  text,
  maxWidth,
  fontSize,
  emphasis,
  regularWeight,
  boldWeight,
}) {
  const tokens = wordsWithEmphasis(text, emphasis);
  const lines = [];
  let line = [];
  let lineWidth = 0;

  for (const token of tokens) {
    setWordFont(ctx, { bold: token.bold, fontSize, regularWeight, boldWeight });
    const tokenWidth = ctx.measureText(token.word).width;
    const spaceWidth = line.length ? ctx.measureText(" ").width : 0;
    if (line.length && lineWidth + spaceWidth + tokenWidth > maxWidth) {
      lines.push(line);
      line = [];
      lineWidth = 0;
    }
    const leadingSpace = line.length ? spaceWidth : 0;
    line.push({ ...token, leadingSpace });
    lineWidth += leadingSpace + tokenWidth;
  }
  if (line.length) lines.push(line);
  return lines;
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
  color = "#151515",
  regularWeight = 500,
  boldWeight = 800,
}) {
  const lines = layoutWordLines(ctx, {
    text,
    maxWidth,
    fontSize,
    emphasis,
    regularWeight,
    boldWeight,
  }).slice(0, maxLines);
  ctx.fillStyle = color;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    let cursorX = x;
    for (const token of lines[lineIndex]) {
      setWordFont(ctx, { bold: token.bold, fontSize, regularWeight, boldWeight });
      cursorX += token.leadingSpace;
      ctx.fillText(token.word, cursorX, y + lineIndex * lineHeight);
      cursorX += ctx.measureText(token.word).width;
    }
  }

  return {
    lineCount: lines.length,
    nextY: y + lines.length * lineHeight,
  };
}

function editorialParagraphs(text) {
  const normalized = clean(text, MAX_BODY_LENGTH);
  if (!normalized) return [];
  const sentences = normalized.match(/[^.!?]+[.!?]?/g)?.map((entry) => entry.trim()).filter(Boolean) || [];
  if (sentences.length <= 1) return [normalized];
  if (sentences.length <= 3) return sentences;
  return [
    sentences[0],
    sentences[1],
    sentences.slice(2).join(" "),
  ];
}

function drawParagraphs(ctx, {
  text,
  x,
  y,
  maxWidth,
  fontSize,
  lineHeight,
  maxLines,
  emphasis,
  color,
  regularWeight,
  boldWeight,
  paragraphGap,
}) {
  let cursorY = y;
  let remainingLines = maxLines;
  for (const paragraph of editorialParagraphs(text)) {
    if (remainingLines <= 0) break;
    const result = drawWordLines(ctx, {
      text: paragraph,
      x,
      y: cursorY,
      maxWidth,
      fontSize,
      lineHeight,
      maxLines: remainingLines,
      emphasis,
      color,
      regularWeight,
      boldWeight,
    });
    remainingLines -= result.lineCount;
    cursorY = result.nextY + paragraphGap;
  }
  return cursorY - paragraphGap;
}

function drawCounter(ctx, position, total) {
  const label = `${position}/${total}`;
  ctx.font = "700 22px InterBold, Inter, Arial, sans-serif";
  const width = Math.max(78, ctx.measureText(label).width + 34);
  const x = EDITORIAL_CAROUSEL_WIDTH - width - 48;
  ctx.fillStyle = "#EFEFEF";
  ctx.beginPath();
  ctx.roundRect(x, 46, width, 50, 25);
  ctx.fill();
  ctx.fillStyle = "#555555";
  ctx.textAlign = "center";
  ctx.fillText(label, x + width / 2, 79);
  ctx.textAlign = "left";
}

function drawBrandHeader(ctx, {
  brandName,
  handle,
  logo,
  verifiedBadge,
  accentColor,
  centerY,
  position,
  total,
}) {
  const safeHandle = clean(handle, 60).replace(/^@/, "");
  const safeBrandName = clean(brandName, 48) || safeHandle || "Flux & Feed";
  const avatarX = 78;
  const avatarY = centerY;
  const avatarRadius = 36;

  if (logo) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
    ctx.clip();
    coverImage(ctx, logo, avatarX - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
    ctx.restore();
  } else {
    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.arc(avatarX, avatarY, avatarRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#FFFFFF";
    ctx.font = "800 30px InterBold, Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(safeBrandName.slice(0, 1).toLocaleUpperCase("pt-BR"), avatarX, avatarY + 10);
    ctx.textAlign = "left";
  }

  ctx.fillStyle = "#111111";
  ctx.font = "800 29px InterBold, Inter, Arial, sans-serif";
  ctx.fillText(safeBrandName, 132, centerY - 5);
  const brandWidth = ctx.measureText(safeBrandName).width;
  if (verifiedBadge) {
    ctx.drawImage(verifiedBadge, Math.min(906, 140 + brandWidth), centerY - 35, 40, 40);
  } else {
    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.arc(Math.min(920, 148 + brandWidth), centerY - 14, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#707070";
  ctx.font = "500 23px Inter, Arial, sans-serif";
  ctx.fillText(safeHandle ? `@${safeHandle}` : "Conteúdo editorial", 132, centerY + 30);
  drawCounter(ctx, position, total);
}

function drawFooter(ctx, { handle, role }) {
  const safeHandle = clean(handle, 60).replace(/^@/, "");
  ctx.fillStyle = "#777777";
  ctx.font = "500 20px Inter, Arial, sans-serif";
  ctx.fillText("feito com Flux & Feed", 58, 1308);
  ctx.textAlign = "right";
  ctx.fillText(
    role === "cta" ? "Comente e siga para mais" : safeHandle ? `@${safeHandle}  ·  deslize →` : "deslize →",
    1022,
    1308,
  );
  ctx.textAlign = "left";
}

export function drawEditorialCarouselSlide(ctx, {
  slide,
  total,
  brandName = "",
  handle,
  logo = null,
  verifiedBadge = null,
  image = null,
  accentColor = "#D92DA8",
}) {
  const width = EDITORIAL_CAROUSEL_WIDTH;
  const height = EDITORIAL_CAROUSEL_HEIGHT;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, width, height);
  const hasImage = Boolean(image && slide.image_mode === "stock" && slide.role !== "cta");
  const headerCenterY = hasImage ? 238 : 360;
  drawBrandHeader(ctx, {
    brandName,
    handle,
    logo,
    verifiedBadge,
    accentColor,
    centerY: headerCenterY,
    position: slide.position,
    total,
  });

  const titleSize = slide.role === "cover" ? 62 : slide.role === "cta" ? 57 : 50;
  const titleLineHeight = Math.round(titleSize * 1.16);
  const contentStartY = hasImage ? 382 : slide.role === "cta" ? 560 : 540;
  let cursorY = drawWordLines(ctx, {
    text: slide.title,
    x: 58,
    y: contentStartY,
    maxWidth: width - 116,
    fontSize: titleSize,
    lineHeight: titleLineHeight,
    maxLines: 3,
    emphasis: slide.emphasis,
    regularWeight: slide.role === "cover" ? 600 : 500,
    boldWeight: 900,
  }).nextY;

  if (slide.body) {
    cursorY = drawParagraphs(ctx, {
      text: slide.body,
      x: 58,
      y: cursorY + 34,
      maxWidth: width - 116,
      fontSize: slide.role === "cta" ? 42 : 39,
      lineHeight: slide.role === "cta" ? 56 : 53,
      maxLines: hasImage ? 4 : 7,
      emphasis: slide.emphasis,
      color: "#252525",
      regularWeight: 400,
      boldWeight: 800,
      paragraphGap: 24,
    });
  }

  if (hasImage) {
    const imageY = Math.max(820, Math.min(880, cursorY + 28));
    const imageHeight = height - imageY - 100;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(58, imageY, width - 116, imageHeight, 24);
    ctx.clip();
    coverImage(ctx, image, 58, imageY, width - 116, imageHeight);
    ctx.restore();
  }

  drawFooter(ctx, { handle, role: slide.role });
}
