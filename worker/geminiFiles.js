import fs from "fs";

const GEMINI_ORIGIN = "https://generativelanguage.googleapis.com";
const DEFAULT_LONG_VIDEO_SECONDS = 10 * 60;
const DEFAULT_LARGE_VIDEO_BYTES = 100 * 1024 * 1024;
const DEFAULT_FILE_READY_TIMEOUT_MS = 12 * 60 * 1000;

const timeoutSignal = (milliseconds) => {
  if (typeof AbortSignal?.timeout === "function") return AbortSignal.timeout(milliseconds);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  timer.unref?.();
  return controller.signal;
};

const boundedNumber = (value, fallback, min, max) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.round(parsed)));
};

export function longVideoThresholds(env = process.env) {
  return {
    durationSeconds: boundedNumber(
      env.GEMINI_LONG_VIDEO_SECONDS,
      DEFAULT_LONG_VIDEO_SECONDS,
      60,
      60 * 60,
    ),
    sizeBytes: boundedNumber(
      env.GEMINI_LARGE_VIDEO_BYTES,
      DEFAULT_LARGE_VIDEO_BYTES,
      10 * 1024 * 1024,
      2 * 1024 * 1024 * 1024,
    ),
  };
}

export function shouldUseGeminiFiles({ durationSeconds, sizeBytes, env = process.env }) {
  const thresholds = longVideoThresholds(env);
  return Number(durationSeconds || 0) >= thresholds.durationSeconds
    || Number(sizeBytes || 0) >= thresholds.sizeBytes;
}

function assertGoogleUrl(value, label) {
  const parsed = new URL(String(value || ""));
  if (parsed.protocol !== "https:" || parsed.origin !== GEMINI_ORIGIN) {
    throw new Error(`${label} retornada pelo Gemini é inválida.`);
  }
  return parsed.toString();
}

function normalizeFileRecord(payload) {
  const file = payload?.file || payload || {};
  const name = String(file.name || "");
  if (!/^files\/[a-z0-9-]+$/i.test(name)) {
    throw new Error("Gemini não retornou um identificador de arquivo válido.");
  }
  return {
    name,
    uri: assertGoogleUrl(file.uri, "URI de arquivo"),
    mimeType: String(file.mimeType || file.mime_type || "video/mp4"),
    state: String(file.state || "").toUpperCase(),
  };
}

async function responseError(response, label) {
  const body = await response.text().catch(() => "");
  const error = new Error(`${label} ${response.status}: ${body.slice(0, 300)}`);
  error.status = response.status;
  return error;
}

export async function uploadGeminiVideoFile({
  apiKey,
  filePath,
  mimeType = "video/mp4",
  displayName = "fluxfeed-video",
  fetchImpl = fetch,
  statImpl = fs.promises.stat,
  streamFactory = fs.createReadStream,
  uploadTimeoutMs = 15 * 60 * 1000,
}) {
  if (!apiKey) throw new Error("GEMINI_API_KEY não configurada.");
  const stat = await statImpl(filePath);
  const size = Number(stat?.size || 0);
  if (!Number.isFinite(size) || size <= 0) throw new Error("Vídeo vazio ou ilegível para envio ao Gemini.");

  const startResponse = await fetchImpl(`${GEMINI_ORIGIN}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(size),
      "X-Goog-Upload-Header-Content-Type": mimeType,
    },
    body: JSON.stringify({ file: { display_name: String(displayName || "fluxfeed-video").slice(0, 120) } }),
    signal: timeoutSignal(60_000),
  });
  if (!startResponse.ok) throw await responseError(startResponse, "Gemini Files start");
  const uploadUrl = assertGoogleUrl(startResponse.headers.get("x-goog-upload-url"), "URL de upload");

  const uploadResponse = await fetchImpl(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(size),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: streamFactory(filePath),
    duplex: "half",
    signal: timeoutSignal(uploadTimeoutMs),
  });
  if (!uploadResponse.ok) throw await responseError(uploadResponse, "Gemini Files upload");
  return normalizeFileRecord(await uploadResponse.json());
}

export async function waitForGeminiFile({
  apiKey,
  file,
  fetchImpl = fetch,
  sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  pollIntervalMs = 5_000,
  timeoutMs = DEFAULT_FILE_READY_TIMEOUT_MS,
  onState,
}) {
  const startedAt = Date.now();
  let current = normalizeFileRecord(file);
  while (current.state !== "ACTIVE") {
    if (current.state === "FAILED") throw new Error("O Gemini não conseguiu processar o vídeo enviado.");
    if (Date.now() - startedAt >= timeoutMs) throw new Error("O Gemini demorou demais para preparar o vídeo.");
    if (typeof onState === "function") await onState(current.state || "PROCESSING");
    await sleepImpl(pollIntervalMs);
    const response = await fetchImpl(`${GEMINI_ORIGIN}/v1beta/${current.name}`, {
      headers: { "x-goog-api-key": apiKey },
      signal: timeoutSignal(30_000),
    });
    if (!response.ok) throw await responseError(response, "Gemini Files status");
    current = normalizeFileRecord(await response.json());
  }
  if (typeof onState === "function") await onState("ACTIVE");
  return current;
}

export async function deleteGeminiFile({ apiKey, file, fetchImpl = fetch }) {
  let normalized;
  try {
    normalized = normalizeFileRecord(file);
  } catch {
    return false;
  }
  const response = await fetchImpl(`${GEMINI_ORIGIN}/v1beta/${normalized.name}`, {
    method: "DELETE",
    headers: { "x-goog-api-key": apiKey },
    signal: timeoutSignal(30_000),
  });
  if (response.ok || response.status === 404) return true;
  throw await responseError(response, "Gemini Files delete");
}
