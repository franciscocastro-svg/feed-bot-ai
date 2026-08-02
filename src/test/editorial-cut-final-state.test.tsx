import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorialCutPreview } from "@/components/cuts/EditorialCutPreview";

afterEach(cleanup);

const baseProps = {
  clipId: "clip-1",
  accountHandle: "conta.teste",
  format: "reels" as const,
  previewUrl: "https://cdn.test/preview.mp4",
  title: "Título confirmado para o corte",
  comment: "Comentário editorial confirmado para o vídeo de teste.",
  startSeconds: 10,
  endSeconds: 40,
  transcriptText: "Transcrição confirmada para o vídeo de teste.",
  subtitleStyle: "clean" as const,
  onRegenerateText: vi.fn(async () => null),
  onRender: vi.fn(async () => true),
  onSchedule: vi.fn(),
  onDiscard: vi.fn(),
};

describe("estado do vídeo final do Corte Editorial", () => {
  it("mostra a fila e bloqueia solicitações duplicadas", () => {
    render(
      <EditorialCutPreview
        {...baseProps}
        status="rendering"
        finalRenderStatus="queued"
        reviewConfirmedAt="2026-08-02T22:00:00Z"
      />,
    );

    expect(screen.getAllByText("Vídeo final na fila")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Vídeo final na fila" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Aprovar e agendar" })).toBeDisabled();
  });

  it("libera a aprovação assim que o arquivo final confirmado chega", () => {
    render(
      <EditorialCutPreview
        {...baseProps}
        status="draft"
        finalRenderStatus={null}
        videoUrl="https://cdn.test/final.mp4"
        reviewConfirmedAt="2026-08-02T22:00:00Z"
      />,
    );

    expect(screen.getByText("Final revisado")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aprovar e agendar" })).toBeEnabled();
  });
});
