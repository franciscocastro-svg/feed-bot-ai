import { describe, expect, it } from "vitest";
import { statusLabelPt } from "@/lib/statusLabels";

describe("statusLabelPt", () => {
  it.each([
    ["pending", "Pendente"],
    ["processed", "Processado"],
    ["posted", "Publicado"],
    ["posting", "Publicando"],
    ["awaiting_container", "Aguardando Instagram"],
    ["trialing", "Período de teste"],
    ["pending_approval", "Aguardando aprovação"],
  ])("traduz %s para português", (status, expected) => {
    expect(statusLabelPt(status)).toBe(expected);
  });

  it("trata valor vazio sem expor estado técnico", () => {
    expect(statusLabelPt(null)).toBe("Não informado");
  });

  it("preserva rótulos já apresentados em português", () => {
    expect(statusLabelPt("Em revisão manual")).toBe("Em revisão manual");
  });

  it("não exibe um novo código técnico ainda não traduzido", () => {
    expect(statusLabelPt("new_internal_status")).toBe("Estado não reconhecido");
  });
});
