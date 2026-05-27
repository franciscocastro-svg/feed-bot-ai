import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface PlanUsage {
  plan: string;
  display_name: string;
  reels_used: number;
  reels_limit: number;
  images_used: number;
  images_limit: number;
  ig_accounts_used: number;
  ig_accounts_limit: number;
  rss_sources_used: number;
  rss_sources_limit: number;
  posts_today: number;
  posts_per_day_limit: number;
  auto_publish_enabled: boolean;
  translation_enabled?: boolean;
}

export function usePlanUsage() {
  const { user } = useAuth();
  const [usage, setUsage] = useState<PlanUsage | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) { setUsage(null); setLoading(false); return; }
    const { data } = await supabase.rpc("get_current_usage", { _user_id: user.id });
    setUsage((data as any)?.[0] || null);
    setLoading(false);
  }, [user]);

  useEffect(() => { refetch(); }, [refetch]);

  return { usage, loading, refetch };
}

export function isUnlimited(limit: number) { return limit < 0; }

export function checkResourceLimit(used: number, limit: number) {
  if (isUnlimited(limit)) return { allowed: true, remaining: Infinity };
  return { allowed: used < limit, remaining: Math.max(0, limit - used) };
}
