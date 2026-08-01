import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProtectedRoute } from "@/components/ProtectedRoute";

const mocks = vi.hoisted(() => ({
  maybeSingle: vi.fn(),
  rpc: vi.fn(),
  signOut: vi.fn(),
  user: { id: "11111111-1111-4111-8111-111111111111", email: "cliente@example.com" },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: mocks.user,
    loading: false,
    signOut: mocks.signOut,
  }),
}));

vi.mock("@/lib/stripe", () => ({
  getStripeEnvironment: () => "live",
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: mocks.maybeSingle }),
        }),
      }),
    }),
    rpc: mocks.rpc,
  },
}));

function rpcAccess(overrides: Record<string, unknown> = {}) {
  return {
    has_access: false,
    effective_plan: "free",
    status: "active",
    approval_status: "approved",
    reason: "no_subscription",
    subscription_id: null,
    ...overrides,
  };
}

function renderRoute() {
  return render(
    <MemoryRouter>
      <ProtectedRoute><p>Conteúdo privado</p></ProtectedRoute>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
  mocks.rpc.mockResolvedValue({ data: [rpcAccess()], error: null });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ProtectedRoute subscription access", () => {
  it("allows a valid manual/Pix result with no Stripe subscription id", async () => {
    mocks.rpc.mockResolvedValue({
      data: [rpcAccess({
        has_access: true,
        effective_plan: "pro",
        reason: "active",
        subscription_id: "22222222-2222-4222-8222-222222222222",
      })],
      error: null,
    });
    renderRoute();
    expect(await screen.findByText("Conteúdo privado")).toBeInTheDocument();
  });

  it("does not describe an RPC failure as a missing card and supports retry", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error("temporary") });
    renderRoute();
    expect(await screen.findByRole("heading", { name: "Não foi possível verificar seu acesso" })).toBeInTheDocument();
    expect(screen.queryByText("Ative seus 7 dias com cartão")).not.toBeInTheDocument();

    mocks.rpc.mockResolvedValueOnce({ data: [rpcAccess({ has_access: true, reason: "active" })], error: null });
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(await screen.findByText("Conteúdo privado")).toBeInTheDocument();
    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(2));
  });

  it("offers checkout only when no paid subscription exists", async () => {
    renderRoute();
    expect(await screen.findByRole("heading", { name: "Ative seus 7 dias com cartão" })).toBeInTheDocument();
    expect(screen.queryByText("Conteúdo privado")).not.toBeInTheDocument();
  });

  it("keeps e-mail verification fail-closed", async () => {
    mocks.rpc.mockResolvedValue({ data: [rpcAccess({ reason: "email_not_verified" })], error: null });
    renderRoute();
    expect(await screen.findByRole("heading", { name: "Confirme seu e-mail" })).toBeInTheDocument();
    expect(screen.queryByText("Conteúdo privado")).not.toBeInTheDocument();
  });

  it("shows pending approval without asking for another checkout", async () => {
    mocks.rpc.mockResolvedValue({
      data: [rpcAccess({ approval_status: "pending", reason: "pending_approval" })],
      error: null,
    });
    renderRoute();
    expect(await screen.findByRole("heading", { name: "Aguardando aprovação" })).toBeInTheDocument();
    expect(screen.queryByText("Ative seus 7 dias com cartão")).not.toBeInTheDocument();
  });
});
