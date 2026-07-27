import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  ManualInstagramInputError,
  normalizeManualInstagramInput,
  type ManualInstagramConnectionInput,
} from "../_shared/instagram-manual-connect.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GRAPH_VERSION = "v21.0";

type ValidatedInstagramConnection = {
  accessToken: string;
  username: string;
  instagramUserId: string;
  pageId: string | null;
  tokenExpiresAt: string | null;
  tokenMode: ManualInstagramConnectionInput["tokenMode"];
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function metaMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const error = (data as { error?: { message?: unknown } }).error;
  return typeof error?.message === "string" && error.message.trim()
    ? error.message.trim()
    : fallback;
}

function expiresAtFromUnix(value: unknown): string | null {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000).toISOString()
    : null;
}

async function fetchMeta(url: URL): Promise<{ ok: boolean; data: Record<string, unknown> }> {
  const response = await fetch(url);
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  return { ok: response.ok, data };
}

async function validateInstagramLogin(
  input: ManualInstagramConnectionInput,
): Promise<ValidatedInstagramConnection> {
  const meUrl = new URL(`https://graph.instagram.com/${GRAPH_VERSION}/me`);
  meUrl.searchParams.set("fields", "id,user_id,username");
  meUrl.searchParams.set("access_token", input.accessToken);
  const me = await fetchMeta(meUrl);
  const resolvedId = String(me.data.user_id || me.data.id || "");

  if (!me.ok || !resolvedId) {
    throw new ManualInstagramInputError(
      "invalid_access_token",
      `A Meta recusou o token: ${metaMessage(me.data, "não foi possível identificar a conta.")}`,
    );
  }
  if (input.instagramUserId && input.instagramUserId !== resolvedId) {
    throw new ManualInstagramInputError(
      "instagram_id_mismatch",
      "O Instagram Business User ID informado não pertence ao token.",
    );
  }

  const resolvedUsername = String(me.data.username || input.username || "").replace(/^@+/, "");
  if (!resolvedUsername) {
    throw new ManualInstagramInputError("username_not_found", "A Meta não retornou o username da conta.");
  }
  if (input.username && input.username.toLowerCase() !== resolvedUsername.toLowerCase()) {
    throw new ManualInstagramInputError(
      "username_mismatch",
      `O token pertence a @${resolvedUsername}, não a @${input.username}.`,
    );
  }

  const refreshUrl = new URL("https://graph.instagram.com/refresh_access_token");
  refreshUrl.searchParams.set("grant_type", "ig_refresh_token");
  refreshUrl.searchParams.set("access_token", input.accessToken);
  const refreshed = await fetchMeta(refreshUrl);
  const refreshedToken = typeof refreshed.data.access_token === "string"
    ? refreshed.data.access_token.trim()
    : "";
  const expiresIn = Number(refreshed.data.expires_in);
  if (!refreshed.ok || !refreshedToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
    throw new ManualInstagramInputError(
      "long_lived_token_required",
      "O token identifica a conta, mas não é renovável. Gere um Access Token de longa duração e tente novamente.",
    );
  }

  return {
    accessToken: refreshedToken,
    username: resolvedUsername,
    instagramUserId: resolvedId,
    pageId: null,
    tokenExpiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    tokenMode: "instagram_login",
  };
}

async function validateFacebookGraph(
  input: ManualInstagramConnectionInput,
): Promise<ValidatedInstagramConnection> {
  const debugUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/debug_token`);
  debugUrl.searchParams.set("input_token", input.accessToken);
  debugUrl.searchParams.set("access_token", input.accessToken);
  const debug = await fetchMeta(debugUrl);
  const debugData = debug.data.data && typeof debug.data.data === "object"
    ? debug.data.data as Record<string, unknown>
    : {};
  const scopes = Array.isArray(debugData.scopes)
    ? debugData.scopes.filter((scope): scope is string => typeof scope === "string")
    : [];
  const hasPublishPermission = scopes.includes("instagram_content_publish") ||
    scopes.includes("instagram_business_content_publish");

  if (!debug.ok || debugData.is_valid !== true) {
    throw new ManualInstagramInputError(
      "invalid_access_token",
      `A Meta recusou o token: ${metaMessage(debug.data, "token inválido ou expirado.")}`,
    );
  }
  if (!hasPublishPermission) {
    throw new ManualInstagramInputError(
      "missing_publish_permission",
      "O token não possui a permissão instagram_content_publish.",
    );
  }

  let effectiveToken = input.accessToken;
  const accountsUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/me/accounts`);
  accountsUrl.searchParams.set(
    "fields",
    "id,name,access_token,instagram_business_account{id,username}",
  );
  accountsUrl.searchParams.set("limit", "200");
  accountsUrl.searchParams.set("access_token", input.accessToken);
  const managedPages = await fetchMeta(accountsUrl);
  const pages = Array.isArray(managedPages.data.data)
    ? managedPages.data.data as Array<Record<string, unknown>>
    : [];
  const matchingPage = pages.find((page) => String(page.id || "") === input.pageId);
  if (typeof matchingPage?.access_token === "string" && matchingPage.access_token.trim()) {
    effectiveToken = matchingPage.access_token.trim();
  }

  const pageUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${input.pageId}`);
  pageUrl.searchParams.set("fields", "id,name,instagram_business_account{id,username}");
  pageUrl.searchParams.set("access_token", effectiveToken);
  const page = await fetchMeta(pageUrl);
  if (!page.ok || String(page.data.id || "") !== input.pageId) {
    throw new ManualInstagramInputError(
      "page_not_accessible",
      `A Página informada não está acessível com esse token: ${metaMessage(page.data, "verifique o Page ID.")}`,
    );
  }

  const linkedInstagram = page.data.instagram_business_account &&
      typeof page.data.instagram_business_account === "object"
    ? page.data.instagram_business_account as Record<string, unknown>
    : null;
  if (linkedInstagram?.id && String(linkedInstagram.id) !== input.instagramUserId) {
    throw new ManualInstagramInputError(
      "instagram_page_mismatch",
      "A Página informada está vinculada a outro Instagram Business User ID.",
    );
  }

  const instagramUrl = new URL(
    `https://graph.facebook.com/${GRAPH_VERSION}/${input.instagramUserId}`,
  );
  instagramUrl.searchParams.set("fields", "id,username");
  instagramUrl.searchParams.set("access_token", effectiveToken);
  const instagram = await fetchMeta(instagramUrl);
  if (!instagram.ok || String(instagram.data.id || "") !== input.instagramUserId) {
    throw new ManualInstagramInputError(
      "instagram_not_accessible",
      `A conta do Instagram não está acessível com esse token: ${metaMessage(instagram.data, "verifique o Instagram Business User ID.")}`,
    );
  }

  const resolvedUsername = String(instagram.data.username || input.username || "").replace(/^@+/, "");
  if (!resolvedUsername) {
    throw new ManualInstagramInputError("username_not_found", "A Meta não retornou o username da conta.");
  }
  if (input.username && input.username.toLowerCase() !== resolvedUsername.toLowerCase()) {
    throw new ManualInstagramInputError(
      "username_mismatch",
      `O token pertence a @${resolvedUsername}, não a @${input.username}.`,
    );
  }

  let tokenExpiresAt = expiresAtFromUnix(debugData.expires_at);
  if (effectiveToken !== input.accessToken) {
    const pageDebugUrl = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/debug_token`);
    pageDebugUrl.searchParams.set("input_token", effectiveToken);
    pageDebugUrl.searchParams.set("access_token", effectiveToken);
    const pageDebug = await fetchMeta(pageDebugUrl);
    const pageDebugData = pageDebug.data.data && typeof pageDebug.data.data === "object"
      ? pageDebug.data.data as Record<string, unknown>
      : {};
    tokenExpiresAt = expiresAtFromUnix(pageDebugData.expires_at);
  }

  return {
    accessToken: effectiveToken,
    username: resolvedUsername,
    instagramUserId: input.instagramUserId!,
    pageId: input.pageId!,
    tokenExpiresAt,
    tokenMode: "facebook_graph",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authorization } },
    });
    const adminClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "unauthorized" }, 401);

    const { data: approved } = await adminClient.rpc("is_approved", { _uid: user.id });
    if (approved === false) return json({ error: "account_not_approved" }, 403);

    const input = normalizeManualInstagramInput(await req.json().catch(() => null));
    const validated = input.tokenMode === "instagram_login"
      ? await validateInstagramLogin(input)
      : await validateFacebookGraph(input);

    const { data: existing } = await adminClient
      .from("instagram_accounts")
      .select("id")
      .eq("user_id", user.id)
      .eq("ig_user_id", validated.instagramUserId)
      .maybeSingle();

    if (!existing?.id) {
      const { data: quota } = await userClient.rpc("can_create_resource", {
        _user_id: user.id,
        _resource: "ig_account",
      });
      const result = quota as { allowed?: boolean; used?: number; limit?: number } | null;
      if (result?.allowed === false) {
        return json({
          error: "account_limit_reached",
          message: "Limite de contas Instagram atingido para este plano.",
          used: result.used,
          limit: result.limit,
        }, 403);
      }
    }

    const values = {
      user_id: user.id,
      username: validated.username,
      ig_user_id: validated.instagramUserId,
      page_id: validated.pageId,
      access_token: validated.accessToken,
      token_expires_at: validated.tokenExpiresAt,
      niche: input.niche,
      active: true,
      last_verified_at: new Date().toISOString(),
      verification_status: "ready",
    };
    const write = existing?.id
      ? adminClient.from("instagram_accounts").update(values).eq("id", existing.id).select("id").single()
      : adminClient.from("instagram_accounts").insert(values).select("id").single();
    const { data: saved, error: saveError } = await write;
    if (saveError || !saved?.id) {
      throw new Error(saveError?.message || "Não foi possível salvar a conta.");
    }

    await adminClient.from("activity_logs").insert({
      user_id: user.id,
      action: existing?.id ? "instagram_manual_connection_updated" : "instagram_manual_connection_created",
      entity_type: "instagram_account",
      entity_id: saved.id,
      details: {
        token_mode: validated.tokenMode,
        instagram_user_id: validated.instagramUserId,
        page_id: validated.pageId,
      },
    });

    return json({
      ok: true,
      ready: true,
      updated: Boolean(existing?.id),
      account: {
        id: saved.id,
        username: validated.username,
        ig_user_id: validated.instagramUserId,
        page_id: validated.pageId,
        token_mode: validated.tokenMode,
        token_expires_at: validated.tokenExpiresAt,
      },
    });
  } catch (error) {
    if (error instanceof ManualInstagramInputError) {
      return json({ error: error.code, message: error.message }, 422);
    }
    return json({
      error: "manual_connection_failed",
      message: error instanceof Error ? error.message : "Não foi possível conectar a conta.",
    }, 500);
  }
});
