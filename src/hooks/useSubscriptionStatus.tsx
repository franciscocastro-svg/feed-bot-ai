import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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
    const { data } = await supabase.rpc("get_subscription_status", { _user_id: user.id });
    setStatus((data as any)?.[0] || null);
    setLoading(false);
  }, [user]);

  useEffect(() => { refetch(); }, [refetch]);
  return { status, loading, refetch };
}
