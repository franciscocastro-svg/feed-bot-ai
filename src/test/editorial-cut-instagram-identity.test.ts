import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearInstagramEditorialIdentityCache,
  resolveInstagramEditorialIdentity,
  trustedInstagramProfileImageUrl,
} from "../../worker/instagramProfileIdentity.js";

function supabaseFor(account: Record<string, unknown>, token = "private-token") {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: account, error: null })),
  };
  return {
    from: vi.fn(() => query),
    rpc: vi.fn(async () => ({ data: token, error: null })),
  };
}

function jsonResponse(data: Record<string, unknown>, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => data,
  } as Response;
}

describe("identidade Instagram do Corte Editorial", () => {
  beforeEach(() => clearInstagramEditorialIdentityCache());

  it("usa nome, @, foto e selo somente quando a Meta confirma a conta selecionada", async () => {
    const supabase = supabaseFor({
      user_id: "user-1",
      username: "chico.trader1",
      ig_user_id: "ig-1",
      page_id: "page-1",
    });
    const fetchImpl = vi.fn(async (input: URL | RequestInfo) => {
      const fields = new URL(String(input)).searchParams.get("fields");
      if (fields === "id,username,name,profile_picture_url") {
        return jsonResponse({
          id: "ig-1",
          username: "chico.trader1",
          name: "Chico Trader",
          profile_picture_url: "https://scontent.cdninstagram.com/profile.jpg",
        });
      }
      if (fields === "is_verified_user") return jsonResponse({ is_verified_user: true });
      return jsonResponse({}, false, 400);
    });

    await expect(resolveInstagramEditorialIdentity({
      supabase,
      accountId: "account-1",
      userId: "user-1",
      fetchImpl,
      now: 1,
    })).resolves.toEqual({
      name: "Chico Trader",
      handle: "chico.trader1",
      logoUrl: "https://scontent.cdninstagram.com/profile.jpg",
      verified: true,
      source: "meta_profile",
    });
  });

  it("não aceita nome, logo ou selo devolvidos para outro @", async () => {
    const supabase = supabaseFor({
      user_id: "user-1",
      username: "chico.trader1",
      ig_user_id: "ig-1",
      page_id: "page-1",
    });
    const fetchImpl = vi.fn(async () => jsonResponse({
      id: "other",
      username: "Fuxico_Fala",
      name: "Fuxico Fala",
      profile_picture_url: "https://scontent.cdninstagram.com/wrong.jpg",
      is_verified_user: true,
    }));

    await expect(resolveInstagramEditorialIdentity({
      supabase,
      accountId: "account-1",
      userId: "user-1",
      fetchImpl,
      now: 1,
    })).resolves.toEqual({
      name: "chico.trader1",
      handle: "chico.trader1",
      logoUrl: null,
      verified: false,
      source: "selected_account",
    });
  });

  it("mantém o @ correto quando nome ou foto não estão disponíveis na modalidade da API", async () => {
    const supabase = supabaseFor({
      user_id: "user-1",
      username: "chico.trader1",
      ig_user_id: "ig-1",
      page_id: null,
    });
    const fetchImpl = vi.fn(async (input: URL | RequestInfo) => {
      const fields = new URL(String(input)).searchParams.get("fields");
      if (fields === "id,username,name,profile_picture_url") return jsonResponse({}, false, 400);
      if (fields === "id,username") return jsonResponse({ id: "ig-1", username: "chico.trader1" });
      return jsonResponse({}, false, 400);
    });

    const result = await resolveInstagramEditorialIdentity({
      supabase,
      accountId: "account-1",
      userId: "user-1",
      fetchImpl,
      now: 1,
    });
    expect(result).toMatchObject({
      name: "chico.trader1",
      handle: "chico.trader1",
      logoUrl: null,
      verified: false,
      source: "meta_profile",
    });
  });

  it("aceita somente URLs HTTPS dos domínios de imagem da Meta", () => {
    expect(trustedInstagramProfileImageUrl("https://scontent.cdninstagram.com/avatar.jpg")).toBeTruthy();
    expect(trustedInstagramProfileImageUrl("https://example.com/avatar.jpg")).toBeNull();
    expect(trustedInstagramProfileImageUrl("http://scontent.cdninstagram.com/avatar.jpg")).toBeNull();
  });
});
