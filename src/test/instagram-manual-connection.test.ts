import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  ManualInstagramInputError,
  normalizeManualInstagramInput,
} from "../../supabase/functions/_shared/instagram-manual-connect";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("manual Instagram connection", () => {
  it("normalizes an Instagram Login token without requiring Meta IDs", () => {
    expect(normalizeManualInstagramInput({
      username: "@cliente.teste",
      access_token: "IG_test_only_not_a_secret_123456789",
      niche: "Notícias",
    })).toEqual({
      accessToken: "IG_test_only_not_a_secret_123456789",
      username: "cliente.teste",
      instagramUserId: null,
      pageId: null,
      niche: "Notícias",
      tokenMode: "instagram_login",
    });
  });

  it("requires both IDs for a Meta Graph API token", () => {
    expect(() => normalizeManualInstagramInput({
      access_token: "test_graph_token_not_a_secret_123456789",
      ig_user_id: "123456789",
    })).toThrowError(ManualInstagramInputError);

    try {
      normalizeManualInstagramInput({
        access_token: "test_graph_token_not_a_secret_123456789",
        ig_user_id: "123456789",
      });
    } catch (error) {
      expect(error).toMatchObject({ code: "facebook_ids_required" });
    }
  });

  it("rejects malformed IDs and tokens before contacting Meta", () => {
    expect(() => normalizeManualInstagramInput({
      access_token: "short",
      ig_user_id: "123",
      page_id: "456",
    })).toThrowError("Informe um Access Token válido da Meta.");

    expect(() => normalizeManualInstagramInput({
      access_token: "test_graph_token_not_a_secret_123456789",
      ig_user_id: "not-numeric",
      page_id: "456",
    })).toThrowError("Instagram Business User ID deve conter somente números.");
  });

  it("keeps token writes behind the authenticated Edge Function", () => {
    const accountsPage = read("src/pages/dashboard/Accounts.tsx");
    const edgeFunction = read("supabase/functions/instagram-manual-connect/index.ts");

    expect(accountsPage).toContain('functions.invoke("instagram-manual-connect"');
    expect(accountsPage).not.toContain('from("instagram_accounts").insert({ ...manualForm');
    expect(accountsPage).toContain("ele não fica salvo nem volta para o navegador");
    expect(edgeFunction).toContain('authorization?.startsWith("Bearer ")');
    expect(edgeFunction).toContain('rpc("is_approved"');
    expect(edgeFunction).toContain('rpc("can_create_resource"');
    expect(edgeFunction).toContain('refreshUrl.searchParams.set("grant_type", "ig_refresh_token")');
    expect(edgeFunction).toContain("access_token: validated.accessToken");
    expect(edgeFunction).not.toContain("user_id: input.");
  });

  it("shows official Meta instructions without exposing credentials to external links", () => {
    const accountsPage = read("src/pages/dashboard/Accounts.tsx");

    expect(accountsPage).toContain("Passo a passo para obter os dados");
    expect(accountsPage).toContain("https://developers.facebook.com/apps/");
    expect(accountsPage).toContain("/instagram-api-with-instagram-login/get-started");
    expect(accountsPage).toContain("/instagram-api-with-facebook-login/get-started");
    expect(accountsPage.match(/rel="noreferrer"/g)).toHaveLength(3);
    expect(accountsPage).not.toContain("access_token=${");
  });

  it("returns only public account metadata after storing the credential", () => {
    const edgeFunction = read("supabase/functions/instagram-manual-connect/index.ts");
    const responseBlock = edgeFunction.slice(edgeFunction.indexOf("return json({\n      ok: true"));

    expect(responseBlock).toContain("token_mode: validated.tokenMode");
    expect(responseBlock).toContain("token_expires_at: validated.tokenExpiresAt");
    expect(responseBlock).not.toContain("access_token:");
    expect(responseBlock).not.toContain("validated.accessToken");
  });
});
