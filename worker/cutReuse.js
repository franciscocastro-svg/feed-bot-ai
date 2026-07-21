const finiteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function cutSegmentReuseKey(clip, removeSilences = false) {
  const start = Math.max(0, finiteNumber(clip?.start_seconds));
  const duration = Math.max(0, finiteNumber(
    clip?.duration_seconds,
    finiteNumber(clip?.end_seconds) - start,
  ));
  return `${start.toFixed(3)}:${duration.toFixed(3)}:${removeSilences ? "trim" : "keep"}`;
}

export function sliceSourceTranscript(words, clipStart, clipEnd) {
  const start = Math.max(0, finiteNumber(clipStart));
  const end = Math.max(start, finiteNumber(clipEnd, start));
  if (end <= start) return [];

  return (Array.isArray(words) ? words : [])
    .map((word) => {
      const wordStart = finiteNumber(word?.start, -1);
      const wordEnd = finiteNumber(word?.end, -1);
      const text = String(word?.word || "").trim();
      if (!text || wordEnd <= wordStart || wordEnd <= start || wordStart >= end) return null;
      return {
        word: text,
        start: clamp(wordStart - start, 0, end - start),
        end: clamp(wordEnd - start, 0, end - start),
      };
    })
    .filter((word) => word && word.end > word.start);
}

export function remapTranscriptToKeptSegments(words, keptSegments, outputDuration = Number.POSITIVE_INFINITY) {
  const segments = (Array.isArray(keptSegments) ? keptSegments : [])
    .map((segment) => ({
      start: Math.max(0, finiteNumber(segment?.start)),
      end: Math.max(0, finiteNumber(segment?.end)),
    }))
    .filter((segment) => segment.end > segment.start)
    .sort((left, right) => left.start - right.start);
  if (!segments.length) return Array.isArray(words) ? words : [];

  const limit = Math.max(0, finiteNumber(outputDuration, Number.POSITIVE_INFINITY));
  const offsets = [];
  let accumulated = 0;
  for (const segment of segments) {
    offsets.push(accumulated);
    accumulated += segment.end - segment.start;
  }

  return (Array.isArray(words) ? words : []).map((word) => {
    const wordStart = finiteNumber(word?.start, -1);
    const wordEnd = finiteNumber(word?.end, -1);
    let best = null;
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const overlapStart = Math.max(wordStart, segment.start);
      const overlapEnd = Math.min(wordEnd, segment.end);
      const overlap = overlapEnd - overlapStart;
      if (overlap <= 0 || (best && best.overlap >= overlap)) continue;
      best = { index, overlapStart, overlapEnd, overlap };
    }
    if (!best) return null;
    const segment = segments[best.index];
    const mappedStart = offsets[best.index] + (best.overlapStart - segment.start);
    const mappedEnd = offsets[best.index] + (best.overlapEnd - segment.start);
    return {
      word: String(word?.word || "").trim(),
      start: clamp(mappedStart, 0, limit),
      end: clamp(mappedEnd, 0, limit),
    };
  }).filter((word) => word?.word && word.end > word.start);
}

export function createCutReuseContext(sourceTranscriptWords = [], sourceTrace = {}) {
  return {
    sourceTranscriptWords: Array.isArray(sourceTranscriptWords) ? sourceTranscriptWords : [],
    sourceTrace: sourceTrace && typeof sourceTrace === "object" ? sourceTrace : {},
    segments: new Map(),
    focus: new Map(),
    metrics: {
      segmentPreparations: 0,
      segmentReuses: 0,
      sourceTranscriptReuses: 0,
      clipTranscriptionCalls: 0,
      focusAnalyses: 0,
      focusReuses: 0,
      outputs: 0,
    },
  };
}

export function cutReuseTrace(context) {
  const metrics = context?.metrics || {};
  return {
    source_transcription: {
      calls: Math.max(0, finiteNumber(context?.sourceTrace?.calls)),
      providers: context?.sourceTrace?.providers || {},
      duration_ms: Math.max(0, finiteNumber(context?.sourceTrace?.duration_ms)),
      reused_for_outputs: Math.max(0, finiteNumber(metrics.sourceTranscriptReuses)),
    },
    rendering_reuse: {
      segment_preparations: Math.max(0, finiteNumber(metrics.segmentPreparations)),
      segment_reuses: Math.max(0, finiteNumber(metrics.segmentReuses)),
      clip_transcription_calls: Math.max(0, finiteNumber(metrics.clipTranscriptionCalls)),
      focus_analyses: Math.max(0, finiteNumber(metrics.focusAnalyses)),
      focus_reuses: Math.max(0, finiteNumber(metrics.focusReuses)),
      outputs: Math.max(0, finiteNumber(metrics.outputs)),
    },
  };
}
