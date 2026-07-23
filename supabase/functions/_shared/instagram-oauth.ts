type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type InstagramApiError = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
};

type InstagramApiPayload = {
  access_token?: string;
  expires_in?: number;
  error?: InstagramApiError;
};

export type LongLivedInstagramToken = {
  accessToken: string;
  expiresIn: number;
};

const DEFAULT_TOKEN_TTL_SECONDS = 60 * 24 * 60 * 60;
const LONG_TOKEN_ENDPOINT = "https://graph.instagram.com/access_token";

export class InstagramLongTokenExchangeError extends Error {
  readonly publicCode = "long_token_failed";
  readonly diagnostic: InstagramApiError;

  constructor(diagnostic: InstagramApiError) {
    super("long_token_failed");
    this.name = "InstagramLongTokenExchangeError";
    this.diagnostic = diagnostic;
  }
}

async function readInstagramPayload(response: Response): Promise<InstagramApiPayload> {
  try {
    return await response.json() as InstagramApiPayload;
  } catch {
    return {};
  }
}

function extractDiagnostic(payload: InstagramApiPayload): InstagramApiError {
  const error = payload.error;
  if (!error || typeof error !== "object") return {};
  return {
    message: typeof error.message === "string" ? error.message : undefined,
    type: typeof error.type === "string" ? error.type : undefined,
    code: typeof error.code === "number" ? error.code : undefined,
    error_subcode: typeof error.error_subcode === "number" ? error.error_subcode : undefined,
    fbtrace_id: typeof error.fbtrace_id === "string" ? error.fbtrace_id : undefined,
  };
}

function isUnsupportedGet(payload: InstagramApiPayload): boolean {
  const message = String(payload.error?.message || "");
  return /unsupported get request|method type:\s*get/i.test(message);
}

function tokenFromPayload(payload: InstagramApiPayload): LongLivedInstagramToken | null {
  const accessToken = typeof payload.access_token === "string"
    ? payload.access_token.trim()
    : "";
  if (!accessToken) return null;

  return {
    accessToken,
    expiresIn: typeof payload.expires_in === "number" && payload.expires_in > 0
      ? payload.expires_in
      : DEFAULT_TOKEN_TTL_SECONDS,
  };
}

export async function exchangeLongLivedInstagramToken(
  shortToken: string,
  appSecret: string,
  fetchImpl: FetchLike = fetch,
): Promise<LongLivedInstagramToken> {
  const longUrl = new URL(LONG_TOKEN_ENDPOINT);
  longUrl.searchParams.set("grant_type", "ig_exchange_token");
  longUrl.searchParams.set("client_secret", appSecret);
  longUrl.searchParams.set("access_token", shortToken);

  const getResponse = await fetchImpl(longUrl, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const getPayload = await readInstagramPayload(getResponse);
  const getToken = tokenFromPayload(getPayload);
  if (getResponse.ok && getToken) return getToken;

  if (!isUnsupportedGet(getPayload)) {
    throw new InstagramLongTokenExchangeError(extractDiagnostic(getPayload));
  }

  const longForm = new URLSearchParams();
  longForm.set("grant_type", "ig_exchange_token");
  longForm.set("client_secret", appSecret);
  longForm.set("access_token", shortToken);

  const postResponse = await fetchImpl(LONG_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: longForm.toString(),
  });
  const postPayload = await readInstagramPayload(postResponse);
  const postToken = tokenFromPayload(postPayload);
  if (postResponse.ok && postToken) return postToken;

  throw new InstagramLongTokenExchangeError(extractDiagnostic(postPayload));
}

const PUBLIC_ERROR_CODES = new Set([
  "account_limit_reached",
  "authorization_code_already_used",
  "invalid_state",
  "missing_params",
  "short_token_failed",
  "state_expired",
  "state_signature_mismatch",
]);

export function publicInstagramOAuthError(error: unknown): string {
  if (error instanceof InstagramLongTokenExchangeError) return error.publicCode;
  if (!(error instanceof Error)) return "oauth_callback_failed";
  return PUBLIC_ERROR_CODES.has(error.message)
    ? error.message
    : "oauth_callback_failed";
}

export function instagramOAuthRedirect(target: string): Response {
  return new Response(null, {
    status: 303,
    headers: {
      "Cache-Control": "no-store",
      Location: target,
      "Referrer-Policy": "no-referrer",
    },
  });
}
