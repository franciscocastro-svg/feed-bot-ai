import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Sources from "@/pages/dashboard/Sources";

vi.mock("@/integrations/supabase/client", () => {
  const rows: Record<string, unknown[]> = {
    news_sources: [
      {
        id: "source-1",
        name: "Fonte com um nome extremamente longo para uma tela pequena",
        url: "https://example.test/noticias/um-caminho-muito-longo-que-nao-pode-alargar-a-tela",
        niche: "RSS: tecnologia e inovação",
        source_kind: "rss",
        fetch_interval_minutes: 60,
        active: true,
        last_fetched_at: null,
      },
    ],
    instagram_accounts: [{ id: "ig-1", username: "conta_teste", active: true }],
    news_source_instagram_accounts: [
      { source_id: "source-1", instagram_account_id: "ig-1" },
    ],
  };

  const query = (data: unknown) => {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "order", "eq", "delete", "update", "insert", "single", "maybeSingle"]) {
      builder[method] = () => builder;
    }
    builder.then = (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data, error: null }).then(resolve);
    return builder;
  };

  return {
    supabase: {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-1" } } }) },
      from: vi.fn((table: string) => query(rows[table] ?? [])),
      rpc: vi.fn().mockResolvedValue({
        data: [{ translation_enabled: true, display_name: "Pro", plan: "pro" }],
        error: null,
      }),
      functions: { invoke: vi.fn().mockResolvedValue({ data: {}, error: null }) },
    },
  };
});

describe("Sources mobile layout", () => {
  it("keeps long source content contained and opens a scrollable add dialog", async () => {
    render(
      <MemoryRouter>
        <Sources />
      </MemoryRouter>,
    );

    const sourceName = await screen.findByText(
      "Fonte com um nome extremamente longo para uma tela pequena",
      { exact: false },
    );
    expect(sourceName).toHaveClass("break-words");

    const longUrl = screen.getByText(
      "https://example.test/noticias/um-caminho-muito-longo-que-nao-pode-alargar-a-tela",
    );
    expect(longUrl).toHaveClass("break-all");
    expect(screen.getByRole("button", { name: "Editar Fonte com um nome extremamente longo para uma tela pequena" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Nova fonte" }));

    const dialog = await screen.findByRole("dialog", { name: "Adicionar fonte de conteúdo" });
    expect(dialog).toHaveClass("supports-[height:100dvh]:max-h-[calc(100dvh-1rem)]");
    expect(dialog).toHaveClass("overflow-y-auto");
    expect(within(dialog).getByRole("button", { name: "1. Configurar" })).toBeVisible();

    fireEvent.click(within(dialog).getByRole("button", { name: "3. Publicação" }));
    await waitFor(() => {
      expect(within(dialog).getByText("Publicar nestes Instagram", { exact: false })).toBeVisible();
    });
    expect(within(dialog).getByRole("button", { name: "Voltar" })).toBeVisible();
  });
});
