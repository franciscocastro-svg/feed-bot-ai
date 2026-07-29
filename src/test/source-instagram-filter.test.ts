import { describe, expect, it } from "vitest";
import {
  ALL_SOURCES_FILTER,
  SHARED_SOURCES_FILTER,
  isSharedOrUnlinkedSource,
  sourceMatchesInstagramFilter,
} from "@/lib/sourceInstagramFilter";

describe("filtro de fontes por Instagram", () => {
  it("mantém todas as fontes no filtro geral", () => {
    expect(sourceMatchesInstagramFilter([], ALL_SOURCES_FILTER)).toBe(true);
    expect(sourceMatchesInstagramFilter(["ig-a"], ALL_SOURCES_FILTER)).toBe(true);
    expect(sourceMatchesInstagramFilter(["ig-a", "ig-b"], ALL_SOURCES_FILTER)).toBe(true);
  });

  it("mostra uma fonte com múltiplos destinos em cada conta vinculada", () => {
    const linkedAccounts = ["ig-a", "ig-b"];

    expect(sourceMatchesInstagramFilter(linkedAccounts, "ig-a")).toBe(true);
    expect(sourceMatchesInstagramFilter(linkedAccounts, "ig-b")).toBe(true);
    expect(sourceMatchesInstagramFilter(linkedAccounts, "ig-c")).toBe(false);
  });

  it("classifica como compartilhada uma fonte multi-conta ou sem destino", () => {
    expect(isSharedOrUnlinkedSource([])).toBe(true);
    expect(isSharedOrUnlinkedSource(["ig-a"])).toBe(false);
    expect(isSharedOrUnlinkedSource(["ig-a", "ig-b"])).toBe(true);

    expect(sourceMatchesInstagramFilter([], SHARED_SOURCES_FILTER)).toBe(true);
    expect(sourceMatchesInstagramFilter(["ig-a"], SHARED_SOURCES_FILTER)).toBe(false);
    expect(sourceMatchesInstagramFilter(["ig-a", "ig-b"], SHARED_SOURCES_FILTER)).toBe(true);
  });
});
