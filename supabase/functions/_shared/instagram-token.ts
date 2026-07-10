type RpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{
    data: unknown;
    error: { message?: string } | null;
  }>;
};

export async function getInstagramToken(admin: RpcClient, accountId: string): Promise<string> {
  const { data, error } = await admin.rpc("get_instagram_account_secret", {
    _account_id: accountId,
  });
  if (error) throw new Error(error.message || "Não foi possível abrir a credencial do Instagram.");
  const token = typeof data === "string" ? data.trim() : "";
  if (!token) throw new Error("Conta Instagram sem credencial ativa.");
  return token;
}

export async function attachInstagramTokens<T extends { instagram_account_id?: string | null; instagram_accounts?: Record<string, unknown> | null }>(
  admin: RpcClient,
  rows: T[],
): Promise<T[]> {
  const tokenByAccount = new Map<string, string>();
  const accountIds = Array.from(new Set(rows.map((row) => row.instagram_account_id).filter((id): id is string => Boolean(id))));
  await Promise.all(accountIds.map(async (accountId) => {
    try {
      tokenByAccount.set(accountId, await getInstagramToken(admin, accountId));
    } catch {
      tokenByAccount.set(accountId, "");
    }
  }));

  return rows.map((row) => ({
    ...row,
    instagram_accounts: row.instagram_accounts && row.instagram_account_id
      ? { ...row.instagram_accounts, access_token: tokenByAccount.get(row.instagram_account_id) || null }
      : row.instagram_accounts,
  }));
}
