const gradient = (angle, ...stops) => ({
  angle,
  stops: stops.map(([color, offset]) => ({ color, offset })),
});

// Canonical backgrounds for the preset library. This file is shared by the
// dashboard, Edge Function and VPS worker so previews match published art.
export const PRESET_GRADIENTS = {
  news_minimal: gradient(180, ["#FFFFFF", 0], ["#FFFFFF", 0.6], ["#18181B", 0.6], ["#18181B", 1]),
  news_breaking: gradient(180, ["#DC2626", 0], ["#DC2626", 0.18], ["#0A0A0A", 0.18], ["#0A0A0A", 1]),
  news_classic: gradient(180, ["#F5F1E8", 0], ["#F5F1E8", 0.3], ["#1F2937", 0.3], ["#1F2937", 1]),
  news_yellow: gradient(180, ["#FFD400", 0], ["#FFD400", 0.22], ["#FFFFFF", 0.22], ["#FFFFFF", 1]),
  econ_bull: gradient(180, ["#064E3B", 0], ["#064E3B", 0.35], ["#047857", 0.35], ["#047857", 1]),
  econ_bear: gradient(180, ["#0A0A0A", 0], ["#0A0A0A", 0.35], ["#7F1D1D", 0.35], ["#7F1D1D", 1]),
  econ_corp: gradient(180, ["#0F172A", 0], ["#0F172A", 0.4], ["#1E3A8A", 0.4], ["#1E3A8A", 1]),
  econ_fintech: gradient(180, ["#FAFAFA", 0], ["#FAFAFA", 0.5], ["#10B981", 0.5], ["#10B981", 1]),
  soc_stadium: gradient(180, ["#000000", 0], ["#000000", 0.3], ["#16A34A", 0.3], ["#16A34A", 1]),
  soc_brasil: gradient(180, ["#FACC15", 0], ["#FACC15", 0.4], ["#15803D", 0.4], ["#15803D", 1]),
  soc_derby: gradient(90, ["#DC2626", 0], ["#DC2626", 0.5], ["#0A0A0A", 0.5], ["#0A0A0A", 1]),
  soc_champ: gradient(180, ["#1E1B4B", 0], ["#1E1B4B", 1]),
  gos_pink: gradient(180, ["#FBCFE8", 0], ["#FBCFE8", 0.4], ["#EC4899", 0.4], ["#EC4899", 1]),
  gos_tab: gradient(180, ["#FDE047", 0], ["#FDE047", 0.25], ["#0A0A0A", 0.25], ["#0A0A0A", 1]),
  gos_carpet: gradient(180, ["#7F1D1D", 0], ["#7F1D1D", 0.4], ["#FBBF24", 0.4], ["#FBBF24", 1]),
  gos_pastel: gradient(180, ["#DDD6FE", 0], ["#DDD6FE", 0.5], ["#FBCFE8", 0.5], ["#FBCFE8", 1]),
  law_classic: gradient(180, ["#0F172A", 0], ["#0F172A", 0.45], ["#1E3A8A", 0.45], ["#1E3A8A", 1]),
  law_serif: gradient(180, ["#F5F1E8", 0], ["#F5F1E8", 0.55], ["#1F2937", 0.55], ["#1F2937", 1]),
  law_premium: gradient(180, ["#FEF3C7", 0], ["#FEF3C7", 0.35], ["#7F1D1D", 0.35], ["#7F1D1D", 1]),
  law_modern: gradient(180, ["#FFFFFF", 0], ["#FFFFFF", 0.5], ["#374151", 0.5], ["#374151", 1]),
  med_clean: gradient(180, ["#FFFFFF", 0], ["#FFFFFF", 0.55], ["#0891B2", 0.55], ["#0891B2", 1]),
  med_alert: gradient(180, ["#F97316", 0], ["#F97316", 0.25], ["#FFFFFF", 0.25], ["#FFFFFF", 1]),
  med_research: gradient(180, ["#082F49", 0], ["#082F49", 0.4], ["#0EA5E9", 0.4], ["#0EA5E9", 1]),
  med_wellness: gradient(180, ["#F0FDF4", 0], ["#F0FDF4", 0.5], ["#15803D", 0.5], ["#15803D", 1]),
  tec_dark: gradient(135, ["#0A0A0A", 0], ["#7C3AED", 1]),
  tec_ai: gradient(135, ["#6366F1", 0], ["#06B6D4", 1]),
  tec_startup: gradient(180, ["#FFFFFF", 0], ["#FFFFFF", 0.6], ["#06B6D4", 0.6], ["#06B6D4", 1]),
  tec_cyber: gradient(135, ["#831843", 0], ["#06B6D4", 1]),
  rel_golden: gradient(180, ["#451A03", 0], ["#451A03", 0.45], ["#FBBF24", 0.45], ["#FBBF24", 1]),
  rel_peace: gradient(180, ["#DBEAFE", 0], ["#DBEAFE", 0.5], ["#1E40AF", 0.5], ["#1E40AF", 1]),
  rel_minimal: gradient(180, ["#FAF7F0", 0], ["#FAF7F0", 1]),
  rel_revival: gradient(180, ["#4C1D95", 0], ["#4C1D95", 0.5], ["#FBBF24", 0.5], ["#FBBF24", 1]),
};

const FALLBACK_GRADIENT = PRESET_GRADIENTS.news_minimal;

function safeColor(value, fallback = "#18181B") {
  return typeof value === "string" && /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback;
}

export function normalizeTemplateGradient(value) {
  if (!value || typeof value !== "object" || !Array.isArray(value.stops)) return null;
  const stops = value.stops
    .map((stop) => ({
      color: safeColor(stop?.color),
      offset: Math.max(0, Math.min(1, Number(stop?.offset))),
    }))
    .filter((stop) => Number.isFinite(stop.offset));
  if (!stops.length) return null;
  const angle = Number(value.angle);
  return { angle: Number.isFinite(angle) ? angle : 180, stops };
}

export function resolveTemplateGradient(presetKey, config) {
  return normalizeTemplateGradient(config?.backgroundGradient)
    || PRESET_GRADIENTS[presetKey]
    || FALLBACK_GRADIENT;
}

export function templateGradientCss(presetKey, config) {
  const value = resolveTemplateGradient(presetKey, config);
  const stops = value.stops.map((stop) => `${stop.color} ${Math.round(stop.offset * 10000) / 100}%`).join(", ");
  return `linear-gradient(${value.angle}deg, ${stops})`;
}

function gradientVector(angle, width, height) {
  const radians = (angle * Math.PI) / 180;
  const dx = Math.sin(radians);
  const dy = -Math.cos(radians);
  const length = Math.abs(dx) * width + Math.abs(dy) * height;
  const cx = width / 2;
  const cy = height / 2;
  return [cx - dx * length / 2, cy - dy * length / 2, cx + dx * length / 2, cy + dy * length / 2];
}

export function drawTemplateGradient(ctx, presetKey, config, width, height) {
  const value = resolveTemplateGradient(presetKey, config);
  const [x1, y1, x2, y2] = gradientVector(value.angle, width, height);
  const fill = ctx.createLinearGradient(x1, y1, x2, y2);
  value.stops.forEach((stop) => fill.addColorStop(stop.offset, stop.color));
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, width, height);
}

export function templateGradientSvg(presetKey, config, width, height, id = "templateBg") {
  const value = resolveTemplateGradient(presetKey, config);
  const [x1, y1, x2, y2] = gradientVector(value.angle, width, height);
  const stops = value.stops
    .map((stop) => `<stop offset="${stop.offset * 100}%" stop-color="${stop.color}"/>`)
    .join("");
  return `<defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops}</linearGradient></defs><rect width="${width}" height="${height}" fill="url(#${id})"/>`;
}
