import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ContextHelp, FieldLabel } from "@/components/ContextHelp";
import { LanguageProvider } from "@/contexts/LanguageContext";

const withLanguage = (children: React.ReactNode) => <LanguageProvider>{children}</LanguageProvider>;

describe("ContextHelp", () => {
  it("mantém a explicação oculta até o usuário pedir ajuda", () => {
    render(withLanguage(
      <ContextHelp label="intervalo entre posts" title="Intervalo seguro">
        Use de 30 a 60 minutos para reduzir bloqueios.
      </ContextHelp>,
    ));

    const trigger = screen.getByRole("button", { name: "Ajuda: intervalo entre posts" });
    expect(trigger).toHaveAttribute("type", "button");
    expect(screen.queryByText("Intervalo seguro")).not.toBeInTheDocument();

    fireEvent.click(trigger);

    expect(screen.getByText("Intervalo seguro")).toBeInTheDocument();
    expect(screen.getByText("Use de 30 a 60 minutos para reduzir bloqueios.")).toBeInTheDocument();
  });

  it("preserva a associação acessível entre o rótulo e o campo", () => {
    render(withLanguage(
      <>
        <FieldLabel htmlFor="daily-posts" helpLabel="posts por dia" help="Limite diário da conta.">
          Posts por dia
        </FieldLabel>
        <input id="daily-posts" />
      </>,
    ));

    expect(screen.getByLabelText("Posts por dia")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ajuda: posts por dia" })).toBeInTheDocument();
  });
});
