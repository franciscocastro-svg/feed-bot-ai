type ImageResponse = Pick<Response, "ok" | "status" | "headers" | "arrayBuffer">;
type ImageFetch = (input: string) => Promise<ImageResponse>;

const cleanText = (value: unknown) => typeof value === "string" ? value.trim() : "";

export type EditorialIdentity = {
  brandName: string;
  brandHandle: string;
  logoUrl: string | null;
};

export function resolveEditorialIdentity(
  settings: Record<string, unknown> | null | undefined,
  accountUsername?: string | null,
): EditorialIdentity {
  const username = cleanText(accountUsername).replace(/^@/, "");
  const brandName = cleanText(settings?.brand_name) || username;
  const brandHandle = (cleanText(settings?.brand_handle) || username || brandName).replace(/^@/, "");

  if (!brandHandle) {
    throw new Error("Identidade da conta indisponível para compor a arte");
  }

  return {
    brandName: brandName || brandHandle,
    brandHandle,
    logoUrl: cleanText(settings?.brand_logo_url) || null,
  };
}

export function assertEditorialCopy(title: unknown, subtitle: unknown, badgeText = "LEIA A LEGENDA →") {
  if (!cleanText(title)) throw new Error("Título ausente na arte editorial");
  if (!cleanText(subtitle)) throw new Error("Subtítulo ausente na arte editorial");
  if (!cleanText(badgeText)) throw new Error("Texto do botão ausente na arte editorial");
}

function isSupportedImageContentType(contentType: string): boolean {
  return /^image\/(?:png|jpe?g|webp)$/i.test(contentType.split(";")[0].trim());
}

function matchesImageSignature(bytes: Uint8Array, contentType: string): boolean {
  if (contentType === "image/png") {
    return bytes.byteLength >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  if (contentType === "image/jpeg" || contentType === "image/jpg") {
    return bytes.byteLength >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === "image/webp") {
    return bytes.byteLength >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}

export async function fetchRequiredBrandLogo(
  url: string,
  fetchImage: ImageFetch = fetch,
  attempts = 3,
): Promise<{ bytes: Uint8Array; contentType: string }> {
  let lastReason = "resposta inválida";

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetchImage(url);
      if (!response.ok) {
        lastReason = `HTTP ${response.status}`;
        continue;
      }

      const rawContentType = response.headers.get("content-type") || "";
      const contentType = rawContentType.split(";")[0].trim().toLowerCase();
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!isSupportedImageContentType(rawContentType) || !matchesImageSignature(bytes, contentType)) {
        lastReason = "arquivo não é uma imagem compatível";
        continue;
      }

      return { bytes, contentType };
    } catch (error) {
      lastReason = error instanceof Error ? error.message : "falha de rede";
    }
  }

  throw new Error(`Logo configurado indisponível após ${attempts} tentativas: ${lastReason}`);
}

export function versionPublicAssetUrl(url: string, version: string | number): string {
  const parsed = new URL(url);
  parsed.searchParams.set("v", String(version));
  return parsed.toString();
}
