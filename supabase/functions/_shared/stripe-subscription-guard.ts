export const BLOCKING_SUBSCRIPTION_STATUSES = new Set([
  "active",
  "trialing",
  "past_due",
]);

export type StoredSubscriptionForCheckout = {
  approval_status: string | null;
  plan: string | null;
  status: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  terminal_state: boolean | null;
};

export function isBlockingStripeStatus(status: string | null | undefined): boolean {
  return Boolean(status && BLOCKING_SUBSCRIPTION_STATUSES.has(status));
}

export function isBlockingStoredSubscription(
  subscription: StoredSubscriptionForCheckout,
): boolean {
  if (subscription.terminal_state === true) return false;
  if (!isBlockingStripeStatus(subscription.status)) return false;

  // A linha "free" usa status active, mas não representa uma assinatura paga.
  // Assinaturas Stripe e liberações manuais pagas/aprovadas devem impedir um
  // segundo checkout.
  const isStripeBacked = Boolean(subscription.stripe_subscription_id);
  const isApprovedManualPaidPlan =
    !isStripeBacked &&
    subscription.plan !== "free" &&
    subscription.approval_status === "approved";

  return isStripeBacked || isApprovedManualPaidPlan;
}

export function reusableCustomerId(
  subscriptions: StoredSubscriptionForCheckout[],
): string | null {
  return subscriptions.find((subscription) => subscription.stripe_customer_id)
    ?.stripe_customer_id || null;
}

export function customerForCheckout(
  customerId: string | null,
  verifiedEmail: string | null | undefined,
): { customer?: string; customer_email?: string } {
  if (customerId) return { customer: customerId };
  if (verifiedEmail) return { customer_email: verifiedEmail };
  return {};
}
