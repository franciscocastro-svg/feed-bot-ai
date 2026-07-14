import { describe, expect, it, vi } from "vitest";
import {
  assertEditorialCopy,
  fetchRequiredBrandLogo,
  resolveEditorialIdentity,
  versionPublicAssetUrl,
} from "../../supabase/functions/_shared/editorial-integrity.ts";

const response = (options: { ok: boolean; status?: number; contentType?: string; bytes?: number[] }) => ({
  ok: options.ok,
  status: options.status ?? (options.ok ? 200 : 503),
  headers: new Headers({ "content-type": options.contentType || "image/png" }),
  arrayBuffer: async () => new Uint8Array(options.bytes || [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer,
});

describe("automatic editorial artwork integrity", () => {
  it("uses the Instagram username when legacy brand fields are empty", () => {
    expect(resolveEditorialIdentity({ brand_name: "", brand_handle: "  ", brand_logo_url: null }, "@conta_teste"))
      .toEqual({ brandName: "conta_teste", brandHandle: "conta_teste", logoUrl: null });
  });

  it("refuses to render without any account identity", () => {
    expect(() => resolveEditorialIdentity({}, "")).toThrow("Identidade da conta indisponível");
  });

  it("requires title, subtitle and CTA copy before rendering", () => {
    expect(() => assertEditorialCopy("Título", "Resumo")).not.toThrow();
    expect(() => assertEditorialCopy("", "Resumo")).toThrow("Título ausente");
    expect(() => assertEditorialCopy("Título", "")).toThrow("Subtítulo ausente");
    expect(() => assertEditorialCopy("Título", "Resumo", "")).toThrow("Texto do botão ausente");
  });

  it("retries a configured logo and accepts only a non-empty image", async () => {
    const fetchImage = vi.fn()
      .mockResolvedValueOnce(response({ ok: false, status: 503 }))
      .mockResolvedValueOnce(response({ ok: true, contentType: "text/html", bytes: [60, 104, 116, 109, 108] }))
      .mockResolvedValueOnce(response({ ok: true, contentType: "image/jpeg", bytes: [0xff, 0xd8, 0xff] }));

    const logo = await fetchRequiredBrandLogo("https://example.com/logo.jpg", fetchImage);

    expect(fetchImage).toHaveBeenCalledTimes(3);
    expect(logo.contentType).toBe("image/jpeg");
    expect(Array.from(logo.bytes)).toEqual([0xff, 0xd8, 0xff]);
  });

  it("blocks the artwork when a configured logo remains unavailable", async () => {
    const fetchImage = vi.fn(async () => response({ ok: false, status: 503 }));

    await expect(fetchRequiredBrandLogo("https://example.com/logo.png", fetchImage))
      .rejects.toThrow("Logo configurado indisponível após 3 tentativas");
    expect(fetchImage).toHaveBeenCalledTimes(3);
  });

  it("versions the public asset URL to bypass a stale CDN object", () => {
    expect(versionPublicAssetUrl("https://cdn.example.com/art.png?download=1", 1234))
      .toBe("https://cdn.example.com/art.png?download=1&v=1234");
  });
});
