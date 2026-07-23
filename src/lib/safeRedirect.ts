const INTERNAL_REDIRECT_BASE = "https://fluxifeed.invalid";
const DEFAULT_POST_AUTH_REDIRECT = "/dashboard";

function decodeForValidation(value: string): string | null {
  let decoded = value;

  try {
    for (let depth = 0; depth < 3; depth += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
  } catch {
    return null;
  }

  return decoded;
}

function isUnsafeRedirect(value: string): boolean {
  const hasControlCharacter = Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127;
  });

  return (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    hasControlCharacter
  );
}

export function resolvePostAuthRedirect(
  requestedPath: string | null | undefined,
  fallback = DEFAULT_POST_AUTH_REDIRECT,
): string {
  if (!requestedPath || isUnsafeRedirect(requestedPath)) return fallback;

  const decoded = decodeForValidation(requestedPath);
  if (!decoded || isUnsafeRedirect(decoded)) return fallback;

  try {
    const target = new URL(requestedPath, INTERNAL_REDIRECT_BASE);
    if (target.origin !== INTERNAL_REDIRECT_BASE) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch {
    return fallback;
  }
}
