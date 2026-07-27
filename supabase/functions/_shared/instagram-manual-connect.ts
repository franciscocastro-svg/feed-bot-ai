export type ManualInstagramConnectionInput = {
  accessToken: string;
  username: string | null;
  instagramUserId: string | null;
  pageId: string | null;
  niche: string | null;
  tokenMode: "instagram_login" | "facebook_graph";
};

export class ManualInstagramInputError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ManualInstagramInputError";
    this.code = code;
  }
}

function optionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    throw new ManualInstagramInputError("invalid_input", "Um dos campos excede o tamanho permitido.");
  }
  return normalized;
}

function optionalMetaId(value: unknown, label: string): string | null {
  const normalized = optionalText(value, 64);
  if (!normalized) return null;
  if (!/^\d+$/.test(normalized)) {
    throw new ManualInstagramInputError("invalid_meta_id", `${label} deve conter somente números.`);
  }
  return normalized;
}

export function isInstagramLoginToken(token: string): boolean {
  return /^IG/i.test(token.trim());
}

export function normalizeManualInstagramInput(body: unknown): ManualInstagramConnectionInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ManualInstagramInputError("invalid_input", "Dados da conta inválidos.");
  }

  const input = body as Record<string, unknown>;
  const accessToken = optionalText(input.access_token, 8192);
  if (!accessToken || accessToken.length < 20 || /\s/.test(accessToken)) {
    throw new ManualInstagramInputError("invalid_access_token", "Informe um Access Token válido da Meta.");
  }

  const rawUsername = optionalText(input.username, 31);
  const username = rawUsername?.replace(/^@+/, "") || null;
  if (username && !/^[A-Za-z0-9._]{1,30}$/.test(username)) {
    throw new ManualInstagramInputError("invalid_username", "Username do Instagram inválido.");
  }

  const instagramUserId = optionalMetaId(input.ig_user_id, "Instagram Business User ID");
  const pageId = optionalMetaId(input.page_id, "Page ID");
  const niche = optionalText(input.niche, 160);
  const tokenMode = isInstagramLoginToken(accessToken) ? "instagram_login" : "facebook_graph";

  if (tokenMode === "facebook_graph" && (!instagramUserId || !pageId)) {
    throw new ManualInstagramInputError(
      "facebook_ids_required",
      "Para tokens da Meta Graph API, informe o Instagram Business User ID e o Page ID.",
    );
  }

  return {
    accessToken,
    username,
    instagramUserId,
    pageId,
    niche,
    tokenMode,
  };
}
