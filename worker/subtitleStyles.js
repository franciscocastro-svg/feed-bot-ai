// Estilos de legenda queimada estilo TikTok/Reels.
// Cada estilo devolve blocos ASS (Advanced SubStation) prontos para o ffmpeg.
// Cores em ASS = &HBBGGRR (Blue-Green-Red, hex invertido).

const STYLE_PRESETS = {
  classic: {
    // Branco com contorno preto grosso — universal
    primary: "&H00FFFFFF",
    secondary: "&H00FFFFFF",
    outline: "&H00000000",
    back: "&H80000000",
    outlineWidth: 4,
    shadow: 1,
    bold: -1,
    highlightColor: "&H0000D4FF", // amarelo pra palavra ativa
  },
  neon: {
    primary: "&H0000FFFF", // amarelo neon
    secondary: "&H0000FFFF",
    outline: "&H00000000",
    back: "&HA0000000",
    outlineWidth: 5,
    shadow: 2,
    bold: -1,
    highlightColor: "&H000000FF", // vermelho vibrante
  },
  karaoke: {
    primary: "&H00FFFFFF",
    secondary: "&H00FFFFFF",
    outline: "&H00000000",
    back: "&H80000000",
    outlineWidth: 4,
    shadow: 1,
    bold: -1,
    highlightColor: "&H0000D46A", // verde
  },
};

function fontSizeForFormat(format) {
  switch (format) {
    case "feed_square":   return 62;
    case "feed_portrait": return 68;
    case "reels":
    default:              return 78;
  }
}

// Alinhamento ASS: 2 = bottom-center, 5 = middle-center (com \an override)
function marginVForFormat(format) {
  switch (format) {
    case "feed_square":   return 100;
    case "feed_portrait": return 160;
    case "reels":
    default:              return 380; // mais alto pro Reels não colidir com CTAs do IG
  }
}

function escapeAssText(text) {
  return String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\r?\n/g, " ")
    .trim();
}

function wrapHookText(text, maxCharsPerLine = 18) {
  const words = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!words.length) return { text: "", longestLineLength: 0 };
  const fullLine = words.join(" ");
  if (fullLine.length <= maxCharsPerLine) {
    return { text: escapeAssText(fullLine), longestLineLength: fullLine.length };
  }
  if (words.length === 1) {
    const line = words[0].slice(0, maxCharsPerLine + 4);
    return { text: escapeAssText(line), longestLineLength: line.length };
  }

  let best = null;
  for (let split = 1; split < words.length; split += 1) {
    const first = words.slice(0, split).join(" ");
    const second = words.slice(split).join(" ");
    const longest = Math.max(first.length, second.length);
    const overflow = Math.max(0, first.length - maxCharsPerLine) + Math.max(0, second.length - maxCharsPerLine);
    const score = overflow * 100 + longest * 2 + Math.abs(first.length - second.length);
    if (!best || score < best.score) best = { first, second, longest, score };
  }

  const lines = best ? [best.first, best.second] : [words.join(" ")];
  return {
    text: lines.map(escapeAssText).join("\\N"),
    longestLineLength: Math.max(...lines.map((line) => line.length)),
  };
}

function hookFontSizeForText(baseFontSize, longestLineLength) {
  const comfortableChars = 17;
  if (longestLineLength <= comfortableChars) return Math.round(baseFontSize * 1.12);
  const ratio = comfortableChars / Math.max(comfortableChars, longestLineLength);
  return Math.max(Math.round(baseFontSize * 0.82), Math.round(baseFontSize * 1.12 * ratio));
}

function secondsToAssTime(seconds) {
  const total = Math.max(0, Number(seconds) || 0);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const cs = Math.floor((total - Math.floor(total)) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

// Agrupa palavras em frases curtas (2-4 palavras) — legível em vídeo curto vertical.
function groupWords(words, maxWordsPerLine = 3) {
  const groups = [];
  let bucket = [];
  for (const w of words) {
    if (!w || typeof w.start !== "number" || typeof w.end !== "number") continue;
    bucket.push(w);
    // Quebra quando bucket cheio ou quando termina em pontuação forte
    const endsPhrase = /[.!?,]$/.test(String(w.word || "").trim());
    if (bucket.length >= maxWordsPerLine || endsPhrase) {
      groups.push(bucket);
      bucket = [];
    }
  }
  if (bucket.length) groups.push(bucket);
  return groups;
}

/**
 * Gera arquivo ASS completo pra queimar legenda palavra-por-palavra.
 * @param {Array<{word:string,start:number,end:number}>} words - transcrição com timestamps
 * @param {string} styleName - classic|neon|karaoke
 * @param {string} format - reels|feed_square|feed_portrait
 * @param {{width:number,height:number}} dims
 * @param {number} clipDurationSeconds
 */
export function buildAssSubtitleFile(words, styleName, format, dims, clipDurationSeconds, options = {}) {
  const preset = STYLE_PRESETS[styleName] || STYLE_PRESETS.classic;
  const fontSize = fontSizeForFormat(format);
  const marginV = marginVForFormat(format);
  const formattedHook = wrapHookText(options.hookText || "", format === "reels" ? 18 : 16);
  const hookFontSize = hookFontSizeForText(fontSize, formattedHook.longestLineLength);
  const groups = groupWords(words || [], 3);
  const hookText = formattedHook.text;
  const hookDurationSec = Math.min(3.5, Math.max(1.5, Number(options.hookDurationSeconds) || 3));

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${dims.width}
PlayResY: ${dims.height}
ScaledBorderAndShadow: yes
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Inter,${fontSize},${preset.primary},${preset.secondary},${preset.outline},${preset.back},${preset.bold},0,0,0,100,100,0,0,1,${preset.outlineWidth},${preset.shadow},2,60,60,${marginV},1
Style: Hook,Impact,${hookFontSize},&H0000FFFF,&H0000FFFF,&H00000000,&HC0000000,-1,0,0,0,100,100,0,0,3,5,1,8,96,96,${Math.round(dims.height * 0.16)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = [];

  // Hook chamativo: primeiros ~3s no terço superior com fade + pop
  if (hookText) {
    const hookEnd = Math.min(hookDurationSec, Math.max(1, clipDurationSeconds - 0.2));
    events.push(
      `Dialogue: 1,${secondsToAssTime(0)},${secondsToAssTime(hookEnd)},Hook,,0,0,0,,{\\fad(180,260)\\t(0,220,\\fscx102\\fscy102)}${hookText}`,
    );
  }

  for (const group of groups) {
    if (!group.length) continue;
    const groupStart = group[0].start;
    const groupEnd = group[group.length - 1].end;
    if (groupEnd <= groupStart) continue;
    if (groupStart >= clipDurationSeconds) continue;
    const safeEnd = Math.min(groupEnd, clipDurationSeconds);
    const parts = group.map((w) => {
      const durCs = Math.max(1, Math.round((w.end - w.start) * 100));
      const txt = escapeAssText(w.word);
      return `{\\kf${durCs}\\1c${preset.primary}\\2c${preset.highlightColor}}${txt} `;
    });
    const text = parts.join("").trimEnd();
    events.push(`Dialogue: 0,${secondsToAssTime(groupStart)},${secondsToAssTime(safeEnd)},Default,,0,0,0,,${text}`);
  }

  return header + events.join("\n") + "\n";
}

// Gera arquivo ASS APENAS com o hook (sem palavras) — usado quando a transcrição falha
// mas ainda queremos exibir o gancho chamativo.
export function buildHookOnlyAssFile(hookText, format, dims, clipDurationSeconds, hookDurationSeconds = 3) {
  return buildAssSubtitleFile([], "classic", format, dims, clipDurationSeconds, {
    hookText,
    hookDurationSeconds,
  });
}

export const SUBTITLE_STYLE_NAMES = Object.keys(STYLE_PRESETS);
