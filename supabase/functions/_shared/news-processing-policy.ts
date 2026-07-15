export const STALE_NEWS_PROCESSING_MS = 3 * 60_000;
export const MAX_NEWS_PROCESSING_ATTEMPTS = 3;

export type StaleNewsRecovery = {
  retryCount: number;
  terminal: boolean;
  errorMessage: string;
};

export function decideStaleNewsRecovery(
  currentRetryCount: unknown,
  maxAttempts = MAX_NEWS_PROCESSING_ATTEMPTS,
): StaleNewsRecovery {
  const parsed = Number(currentRetryCount);
  const retryCount = (Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0) + 1;
  const terminal = retryCount >= maxAttempts;
  return {
    retryCount,
    terminal,
    errorMessage: terminal
      ? "Processamento interrompido repetidamente antes da conclusão. Verifique os provedores de IA."
      : `Processamento interrompido antes da conclusão. Recuperado automaticamente (tentativa ${retryCount}/${maxAttempts}).`,
  };
}

export type NewsClaimDecision =
  | "claim"
  | "reclaim_stale"
  | "already_processing"
  | "ignore";

export function decideNewsClaim(
  status: unknown,
  updatedAt: unknown,
  nowMs = Date.now(),
): NewsClaimDecision {
  if (status === "pending" || status === "failed") return "claim";
  if (status !== "processing") return "ignore";

  const updatedAtMs = typeof updatedAt === "string" ? Date.parse(updatedAt) : Number.NaN;
  if (!Number.isFinite(updatedAtMs)) return "already_processing";
  return nowMs - updatedAtMs >= STALE_NEWS_PROCESSING_MS
    ? "reclaim_stale"
    : "already_processing";
}

export function processingErrorMessage(value: unknown): string {
  const message = value instanceof Error ? value.message : String(value || "Falha desconhecida");
  if (/identidade da conta indisponível/i.test(message)) {
    return "Configure o nome ou @ da conta do Instagram antes de processar esta notícia.";
  }
  if (/expired_api_key|invalid api key/i.test(message)) {
    return "O provedor de IA de reserva está indisponível. Verifique a chave configurada.";
  }
  if (/créditos|credits|payment_required/i.test(message)) {
    return "Os provedores de IA estão sem saldo disponível. Tente novamente após regularizar os créditos.";
  }
  return message.slice(0, 500);
}
