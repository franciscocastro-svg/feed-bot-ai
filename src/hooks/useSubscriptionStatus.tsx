import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getStripeEnvironment } from "@/lib/stripe";

export interface SubscriptionStatus {
  plan: string;
  effective_plan: string;
  status: string;
  approval_status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  days_remaining: number | null;
  is_trial: boolean;
  is_expired: boolean;
}

export function useSubscriptionStatus() {
  const { user } = useAuth();
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) { setStatus(null); setLoading(false); return; }
    const { data, error } = await supabase.rpc("compute_subscription_access", {
      _user_id: user.id,
      _environment: getStripeEnvironment(),
    });
    const access = data?.[0];
    if (error || !access) {
      setStatus(null);
      setLoading(false);
      return;
    }
    const periodEnd = access.current_period_end;
    const daysRemaining = periodEnd
      ? Math.max(0, Math.ceil((new Date(periodEnd).getTime() - Date.now()) / 86_400_000))
      : null;
    setStatus({
      plan: access.effective_plan,
      effective_plan: access.effective_plan,
      status: access.status || "inactive",
      approval_status: access.approval_status || "pending_payment",
      current_period_end: periodEnd,
      cancel_at_period_end: access.cancel_at_period_end,
      days_remaining: daysRemaining,
      is_trial: access.status === "trialing",
      is_expired: ["expired", "past_due_expired", "refunded", "access_frozen"].includes(access.reason),
    });
    setLoading(false);
  }, [user]);

  useEffect(() => { refetch(); }, [refetch]);
  return { status, loading, refetch };
}
