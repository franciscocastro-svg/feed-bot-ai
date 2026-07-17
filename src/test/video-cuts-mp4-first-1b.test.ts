import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const cuts = fs.readFileSync(path.join(process.cwd(), "src/pages/dashboard/Cuts.tsx"), "utf8");

describe("Cortes IA MP4 Primeiro 1B", () => {
  it("abre com MP4 e processamento em nuvem como caminhos recomendados", () => {
    expect(cuts).toContain('useState<InputMode>("upload")');
    expect(cuts).toContain('useState<ProcessingMode>("cloud")');
    expect(cuts).toContain("Enviar MP4 · recomendado");
    expect(cuts).toContain("Na nuvem · recomendado");
  });

  it("explica que o MP4 não depende da captura do YouTube", () => {
    expect(cuts).toContain("não depende do acesso do servidor ao YouTube");
    expect(cuts).toContain("sem depender da captura do YouTube");
  });

  it("mantém o link como opção experimental e alerta sobre bloqueios", () => {
    expect(cuts).toContain("Link do YouTube · experimental");
    expect(cuts).toContain("O YouTube pode bloquear capturas automáticas");
    expect(cuts).toContain("normalizeYoutubeUrl(youtubeUrl)");
  });

  it("preserva as configurações ao trocar um job bloqueado por MP4", () => {
    expect(cuts).toContain("prepareUploadFallback");
    expect(cuts).toContain("Selecionar MP4 com estas configurações");
    expect(cuts).toContain('setProcessingMode("cloud")');
    expect(cuts).toContain("setRequestedClips");
    expect(cuts).toContain("setFormats(job.formats)");
  });

  it("continua exigindo MP4 autorizado e limite de tamanho", () => {
    expect(cuts).toContain('accept="video/mp4,.mp4"');
    expect(cuts).toContain("MAX_UPLOAD_BYTES");
    expect(cuts).toContain("Confirmo que tenho direito/autorização");
  });
});
