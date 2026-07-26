export type ActiveInstagramAccount = {
  id: string;
  username?: string | null;
};

function routingError(code: string, message: string) {
  const error = new Error(message);
  (error as Error & { code?: string }).code = code;
  return error;
}

export function resolveContentInstagramAccount(
  accounts: ActiveInstagramAccount[] | null | undefined,
  requestedAccountId?: string | null,
) {
  const activeAccounts = Array.isArray(accounts)
    ? accounts.filter((account) => Boolean(account?.id))
    : [];

  if (requestedAccountId) {
    const requested = activeAccounts.find((account) => account.id === requestedAccountId);
    if (!requested) {
      throw routingError(
        "instagram_account_invalid",
        "A conta Instagram escolhida não existe, está inativa ou não pertence a este usuário.",
      );
    }
    return requested.id;
  }

  if (activeAccounts.length === 1) return activeAccounts[0].id;
  if (activeAccounts.length === 0) {
    throw routingError(
      "instagram_account_missing",
      "Conecte uma conta Instagram ativa antes de gerar conteúdo.",
    );
  }
  throw routingError(
    "instagram_account_required",
    "Escolha a conta Instagram compatível com esta pauta antes de gerar o conteúdo.",
  );
}
