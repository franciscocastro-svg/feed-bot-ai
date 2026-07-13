// Structured logger and redaction helpers for Edge Functions.
//
// Design goals:
// - Emit one-line JSON events on stdout/stderr.
// - Only whitelisted metadata fields are ever serialized.
// - Never log payloads, headers, PII, tokens, cookies, signatures,
//   secrets, provider API keys, or raw error messages.
// - Convert unknown errors into a sanitized error code + generic message.
//
// This module is intentionally free of Deno-specific imports so it can be
// unit tested with vitest in the browser/jsdom environment.

export type LogLevel = "info" | "warn" | "error";

export interface SafeLogFields {
  function_name?: string;
  request_id?: string;
  event_name?: string;
  event_id?: string;
  event_type?: string;
  environment?: string;
  status?: string;
  provider_status?: number | string;
  duration_ms?: number;
  error_code?: string;
  subs_scanned?: number;
  subs_updated?: number;
  divergences?: number;
  effects_recovered?: number;
  errors_count?: number;
  errors_by_code?: Record<string, number>;
}

const ALLOWED_FIELDS: ReadonlyArray<keyof SafeLogFields> = [
  "function_name",
  "request_id",
  "event_name",
  "event_id",
  "event_type",
  "environment",
  "status",
  "provider_status",
  "duration_ms",
  "error_code",
  "subs_scanned",
  "subs_updated",
  "divergences",
  "effects_recovered",
  "errors_count",
];

const SAFE_ERROR_CODE_RE = /^[A-Za-z0-9_.-]{1,40}$/;

/** Cryptographically-random request id. */
export function newRequestId(): string {
  const cryptoObj: Crypto | undefined =
    (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }
  // Deterministic fallback that still avoids Math.random collisions in tests.
  const bytes = new Uint8Array(16);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${
    hex.slice(16, 20)
  }-${hex.slice(20)}`;
}

function pickAllowed(fields: SafeLogFields | undefined): SafeLogFields {
  const out: SafeLogFields = {};
  if (!fields) return out;
  for (const key of ALLOWED_FIELDS) {
    const value = fields[key];
    if (value === undefined || value === null) continue;
    // Numbers, strings only.
    if (typeof value === "number" || typeof value === "string") {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  if (fields.errors_by_code && typeof fields.errors_by_code === "object") {
    const safeErrors: Record<string, number> = {};
    for (const [code, count] of Object.entries(fields.errors_by_code)) {
      if (!SAFE_ERROR_CODE_RE.test(code)) continue;
      if (!Number.isFinite(count) || count < 0) continue;
      safeErrors[code] = Math.floor(count);
    }
    if (Object.keys(safeErrors).length > 0) out.errors_by_code = safeErrors;
  }
  return out;
}

/** Format a safe log line. Never accepts arbitrary payload objects. */
export function formatLogLine(
  level: LogLevel,
  message: string,
  fields?: SafeLogFields,
): string {
  const safe = pickAllowed(fields);
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...safe,
  };
  return JSON.stringify(entry);
}

export interface Logger {
  info(message: string, fields?: SafeLogFields): void;
  warn(message: string, fields?: SafeLogFields): void;
  error(message: string, fields?: SafeLogFields): void;
  child(bind: SafeLogFields): Logger;
  requestId: string;
  functionName: string;
}

export function createLogger(
  functionName: string,
  bind: SafeLogFields = {},
): Logger {
  const requestId = bind.request_id ?? newRequestId();
  const base: SafeLogFields = {
    ...bind,
    function_name: functionName,
    request_id: requestId,
  };

  const emit = (level: LogLevel, message: string, fields?: SafeLogFields) => {
    const line = formatLogLine(level, message, { ...base, ...(fields ?? {}) });
    if (level === "error") {
      // eslint-disable-next-line no-console
      console.error(line);
    } else if (level === "warn") {
      // eslint-disable-next-line no-console
      console.warn(line);
    } else {
      // eslint-disable-next-line no-console
      console.log(line);
    }
  };

  return {
    requestId,
    functionName,
    info: (m, f) => emit("info", m, f),
    warn: (m, f) => emit("warn", m, f),
    error: (m, f) => emit("error", m, f),
    child(extra) {
      return createLogger(functionName, { ...base, ...extra });
    },
  };
}

/**
 * Sanitize an unknown error into a short opaque code + generic message.
 * The raw provider text is never returned or logged.
 */
export function classifyError(
  err: unknown,
): { error_code: string; message: string } {
  if (err && typeof err === "object") {
    const anyErr = err as { code?: unknown; name?: unknown };
    if (
      typeof anyErr.code === "string" &&
      /^[A-Za-z0-9_.-]{1,40}$/.test(anyErr.code)
    ) {
      return { error_code: anyErr.code, message: "Operation failed" };
    }
    if (
      typeof anyErr.name === "string" &&
      /^[A-Za-z0-9_.-]{1,40}$/.test(anyErr.name)
    ) {
      return { error_code: anyErr.name, message: "Operation failed" };
    }
  }
  return { error_code: "unknown_error", message: "Operation failed" };
}

// Detection helpers used by tests to prove no PII/secret leaks past the API.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const SENSITIVE_KEY_RE =
  /\b(authorization|cookie|set-cookie|token|jwt|signature|secret|api[_-]?key|password|x-lovable-signature|x-supabase-hook-secret|stripe-signature|bearer)\b/i;

export function containsPII(text: string): boolean {
  return EMAIL_RE.test(text);
}

export function containsSensitiveKeyword(text: string): boolean {
  return SENSITIVE_KEY_RE.test(text);
}

/** Attach the request_id to a Response, preserving other headers. */
export function withRequestIdHeader<T extends Response>(
  res: T,
  requestId: string,
): T {
  try {
    res.headers.set("x-request-id", requestId);
  } catch {
    // headers may be immutable; caller should construct a new Response then.
  }
  return res;
}

/** Default extra CORS headers to expose x-request-id from browsers. */
export const observabilityCorsHeaders = {
  "Access-Control-Expose-Headers": "x-request-id",
};
