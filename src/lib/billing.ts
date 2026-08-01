export const PLAN_LABELS: Readonly<Record<string, string>> = {
  free: "Grátis",
  starter: "Creator",
  pro: "Pro",
  business: "Business",
  agency: "Agência",
  expired: "Expirado",
};

export function planLabel(plan: string | null | undefined): string {
  if (!plan) return "Sem plano";
  const normalized = plan.trim().toLowerCase();
  return PLAN_LABELS[normalized] ?? plan;
}

type SubscriptionValue = {
  plan: string;
  payment_method: "pix" | "stripe" | null;
  amount_paid_brl: number | null;
};

export function subscriptionMonthlyValue(
  subscription: SubscriptionValue,
  catalogPrices: Record<string, number>,
): number {
  const manualPixAmount = Number(subscription.amount_paid_brl);
  if (
    subscription.payment_method === "pix"
    && Number.isFinite(manualPixAmount)
    && manualPixAmount > 0
  ) {
    return manualPixAmount;
  }

  const catalogAmount = Number(catalogPrices[subscription.plan] ?? 0);
  return Number.isFinite(catalogAmount) && catalogAmount > 0 ? catalogAmount : 0;
}
