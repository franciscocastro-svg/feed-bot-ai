function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanHandle(value) {
  return cleanText(value).replace(/^@+/, "");
}

/**
 * Mantém configurações visuais herdadas, mas isola a identidade editorial
 * quando a renderização pertence a uma conta Instagram específica.
 */
export function resolveAccountRenderSettings({
  effectiveSettings = {},
  accountSettings = null,
  accountUsername = "",
  accountScoped = false,
} = {}) {
  if (!accountScoped) return { ...effectiveSettings };

  const username = cleanHandle(accountUsername);
  const explicitHandle = cleanHandle(accountSettings?.brand_handle);
  const explicitName = cleanText(accountSettings?.brand_name);
  const brandHandle = explicitHandle || username;

  if (!brandHandle) {
    throw new Error("Conta Instagram sem identidade válida para renderização");
  }

  return {
    ...effectiveSettings,
    brand_handle: brandHandle,
    brand_name: explicitName || username || brandHandle,
    // Uma conta nunca deve herdar silenciosamente o logo global de outra.
    brand_logo_url: cleanText(accountSettings?.brand_logo_url) || null,
  };
}
