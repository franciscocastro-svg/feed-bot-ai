function finitePositive(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function coverSourceRect(imageWidth, imageHeight, boxWidth, boxHeight) {
  const iw = finitePositive(imageWidth, 1);
  const ih = finitePositive(imageHeight, 1);
  const bw = finitePositive(boxWidth, 1);
  const bh = finitePositive(boxHeight, 1);
  const ratio = Math.max(bw / iw, bh / ih);
  const width = bw / ratio;
  const height = bh / ratio;
  return {
    x: Math.max(0, (iw - width) / 2),
    y: Math.max(0, (ih - height) / 2),
    width,
    height,
  };
}

export function containDestinationRect(imageWidth, imageHeight, x, y, boxWidth, boxHeight) {
  const iw = finitePositive(imageWidth, 1);
  const ih = finitePositive(imageHeight, 1);
  const bx = Number.isFinite(Number(x)) ? Number(x) : 0;
  const by = Number.isFinite(Number(y)) ? Number(y) : 0;
  const bw = finitePositive(boxWidth, 1);
  const bh = finitePositive(boxHeight, 1);
  const ratio = Math.min(bw / iw, bh / ih);
  const width = iw * ratio;
  const height = ih * ratio;
  return {
    x: bx + (bw - width) / 2,
    y: by + (bh - height) / 2,
    width,
    height,
  };
}

function safeSvgId(value) {
  return String(value || "smart-frame").replace(/[^a-z0-9_-]/gi, "-");
}

export function protectedPhotoSvg({
  href,
  x = 0,
  y = 0,
  width,
  height,
  id = "smart-frame",
  blur = 28,
  backgroundOpacity = 0.72,
  shadeOpacity = 0.16,
}) {
  if (!href) return "";
  const frameId = safeSvgId(id);
  const w = finitePositive(width, 1);
  const h = finitePositive(height, 1);
  const px = Number.isFinite(Number(x)) ? Number(x) : 0;
  const py = Number.isFinite(Number(y)) ? Number(y) : 0;
  const blurAmount = Math.max(0, Math.min(80, Number(blur) || 0));
  const bgOpacity = Math.max(0, Math.min(1, Number(backgroundOpacity) || 0));
  const shade = Math.max(0, Math.min(0.8, Number(shadeOpacity) || 0));

  return `<defs>
    <clipPath id="${frameId}-clip"><rect x="${px}" y="${py}" width="${w}" height="${h}"/></clipPath>
    <filter id="${frameId}-blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${blurAmount}"/></filter>
  </defs>
  <g clip-path="url(#${frameId}-clip)">
    <rect x="${px}" y="${py}" width="${w}" height="${h}" fill="#111111"/>
    <image href="${href}" x="${px}" y="${py}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice" filter="url(#${frameId}-blur)" opacity="${bgOpacity}"/>
    <rect x="${px}" y="${py}" width="${w}" height="${h}" fill="#000000" fill-opacity="${shade}"/>
    <image href="${href}" x="${px}" y="${py}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>
  </g>`;
}
