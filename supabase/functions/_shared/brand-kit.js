export const BRAND_KIT_STYLES = ["editorial", "impacto", "minimalista", "premium", "tipografico"];
export const BRAND_KIT_FONTS = ["Inter", "Montserrat", "Poppins", "Lora"];

const HEX = /^#[0-9a-f]{6}$/i;

export function safeBrandColor(value, fallback) {
  return typeof value === "string" && HEX.test(value) ? value.toUpperCase() : fallback;
}

export function safeBrandFont(value, fallback = "Inter") {
  return BRAND_KIT_FONTS.includes(value) ? value : fallback;
}

export function normalizeBrandKit(value = {}) {
  return {
    brandName: String(value.brandName || value.brand_name || "").trim().slice(0, 100),
    brandHandle: String(value.brandHandle || value.brand_handle || "").trim().replace(/^@/, "").slice(0, 80),
    logoPrimaryUrl: String(value.logoPrimaryUrl || value.brand_logo_url || "").trim() || null,
    logoLightUrl: String(value.logoLightUrl || value.logo_light_url || "").trim() || null,
    logoDarkUrl: String(value.logoDarkUrl || value.logo_dark_url || "").trim() || null,
    primaryColor: safeBrandColor(value.primaryColor || value.primary_color, "#18111B"),
    secondaryColor: safeBrandColor(value.secondaryColor || value.secondary_color, "#34132D"),
    accentColor: safeBrandColor(value.accentColor || value.accent_color, "#FACC15"),
    backgroundColor: safeBrandColor(value.backgroundColor || value.background_color, "#0A0A0A"),
    textColor: safeBrandColor(value.textColor || value.text_color, "#FFFFFF"),
    headingFont: safeBrandFont(value.headingFont || value.heading_font, "Inter"),
    bodyFont: safeBrandFont(value.bodyFont || value.body_font, "Inter"),
    visualStyle: BRAND_KIT_STYLES.includes(value.visualStyle || value.visual_style)
      ? (value.visualStyle || value.visual_style)
      : "editorial",
    version: Math.max(1, Number(value.version || 1) || 1),
  };
}

function rgb(hex) {
  const clean = safeBrandColor(hex, "#000000").slice(1);
  return [0, 2, 4].map(index => Number.parseInt(clean.slice(index, index + 2), 16));
}

function luminance(hex) {
  const channels = rgb(hex).map(channel => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(first, second) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

export function readableTextColor(background, preferred = "#FFFFFF") {
  const safeBackground = safeBrandColor(background, "#000000");
  const safePreferred = safeBrandColor(preferred, "#FFFFFF");
  if (contrastRatio(safeBackground, safePreferred) >= 4.5) return safePreferred;
  return contrastRatio(safeBackground, "#FFFFFF") >= contrastRatio(safeBackground, "#000000")
    ? "#FFFFFF"
    : "#000000";
}

export function brandFontStack(font, bold = false) {
  const family = safeBrandFont(font);
  if (family === "Inter") return bold ? "InterBold, Inter, sans-serif" : "Inter, sans-serif";
  return bold
    ? `${JSON.stringify(`${family}Bold`)}, ${JSON.stringify(family)}, InterBold, Inter, sans-serif`
    : `${JSON.stringify(family)}, Inter, sans-serif`;
}

export function applyBrandKitToTemplateConfig(config = {}, rawKit = {}) {
  const kit = normalizeBrandKit(rawKit);
  const titleColor = readableTextColor(kit.primaryColor, kit.textColor);
  const badgeColor = readableTextColor(kit.accentColor, kit.backgroundColor);
  const baseHandleX = Number(config.handleX || 60);
  const handleSize = Number(config.handleSize || 22);
  const logoSize = Math.max(44, Math.min(84, Math.round(handleSize * 2.35)));
  const logoUrl = titleColor === "#FFFFFF"
    ? (kit.logoLightUrl || kit.logoPrimaryUrl || kit.logoDarkUrl)
    : (kit.logoDarkUrl || kit.logoPrimaryUrl || kit.logoLightUrl);

  return {
    ...config,
    titleColor,
    subtitleColor: titleColor,
    handleColor: titleColor,
    badgeBg: kit.accentColor,
    badgeColor,
    backgroundGradient: {
      angle: 135,
      stops: [
        { color: kit.primaryColor, position: 0 },
        { color: kit.secondaryColor, position: 0.7 },
        { color: kit.backgroundColor, position: 1 },
      ],
    },
    titleFontFamily: kit.headingFont,
    subtitleFontFamily: kit.bodyFont,
    handleFontFamily: kit.headingFont,
    badgeFontFamily: kit.headingFont,
    showBrandLogo: Boolean(logoUrl),
    brandLogoUrl: logoUrl,
    brandLogoX: baseHandleX,
    brandLogoY: Math.max(20, Number(config.handleY || 90) - logoSize),
    brandLogoSize: logoSize,
    handleX: logoUrl ? Math.min(900, baseHandleX + logoSize + 18) : baseHandleX,
    brandKitVersion: kit.version,
    brandKitStyle: kit.visualStyle,
  };
}
