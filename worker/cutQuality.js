const DEFAULT_MIN_SECONDS = 8;
const DEFAULT_MAX_SECONDS = 180;
const START_SEARCH_BEFORE_SECONDS = 2.5;
const START_SEARCH_AFTER_SECONDS = 3.5;
const END_SEARCH_BEFORE_SECONDS = 2;
const END_SEARCH_AFTER_SECONDS = 5;
const NATURAL_PAUSE_SECONDS = 0.55;
const MAX_OVERLAP_RATIO = 0.62;

const finiteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const scoreValue = (value, fallback = null) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(Math.round(parsed), 0, 100);
};

const wordText = (word) => String(word?.word || "").trim();
const endsSentence = (word) => /[.!?…]["')\]]*$/.test(wordText(word));

function normalizeWords(words, videoDuration) {
  const limit = Math.max(0, finiteNumber(videoDuration, Number.POSITIVE_INFINITY));
  return (Array.isArray(words) ? words : [])
    .map((word) => ({
      word: wordText(word),
      start: clamp(finiteNumber(word?.start, -1), 0, limit),
      end: clamp(finiteNumber(word?.end, -1), 0, limit),
    }))
    .filter((word) => word.word && word.end > word.start)
    .sort((left, right) => left.start - right.start || left.end - right.end);
}

function startBoundaryStrength(words, index) {
  if (index <= 0) return 3;
  const previous = words[index - 1];
  const current = words[index];
  if (endsSentence(previous)) return 3;
  if (current.start - previous.end >= NATURAL_PAUSE_SECONDS) return 2;
  return 0;
}

function endBoundaryStrength(words, index) {
  const current = words[index];
  const next = words[index + 1];
  if (endsSentence(current)) return 3;
  if (!next) return 1;
  if (next.start - current.end >= NATURAL_PAUSE_SECONDS) return 2;
  return 0;
}

function chooseStart(words, requestedStart, requestedEnd, maxDuration) {
  const candidates = words
    .map((word, index) => ({
      value: word.start,
      strength: startBoundaryStrength(words, index),
      distance: Math.abs(word.start - requestedStart),
    }))
    .filter((candidate) => (
      candidate.value >= requestedStart - START_SEARCH_BEFORE_SECONDS
      && candidate.value <= requestedStart + START_SEARCH_AFTER_SECONDS
      && requestedEnd - candidate.value <= maxDuration
    ));
  if (!candidates.length) return { value: requestedStart, strength: 0 };
  candidates.sort((left, right) => {
    const leftScore = left.strength * 12 - left.distance * 3;
    const rightScore = right.strength * 12 - right.distance * 3;
    return rightScore - leftScore || left.distance - right.distance;
  });
  return candidates[0];
}

function chooseEnd(words, requestedStart, requestedEnd, minDuration, maxDuration, videoDuration) {
  const candidates = words
    .map((word, index) => ({
      value: word.end,
      strength: endBoundaryStrength(words, index),
      distance: Math.abs(word.end - requestedEnd),
      resolvesForward: word.end >= requestedEnd,
    }))
    .filter((candidate) => (
      candidate.value >= requestedEnd - END_SEARCH_BEFORE_SECONDS
      && candidate.value <= requestedEnd + END_SEARCH_AFTER_SECONDS
      && candidate.value - requestedStart >= minDuration
      && candidate.value - requestedStart <= maxDuration
      && candidate.value <= videoDuration
    ));
  if (!candidates.length) return { value: requestedEnd, strength: 0 };
  candidates.sort((left, right) => {
    const leftScore = left.strength * 12 - left.distance * 2 + (left.resolvesForward ? 2 : 0);
    const rightScore = right.strength * 12 - right.distance * 2 + (right.resolvesForward ? 2 : 0);
    return rightScore - leftScore || left.distance - right.distance;
  });
  return candidates[0];
}

function ensureDurationBounds(start, end, words, options) {
  const { minDuration, maxDuration, videoDuration } = options;
  let boundedStart = clamp(start, 0, videoDuration);
  let boundedEnd = clamp(end, boundedStart, videoDuration);

  if (boundedEnd - boundedStart < minDuration) {
    const forward = words.find((word) => (
      word.end >= boundedStart + minDuration
      && word.end <= boundedStart + maxDuration
    ));
    boundedEnd = Math.min(videoDuration, forward?.end ?? boundedStart + minDuration);
  }

  if (boundedEnd - boundedStart > maxDuration) {
    const limit = boundedStart + maxDuration;
    const naturalEnds = words
      .map((word, index) => ({ word, strength: endBoundaryStrength(words, index) }))
      .filter(({ word, strength }) => strength > 0 && word.end <= limit && word.end - boundedStart >= minDuration);
    boundedEnd = naturalEnds.at(-1)?.word.end ?? limit;
  }

  if (boundedEnd > videoDuration) {
    boundedEnd = videoDuration;
    boundedStart = Math.max(0, Math.min(boundedStart, boundedEnd - minDuration));
  }

  return { start: boundedStart, end: Math.max(boundedStart, boundedEnd) };
}

function overlapRatio(left, right) {
  const overlap = Math.max(0, Math.min(left.end_seconds, right.end_seconds) - Math.max(left.start_seconds, right.start_seconds));
  const shortest = Math.max(0.001, Math.min(left.duration_seconds, right.duration_seconds));
  return overlap / shortest;
}

function aiScore(clip) {
  const hook = scoreValue(clip?.hook_score, 60);
  const emotion = scoreValue(clip?.emotion_score, 60);
  const clarity = scoreValue(clip?.clarity_score, 60);
  const componentScore = Math.round(hook * 0.45 + emotion * 0.25 + clarity * 0.3);
  return scoreValue(clip?.viral_score, scoreValue(clip?.score, componentScore));
}

function speechScore(words, duration) {
  if (!words.length || duration <= 0) return 40;
  const wordsPerSecond = words.length / duration;
  if (wordsPerSecond >= 0.8 && wordsPerSecond <= 3.8) return 100;
  if (wordsPerSecond >= 0.55 && wordsPerSecond <= 4.5) return 82;
  return 60;
}

function refineCandidate(clip, words, originalIndex, options) {
  const requestedStart = clamp(finiteNumber(clip?.start_seconds ?? clip?.start), 0, options.videoDuration);
  const rawEnd = finiteNumber(clip?.end_seconds ?? clip?.end, requestedStart + options.minDuration);
  const requestedEnd = clamp(Math.max(requestedStart + options.minDuration, rawEnd), 0, options.videoDuration);
  const startChoice = chooseStart(words, requestedStart, requestedEnd, options.maxDuration);
  const endChoice = chooseEnd(
    words,
    startChoice.value,
    requestedEnd,
    options.minDuration,
    options.maxDuration,
    options.videoDuration,
  );
  const bounds = ensureDurationBounds(startChoice.value, endChoice.value, words, options);
  const selectedWords = words.filter((word) => word.end > bounds.start && word.start < bounds.end);
  const actualStartWord = words.findIndex((word) => word.end > bounds.start);
  let actualEndWord = -1;
  for (let index = words.length - 1; index >= 0; index -= 1) {
    if (words[index].start < bounds.end) {
      actualEndWord = index;
      break;
    }
  }
  const startStrength = actualStartWord >= 0 ? startBoundaryStrength(words, actualStartWord) : startChoice.strength;
  const endStrength = actualEndWord >= 0 ? endBoundaryStrength(words, actualEndWord) : endChoice.strength;
  const naturalStart = startStrength >= 2;
  const naturalEnd = endStrength >= 2;
  const completeness = naturalStart && naturalEnd ? 100 : naturalStart || naturalEnd ? 78 : 55;
  const baseScore = aiScore(clip);
  const professionalScore = clamp(Math.round(
    baseScore * 0.72
    + completeness * 0.22
    + speechScore(selectedWords, bounds.end - bounds.start) * 0.06,
  ), 0, 100);

  return {
    ...clip,
    start_seconds: Number(bounds.start.toFixed(3)),
    end_seconds: Number(bounds.end.toFixed(3)),
    duration_seconds: Number((bounds.end - bounds.start).toFixed(3)),
    score: professionalScore,
    professional_score: professionalScore,
    selection_quality: {
      professional_score: professionalScore,
      ai_score: baseScore,
      completeness_score: completeness,
      natural_start: naturalStart,
      natural_end: naturalEnd,
      transcript_words: selectedWords.length,
      boundary_adjusted: Math.abs(bounds.start - requestedStart) >= 0.05 || Math.abs(bounds.end - requestedEnd) >= 0.05,
    },
    _originalIndex: originalIndex,
  };
}

export function refineTranscriptCutCandidates(clips, words, options = {}) {
  const candidates = Array.isArray(clips) ? clips : [];
  const requested = clamp(Math.round(finiteNumber(options.requested, candidates.length || 1)), 1, 5);
  const minDuration = Math.max(1, finiteNumber(options.minDuration, DEFAULT_MIN_SECONDS));
  const maxDuration = Math.max(minDuration, finiteNumber(options.maxDuration, DEFAULT_MAX_SECONDS));
  const inferredDuration = Math.max(
    ...candidates.map((clip) => finiteNumber(clip?.end_seconds ?? clip?.end)),
    ...(Array.isArray(words) ? words : []).map((word) => finiteNumber(word?.end)),
    minDuration,
  );
  const videoDuration = Math.max(minDuration, finiteNumber(options.videoDuration, inferredDuration));
  const normalizedWords = normalizeWords(words, videoDuration);
  const refined = candidates.map((clip, index) => refineCandidate(clip, normalizedWords, index, {
    minDuration,
    maxDuration,
    videoDuration,
  }));
  refined.sort((left, right) => (
    right.professional_score - left.professional_score
    || left._originalIndex - right._originalIndex
  ));

  const selected = [];
  let duplicatesRemoved = 0;
  for (const candidate of refined) {
    if (selected.some((current) => overlapRatio(candidate, current) > MAX_OVERLAP_RATIO)) {
      duplicatesRemoved += 1;
      continue;
    }
    selected.push(candidate);
    if (selected.length >= requested) break;
  }

  const output = selected.map(({ _originalIndex, ...clip }) => clip);
  const adjustedBoundaries = output.filter((clip) => clip.selection_quality?.boundary_adjusted).length;
  const meanProfessionalScore = output.length
    ? Math.round(output.reduce((sum, clip) => sum + clip.professional_score, 0) / output.length)
    : 0;

  return {
    clips: output,
    trace: {
      candidate_pool: candidates.length,
      selected: output.length,
      duplicates_removed: duplicatesRemoved,
      boundary_adjustments: adjustedBoundaries,
      mean_professional_score: meanProfessionalScore,
      additional_ai_calls: 0,
      duration_policy: "ai_flexible_8_180",
    },
  };
}

export function professionalCandidatePoolSize(requested) {
  const normalized = clamp(Math.round(finiteNumber(requested, 1)), 1, 5);
  return Math.min(8, Math.max(normalized + 2, normalized * 2));
}
