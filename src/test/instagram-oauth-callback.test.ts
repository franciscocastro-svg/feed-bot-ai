import { describe, expect, it, vi } from "vitest";
import {
  exchangeLongLivedInstagramToken,
  instagramOAuthRedirect,
  InstagramLongTokenExchangeError,
  publicInstagramOAuthError,
} from "../../supabase/functions/_shared/instagram-oauth";

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Instagram OAuth callback", () => {
  it("exchanges the short token by GET without a second request", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => jsonResponse({
      access_token: "long-lived-token",
      expires_in: 5_184_000,
    }));

    const result = await exchangeLongLivedInstagramToken(
      "short-lived-token",
      "instagram-app-secret",
      fetchMock,
    );

    expect(result).toEqual({
      accessToken: "long-lived-token",
      expiresIn: 5_184_000,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [input, init] = fetchMock.mock.calls[0];
    const requestUrl = new URL(String(input));
    expect(requestUrl.origin + requestUrl.pathname).toBe(
      "https://graph.instagram.com/access_token",
    );
    expect(requestUrl.searchParams.get("grant_type")).toBe("ig_exchange_token");
    expect(requestUrl.searchParams.get("client_secret")).toBe("instagram-app-secret");
    expect(requestUrl.searchParams.get("access_token")).toBe("short-lived-token");
    expect(init?.method).toBe("GET");
  });

  it("uses POST only when Meta explicitly rejects the GET method", async () => {
    const fetchMock = vi.fn<FetchLike>()
      .mockResolvedValueOnce(jsonResponse({
        error: {
          message: "Unsupported request - method type: get",
          type: "IGApiException",
          code: 100,
        },
      }, 400))
      .mockResolvedValueOnce(jsonResponse({
        access_token: "fallback-long-token",
        expires_in: 5_184_000,
      }));

    const result = await exchangeLongLivedInstagramToken(
      "short-token",
      "app-secret",
      fetchMock,
    );

    expect(result.accessToken).toBe("fallback-long-token");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://graph.instagram.com/access_token",
    );
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const body = new URLSearchParams(String(fetchMock.mock.calls[1][1]?.body));
    expect(body.get("grant_type")).toBe("ig_exchange_token");
    expect(body.get("client_secret")).toBe("app-secret");
    expect(body.get("access_token")).toBe("short-token");
  });

  it("does not retry authentication and permission failures", async () => {
    const fetchMock = vi.fn<FetchLike>(async () => jsonResponse({
      error: {
        message: "Invalid OAuth access token.",
        type: "OAuthException",
        code: 190,
      },
    }, 400));

    await expect(exchangeLongLivedInstagramToken(
      "sensitive-short-token",
      "sensitive-app-secret",
      fetchMock,
    )).rejects.toBeInstanceOf(InstagramLongTokenExchangeError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("exposes only a safe error code to the browser", () => {
    const error = new InstagramLongTokenExchangeError({
      message: "upstream details",
      fbtrace_id: "trace-id",
    });

    expect(publicInstagramOAuthError(error)).toBe("long_token_failed");
    expect(publicInstagramOAuthError(new Error("secret upstream response")))
      .toBe("oauth_callback_failed");
  });

  it("returns a real no-store HTTP redirect without an HTML body", async () => {
    const target = "https://fluxifeed.com/dashboard/accounts?ig=connected&u=conta";
    const response = instagramOAuthRedirect(target);

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(target);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(await response.text()).toBe("");
  });
});
