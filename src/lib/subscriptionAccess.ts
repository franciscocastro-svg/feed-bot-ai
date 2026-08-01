export type SubscriptionAccessSnapshot = {
  has_access: boolean;
  status: string | null;
  approval_status: string | null;
  reason: string | null;
};

export type SubscriptionAccessView =
  | "allowed"
  | "checkout_required"
  | "verify_email"
  | "pending_approval"
  | "denied"
  | "expired"
  | "payment_issue"
  | "unavailable";

const PAYMENT_ISSUE_REASONS = new Set([
  "canceled",
  "cancelled",
  "incomplete",
  "incomplete_expired",
  "past_due",
  "refunded",
  "unpaid",
]);

export function resolveSubscriptionAccessView(
  access: SubscriptionAccessSnapshot | null,
  isAdmin = false,
): SubscriptionAccessView {
  if (isAdmin || access?.has_access === true) return "allowed";
  if (!access) return "unavailable";

  const reason = String(access.reason || "").trim().toLowerCase();
  const approvalStatus = String(access.approval_status || "").trim().toLowerCase();

  if (["blocked", "rejected"].includes(reason) || ["blocked", "rejected"].includes(approvalStatus)) {
    return "denied";
  }
  if (reason === "email_not_verified") return "verify_email";
  if (reason === "pending_approval") return "pending_approval";
  if (["no_paid_plan", "no_subscription"].includes(reason)) return "checkout_required";
  if (["expired", "past_due_expired"].includes(reason)) return "expired";
  if (reason === "access_frozen" || PAYMENT_ISSUE_REASONS.has(reason)) return "payment_issue";

  return "unavailable";
}
