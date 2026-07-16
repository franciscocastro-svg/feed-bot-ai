const FEED_DEFAULTS = {
  backgroundLayer: "base",
  titleX: 60,
  titleY: 180,
  titleW: 960,
  titleSize: 56,
  titleColor: "#FFFFFF",
  titleMaxChars: 26,
  titleMaxLines: 5,
  titleAlign: "left",
  subtitleX: 60,
  subtitleY: 440,
  subtitleW: 960,
  subtitleSize: 24,
  subtitleColor: "#FFFFFF",
  subtitleMaxLines: 3,
  subtitleAlign: "left",
  showHandle: true,
  handleX: 60,
  handleY: 90,
  handleSize: 22,
  handleColor: "#FFFFFF",
  showBadge: true,
  badgeText: "LEIA A LEGENDA ->",
  badgeX: 660,
  badgeY: 990,
  badgeW: 360,
  badgeH: 60,
  badgeSize: 22,
  badgeBg: "#FFD400",
  badgeColor: "#000000",
  overlayOpacity: 0.35,
  showPhoto: true,
  photoX: 0,
  photoY: 528,
  photoW: 1080,
  photoH: 552,
};

const STORY_DEFAULTS = {
  ...FEED_DEFAULTS,
  titleY: 760,
  titleSize: 76,
  titleMaxChars: 21,
  titleMaxLines: 4,
  subtitleY: 1120,
  subtitleSize: 38,
  subtitleMaxLines: 5,
  handleY: 130,
  handleSize: 28,
  badgeText: "RESUMO",
  badgeX: 70,
  badgeY: 1550,
  badgeW: 320,
  badgeH: 64,
  badgeSize: 24,
  overlayOpacity: 0.52,
  photoY: 0,
  photoH: 1920,
};

const REEL_DEFAULTS = {
  ...FEED_DEFAULTS,
  titleY: 1040,
  titleW: 800,
  titleSize: 74,
  titleMaxChars: 19,
  subtitleY: 1380,
  subtitleW: 760,
  subtitleSize: 32,
  handleY: 130,
  handleSize: 28,
  badgeX: 70,
  badgeY: 1540,
  badgeW: 412,
  badgeH: 64,
  badgeSize: 24,
  overlayOpacity: 0.45,
  photoY: 0,
  photoH: 1920,
};

const FEED_LAYOUTS = [
  {
    name: "Editorial",
    values: { titleX: 60, titleY: 180, titleW: 960, titleSize: 56, subtitleX: 60, subtitleY: 440, subtitleW: 960, photoX: 0, photoY: 528, photoW: 1080, photoH: 552, badgeX: 660, badgeY: 990, badgeW: 360, overlayOpacity: 0 },
  },
  {
    name: "Impacto",
    values: { titleX: 70, titleY: 590, titleW: 940, titleSize: 76, titleMaxChars: 20, subtitleX: 70, subtitleY: 865, subtitleW: 900, subtitleSize: 28, handleX: 70, handleY: 90, badgeX: 70, badgeY: 160, badgeW: 300, photoX: 0, photoY: 0, photoW: 1080, photoH: 1080, overlayOpacity: 0.58 },
  },
  {
    name: "Dividido",
    values: { titleX: 60, titleY: 245, titleW: 430, titleSize: 62, titleMaxChars: 15, subtitleX: 60, subtitleY: 625, subtitleW: 430, subtitleSize: 24, handleX: 60, handleY: 90, badgeX: 60, badgeY: 900, badgeW: 360, photoX: 540, photoY: 0, photoW: 540, photoH: 1080, overlayOpacity: 0.12 },
  },
  {
    name: "Magazine",
    values: { titleX: 80, titleY: 720, titleW: 920, titleSize: 60, titleMaxChars: 25, subtitleX: 80, subtitleY: 930, subtitleW: 700, subtitleSize: 23, handleX: 80, handleY: 60, badgeX: 700, badgeY: 60, badgeW: 300, photoX: 80, photoY: 120, photoW: 920, photoH: 500, overlayOpacity: 0.18 },
  },
  {
    name: "Tipografico",
    values: { titleX: 120, titleY: 430, titleW: 840, titleSize: 88, titleMaxChars: 17, titleAlign: "center", subtitleX: 180, subtitleY: 770, subtitleW: 720, subtitleSize: 28, subtitleAlign: "center", handleX: 390, handleY: 120, badgeX: 340, badgeY: 950, badgeW: 400, photoX: 0, photoY: 0, photoW: 1080, photoH: 1080, overlayOpacity: 0.68 },
  },
];

const STORY_LAYOUTS = [
  {
    name: "Story completo",
    values: { titleX: 70, titleY: 720, titleW: 940, titleSize: 76, titleMaxChars: 21, titleMaxLines: 4, subtitleX: 70, subtitleY: 1080, subtitleW: 920, subtitleSize: 38, subtitleMaxLines: 5, photoX: 0, photoY: 0, photoW: 1080, photoH: 1920, badgeX: 70, badgeY: 1570, badgeW: 320, overlayOpacity: 0.54 },
  },
  {
    name: "Manchete",
    values: { titleX: 70, titleY: 390, titleW: 940, titleSize: 84, titleMaxChars: 19, titleMaxLines: 4, subtitleX: 70, subtitleY: 820, subtitleW: 920, subtitleSize: 38, subtitleMaxLines: 6, handleX: 70, handleY: 140, badgeX: 70, badgeY: 1510, badgeW: 360, photoX: 0, photoY: 0, photoW: 1080, photoH: 1920, overlayOpacity: 0.62 },
  },
  {
    name: "Noticia em cartão",
    values: { titleX: 70, titleY: 1020, titleW: 940, titleSize: 70, titleMaxLines: 4, subtitleX: 70, subtitleY: 1320, subtitleW: 920, subtitleSize: 36, subtitleMaxLines: 5, handleX: 70, handleY: 110, badgeX: 650, badgeY: 880, badgeW: 360, photoX: 70, photoY: 180, photoW: 940, photoH: 620, overlayOpacity: 0.14 },
  },
  {
    name: "Resumo visual",
    values: { titleX: 80, titleY: 600, titleW: 920, titleSize: 88, titleMaxChars: 17, titleMaxLines: 4, subtitleX: 80, subtitleY: 1080, subtitleW: 900, subtitleSize: 40, subtitleMaxLines: 6, handleX: 80, handleY: 150, badgeX: 80, badgeY: 1590, badgeW: 360, photoX: 0, photoY: 0, photoW: 1080, photoH: 1920, overlayOpacity: 0.66 },
  },
  {
    name: "Tipografico",
    values: { titleX: 100, titleY: 520, titleW: 880, titleSize: 98, titleMaxChars: 15, titleMaxLines: 4, titleAlign: "center", subtitleX: 140, subtitleY: 1080, subtitleW: 800, subtitleSize: 40, subtitleMaxLines: 6, subtitleAlign: "center", handleX: 390, handleY: 180, badgeX: 350, badgeY: 1580, badgeW: 380, photoX: 0, photoY: 0, photoW: 1080, photoH: 1920, overlayOpacity: 0.72 },
  },
];

const REEL_LAYOUTS = [
  {
    name: "Editorial",
    values: { titleX: 60, titleY: 1040, titleW: 960, titleSize: 74, subtitleX: 60, subtitleY: 1380, subtitleW: 900, photoX: 0, photoY: 0, photoW: 1080, photoH: 1920, badgeX: 608, badgeY: 1540, badgeW: 412, overlayOpacity: 0.48 },
  },
  {
    name: "Manchete",
    values: { titleX: 70, titleY: 360, titleW: 940, titleSize: 84, titleMaxChars: 19, subtitleX: 70, subtitleY: 710, subtitleW: 900, subtitleSize: 34, handleX: 70, handleY: 130, badgeX: 70, badgeY: 900, badgeW: 360, photoX: 0, photoY: 0, photoW: 1080, photoH: 1920, overlayOpacity: 0.58 },
  },
  {
    name: "Cartao",
    values: { titleX: 70, titleY: 1190, titleW: 940, titleSize: 70, subtitleX: 70, subtitleY: 1490, subtitleW: 900, subtitleSize: 30, handleX: 70, handleY: 110, badgeX: 650, badgeY: 1020, badgeW: 360, photoX: 70, photoY: 180, photoW: 940, photoH: 760, overlayOpacity: 0.16 },
  },
  {
    name: "Cinematico",
    values: { titleX: 80, titleY: 780, titleW: 820, titleSize: 92, titleMaxChars: 16, subtitleX: 80, subtitleY: 1260, subtitleW: 760, subtitleSize: 34, handleX: 80, handleY: 150, badgeX: 80, badgeY: 1510, badgeW: 430, photoX: 0, photoY: 0, photoW: 1080, photoH: 1920, overlayOpacity: 0.62 },
  },
  {
    name: "Tipografico",
    values: { titleX: 100, titleY: 650, titleW: 880, titleSize: 98, titleMaxChars: 15, titleAlign: "center", subtitleX: 160, subtitleY: 1160, subtitleW: 760, subtitleSize: 36, subtitleAlign: "center", handleX: 390, handleY: 180, badgeX: 290, badgeY: 1540, badgeW: 500, photoX: 0, photoY: 0, photoW: 1080, photoH: 1920, overlayOpacity: 0.7 },
  },
];

const PRESET_ORDER = [
  "news_minimal", "news_breaking", "news_classic", "news_yellow",
  "econ_bull", "econ_bear", "econ_corp", "econ_fintech",
  "soc_stadium", "soc_brasil", "soc_derby", "soc_champ",
  "gos_pink", "gos_tab", "gos_carpet", "gos_pastel",
  "law_classic", "law_serif", "law_premium", "law_modern",
  "med_clean", "med_alert", "med_research", "med_wellness",
  "tec_dark", "tec_ai", "tec_startup", "tec_cyber",
  "rel_golden", "rel_peace", "rel_minimal", "rel_revival",
];

function normalizedFormat(format) {
  return format === "story" || format === "stories" ? "stories"
    : format === "reel" || format === "reels" ? "reels"
      : "feed";
}

export function getDefaultTemplateConfig(format = "feed") {
  const normalized = normalizedFormat(format);
  return { ...(normalized === "feed" ? FEED_DEFAULTS : normalized === "stories" ? STORY_DEFAULTS : REEL_DEFAULTS) };
}

export function getTemplateLayoutOptions(format = "feed") {
  const normalized = normalizedFormat(format);
  const layouts = normalized === "feed" ? FEED_LAYOUTS : normalized === "stories" ? STORY_LAYOUTS : REEL_LAYOUTS;
  return layouts.map((layout, index) => ({ index, name: layout.name, values: { ...layout.values } }));
}

export function getPresetTemplateLayout(presetKey, format = "feed") {
  const layouts = getTemplateLayoutOptions(format);
  if (presetKey === "breaking_news") return { ...layouts[4].values };
  const index = Math.max(0, PRESET_ORDER.indexOf(presetKey)) % 4;
  return { ...layouts[index].values };
}

export function getPresetTemplateConfig(presetKey, format = "feed", presetConfig = {}) {
  const normalized = normalizedFormat(format);
  const merged = normalizeTemplateConfig({
    ...getDefaultTemplateConfig(normalized),
    ...getPresetTemplateLayout(presetKey, normalized),
    ...(presetConfig || {}),
  }, normalized);
  if (normalized === "stories" && /leia a legenda/i.test(merged.badgeText || "")) {
    merged.badgeText = "RESUMO";
  }
  return merged;
}

export function normalizeTemplateConfig(config, format = "feed") {
  const base = getDefaultTemplateConfig(format);
  const merged = { ...base, ...(config || {}) };
  const legacyLayout =
    merged.titleY === 540 && merged.subtitleY === 800 && merged.badgeY === 980 &&
    merged.photoX === 90 && merged.photoY === 600 && merged.photoW === 420 && merged.photoH === 280;
  const normalized = legacyLayout ? {
    ...merged,
    titleX: base.titleX,
    titleY: base.titleY,
    titleW: base.titleW,
    titleSize: base.titleSize,
    titleMaxChars: base.titleMaxChars,
    subtitleX: base.subtitleX,
    subtitleY: base.subtitleY,
    subtitleW: base.subtitleW,
    subtitleSize: base.subtitleSize,
    handleX: base.handleX,
    handleY: base.handleY,
    badgeX: base.badgeX,
    badgeY: base.badgeY,
    badgeW: base.badgeW,
    photoX: base.photoX,
    photoY: base.photoY,
    photoW: base.photoW,
    photoH: base.photoH,
    overlayOpacity: base.overlayOpacity,
  } : merged;
  const supportedFonts = ["Inter", "Montserrat", "Poppins", "Lora"];
  const safeFont = value => supportedFonts.includes(value) ? value : "Inter";
  return {
    ...normalized,
    backgroundLayer: normalized.backgroundLayer === "overlay" ? "overlay" : "base",
    titleFontFamily: safeFont(normalized.titleFontFamily),
    subtitleFontFamily: safeFont(normalized.subtitleFontFamily),
    handleFontFamily: safeFont(normalized.handleFontFamily),
    badgeFontFamily: safeFont(normalized.badgeFontFamily),
    showBrandLogo: Boolean(normalized.showBrandLogo && normalized.brandLogoUrl),
    brandLogoUrl: typeof normalized.brandLogoUrl === "string" ? normalized.brandLogoUrl : null,
    brandLogoX: Math.max(0, Math.min(1000, Number(normalized.brandLogoX ?? normalized.handleX ?? 60))),
    brandLogoY: Math.max(0, Math.min(1840, Number(normalized.brandLogoY ?? 30))),
    brandLogoSize: Math.max(32, Math.min(180, Number(normalized.brandLogoSize ?? 52))),
    brandKitVersion: Math.max(0, Number(normalized.brandKitVersion || 0) || 0),
    brandKitStyle: typeof normalized.brandKitStyle === "string" ? normalized.brandKitStyle : null,
  };
}

export function textAnchorForAlign(align) {
  return align === "center" ? "middle" : align === "right" ? "end" : "start";
}

export function textXForBox(x, width, align) {
  return align === "center" ? x + width / 2 : align === "right" ? x + width : x;
}
