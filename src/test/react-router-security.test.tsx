import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  Link,
  MemoryRouter,
  Outlet,
  Route,
  Routes,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import OAuthConsent from "@/pages/OAuthConsent";
import { resolvePostAuthRedirect } from "@/lib/safeRedirect";

const authMocks = vi.hoisted(() => ({
  getAuthorizationDetails: vi.fn(),
  approveAuthorization: vi.fn(),
  denyAuthorization: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    signOut: vi.fn(),
  }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession: authMocks.getSession,
      oauth: {
        getAuthorizationDetails: authMocks.getAuthorizationDetails,
        approveAuthorization: authMocks.approveAuthorization,
        denyAuthorization: authMocks.denyAuthorization,
      },
    },
  },
}));

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="location">{`${location.pathname}${location.search}${location.hash}`}</output>;
}

function AccountRoute() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  return <p>{`account:${id};tab:${searchParams.get("tab")}`}</p>;
}

beforeEach(() => {
  authMocks.getSession.mockResolvedValue({ data: { session: { user: { id: "user-1" } } } });
  authMocks.getAuthorizationDetails.mockResolvedValue({
    data: { client: { name: "Meta Reviewer" } },
    error: null,
  });
  authMocks.approveAuthorization.mockResolvedValue({ data: null, error: null });
  authMocks.denyAuthorization.mockResolvedValue({ data: null, error: null });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("login redirects", () => {
  it("preserves an internal dashboard destination with query and hash", () => {
    expect(
      resolvePostAuthRedirect("/dashboard/accounts/account-1/settings?tab=profile#brand"),
    ).toBe("/dashboard/accounts/account-1/settings?tab=profile#brand");
  });

  it.each([
    "https://attacker.example/collect",
    "//attacker.example/collect",
    "/\\attacker.example/collect",
    "/%5Cattacker.example/collect",
    "/%255Cattacker.example/collect",
    "/dashboard\n/attacker.example",
    "dashboard/accounts",
  ])("rejects unsafe post-auth destination %s", (destination) => {
    expect(resolvePostAuthRedirect(destination)).toBe("/dashboard");
  });
});

describe("React Router 7 declarative compatibility", () => {
  it("matches nested routes, route params and search params", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard/accounts/account-42/settings?tab=identity"]}>
        <Routes>
          <Route path="/dashboard" element={<Outlet />}>
            <Route path="accounts/:id/settings" element={<AccountRoute />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("account:account-42;tab:identity")).toBeInTheDocument();
  });

  it("navigates with Link without losing the query or hash", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Link to="/dashboard/news?status=scheduled#queue">Open queue</Link>
        <LocationProbe />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("link", { name: "Open queue" }));
    expect(screen.getByLabelText("location")).toHaveTextContent(
      "/dashboard/news?status=scheduled#queue",
    );
  });

  it("redirects an unauthenticated dashboard request to login", async () => {
    render(
      <MemoryRouter initialEntries={["/dashboard/news"]}>
        <Routes>
          <Route
            path="/dashboard/news"
            element={
              <ProtectedRoute>
                <p>Private news</p>
              </ProtectedRoute>
            }
          />
          <Route path="/auth" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("location")).toHaveTextContent("/auth");
    });
    expect(screen.queryByText("Private news")).not.toBeInTheDocument();
  });
});

describe("OAuth consent route", () => {
  it("loads the authorization identified by the route query", async () => {
    render(
      <MemoryRouter
        initialEntries={["/.lovable/oauth/consent?authorization_id=authorization-123"]}
      >
        <Routes>
          <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole("heading", { name: "Conectar Meta Reviewer à sua conta" }),
    ).toBeInTheDocument();
    expect(authMocks.getAuthorizationDetails).toHaveBeenCalledWith("authorization-123");
  });

  it("fails closed when OAuth approval has no redirect target", async () => {
    render(
      <MemoryRouter
        initialEntries={["/.lovable/oauth/consent?authorization_id=authorization-123"]}
      >
        <Routes>
          <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Aprovar" }));
    expect(
      await screen.findByText("O servidor de autorização não retornou um redirecionamento."),
    ).toBeInTheDocument();
  });
});
