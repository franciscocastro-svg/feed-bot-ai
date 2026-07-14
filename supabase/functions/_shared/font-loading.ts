type FontFetch = (input: string) => Promise<Pick<Response, "ok" | "arrayBuffer">>;

const INTER_FONT_CANDIDATES = [
  [
    "https://cdn.jsdelivr.net/fontsource/fonts/inter@5.0/latin-900-normal.woff2",
    "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.16/files/inter-latin-900-normal.woff2",
    "https://unpkg.com/@fontsource/inter@5.0.16/files/inter-latin-900-normal.woff2",
  ],
  [
    "https://cdn.jsdelivr.net/fontsource/fonts/inter@5.0/latin-400-normal.woff2",
    "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.16/files/inter-latin-400-normal.woff2",
    "https://unpkg.com/@fontsource/inter@5.0.16/files/inter-latin-400-normal.woff2",
  ],
] as const;

export function isWoff2Font(buffer: Uint8Array): boolean {
  return buffer.byteLength > 4 &&
    buffer[0] === 0x77 &&
    buffer[1] === 0x4f &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x32;
}
export async function loadInterFontBuffers(fetchFont: FontFetch = fetch): Promise<Uint8Array[]> {
  const buffers: Uint8Array[] = [];

  for (const [variationIndex, candidates] of INTER_FONT_CANDIDATES.entries()) {
    let loaded = false;
    for (const url of candidates) {
      try {
        const response = await fetchFont(url);
        if (!response.ok) continue;
        const buffer = new Uint8Array(await response.arrayBuffer());
        if (!isWoff2Font(buffer)) continue;
        buffers.push(buffer);
        loaded = true;
        break;
      } catch {
        // Tenta o próximo CDN da mesma variação da fonte.
      }
    }

    if (!loaded) {
      const variation = variationIndex === 0 ? "900" : "400";
      throw new Error(`Fonte Inter ${variation} indisponível para compor a arte`);
    }
  }

  return buffers;
}
