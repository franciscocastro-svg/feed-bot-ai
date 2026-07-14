import { describe, expect, it, vi } from "vitest";
import { isWoff2Font, loadInterFontBuffers } from "../../supabase/functions/_shared/font-loading.ts";

const woff2 = () => new Uint8Array([0x77, 0x4f, 0x46, 0x32, 1, 2, 3, 4]);

describe("font loading for automatic artwork", () => {
  it("recognizes only WOFF2 buffers accepted by the renderer", () => {
    expect(isWoff2Font(woff2())).toBe(true);
    expect(isWoff2Font(new Uint8Array([0x77, 0x4f, 0x46, 0x46, 1]))).toBe(false);
    expect(isWoff2Font(new TextEncoder().encode("<html>erro</html>"))).toBe(false);
  });

  it("falls back to another CDN and ignores an invalid response", async () => {
    let call = 0;
    const fetchFont = vi.fn(async () => {
      call++;
      const bytes = call === 1 ? new TextEncoder().encode("resposta inválida") : woff2();
      return {
        ok: true,
        arrayBuffer: async () => bytes.buffer,
      };
    });

    const buffers = await loadInterFontBuffers(fetchFont);

    expect(buffers).toHaveLength(2);
    expect(fetchFont).toHaveBeenCalledTimes(3);
    expect(buffers.every(isWoff2Font)).toBe(true);
  });

  it("fails closed instead of rendering an image without text", async () => {
    const fetchFont = vi.fn(async () => ({
      ok: false,
      arrayBuffer: async () => new ArrayBuffer(0),
    }));

    await expect(loadInterFontBuffers(fetchFont)).rejects.toThrow("Nenhuma fonte compatível");
  });
});
