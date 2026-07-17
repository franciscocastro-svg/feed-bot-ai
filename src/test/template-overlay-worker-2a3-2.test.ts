import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildWorkerImageProxyUrl,
  normalizeWorkerImageOutput,
  requireWorkerImage,
} from "../../worker/image-loading.js";

const worker = readFileSync(resolve(process.cwd(), "worker/index.js"), "utf8");

describe("Template Overlay Worker 2A.3.2", () => {
  it("preserva o canal alfa da moldura no proxy do worker", () => {
    const proxy = buildWorkerImageProxyUrl("https://cdn.example.com/frame.png?version=1", { output: "png" });
    expect(proxy).toContain("output=png");
    expect(proxy).toContain(encodeURIComponent("cdn.example.com/frame.png?version=1"));
    expect(proxy).not.toContain("output=jpg");
  });

  it("mantém JPG para fotos e rejeita formatos desconhecidos", () => {
    expect(normalizeWorkerImageOutput("jpg")).toBe("jpg");
    expect(normalizeWorkerImageOutput("png")).toBe("png");
    expect(normalizeWorkerImageOutput("webp")).toBe("jpg");
    expect(buildWorkerImageProxyUrl("https://cdn.example.com/photo.jpg")).toContain("output=jpg");
  });

  it("carrega a moldura como PNG e a desenha somente depois da foto", () => {
    expect(worker).toContain('output: usesOverlayFrame ? "png" : "jpg"');
    const photo = worker.indexOf("if (cfg.showPhoto)");
    const frame = worker.indexOf("if (usesOverlayFrame && templateBackground)", photo);
    expect(photo).toBeGreaterThan(-1);
    expect(frame).toBeGreaterThan(photo);
  });

  it("preserva transparência de logos e elementos de marca", () => {
    expect(worker).toContain('{ output: "png", assetLabel: "elemento de marca" }');
    expect(worker).toContain('{ output: "png", assetLabel: "logo da marca" }');
  });

  it("interrompe a renderização quando foto ou arte obrigatória não carrega", () => {
    expect(() => requireWorkerImage(null, "foto indisponível")).toThrow("foto indisponível");
    expect(worker).toContain("Template exige foto, mas a notícia não possui imagem");
    expect(worker).toContain("Foto da notícia indisponível; renderização será tentada novamente.");
    expect(worker).toContain("Arte configurada do template indisponível; renderização será tentada novamente.");
  });
});
