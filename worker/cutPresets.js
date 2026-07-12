export const CUT_PRESETS = {
  viral: {
    key: "viral",
    label: "Viral dinâmico",
    subtitleStyle: "bold",
    hookEnabled: true,
    removeSilences: true,
    zoomEffect: true,
    smartCrop: true,
    analysisInstruction: "Priorize surpresa, emoção, frases fortes e um gancho compreensível já nos primeiros segundos.",
  },
  clean: {
    key: "clean",
    label: "Clean profissional",
    subtitleStyle: "clean",
    hookEnabled: false,
    removeSilences: true,
    zoomEffect: false,
    smartCrop: true,
    analysisInstruction: "Priorize clareza, autoridade, começo e fim naturais e preserve o ritmo elegante da fala.",
  },
  podcast: {
    key: "podcast",
    label: "Podcast / entrevista",
    subtitleStyle: "classic",
    hookEnabled: true,
    removeSilences: true,
    zoomEffect: false,
    smartCrop: true,
    analysisInstruction: "Priorize respostas completas, opiniões fortes, histórias e momentos em que a fala funciona sem contexto externo.",
  },
  product: {
    key: "product",
    label: "Produto / anúncio",
    subtitleStyle: "neon",
    hookEnabled: true,
    removeSilences: true,
    zoomEffect: true,
    smartCrop: true,
    analysisInstruction: "Priorize problema, benefício, demonstração, prova e chamada para ação sem criar promessas que não aparecem no vídeo.",
  },
  highlights: {
    key: "highlights",
    label: "Melhores momentos",
    subtitleStyle: "karaoke",
    hookEnabled: true,
    removeSilences: false,
    zoomEffect: true,
    smartCrop: true,
    analysisInstruction: "Priorize picos de energia, reação, humor, emoção e momentos visualmente marcantes.",
  },
  custom: {
    key: "custom",
    label: "Prompt personalizado",
    subtitleStyle: "classic",
    hookEnabled: true,
    removeSilences: true,
    zoomEffect: false,
    smartCrop: true,
    analysisInstruction: "Siga a orientação personalizada do cliente sem inventar fatos ou falas.",
  },
};

export function resolveCutPreset(key, overrides = {}) {
  const preset = CUT_PRESETS[key] || CUT_PRESETS.viral;
  return {
    ...preset,
    subtitleStyle: overrides.subtitle_style || preset.subtitleStyle,
    hookEnabled: overrides.hook_enabled ?? preset.hookEnabled,
    removeSilences: overrides.remove_silences ?? preset.removeSilences,
    zoomEffect: overrides.zoom_effect ?? preset.zoomEffect,
    smartCrop: overrides.smart_crop ?? preset.smartCrop,
  };
}

export const CUT_PRESET_KEYS = Object.keys(CUT_PRESETS);
