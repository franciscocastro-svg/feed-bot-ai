import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Crown, CreditCard } from "lucide-react";
import { Link } from "react-router-dom";
import { usePlanUsage, isUnlimited } from "@/hooks/usePlanUsage";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { useState } from "react";
import { toast } from "sonner";

function UsageRow({ label, used, limit }: { label: string; used: number; limit: number }) {
  const unlimited = isUnlimited(limit);
  const pct = unlimited ? 0 : Math.min(100, (used / Math.max(1, limit)) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{used}/{unlimited ? "∞" : limit}</span>
      </div>
      {!unlimited && <Progress value={pct} className="h-1.5" />}
    </div>
  );
}

export function PlanUsageCard() {
  const { usage, loading } = usePlanUsage();
  const [opening, setOpening] = useState(false);
  if (loading || !usage) return null;

  const isPaid = usage.plan !== "free" && usage.plan !== "expired";

  const openPortal = async () => {
    setOpening(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-portal-session", {
        body: { returnUrl: window.location.origin + "/dashboard", environment: getStripeEnvironment() },
      });
      if (error || !data?.url) throw new Error(error?.message || "Erro");
      window.open(data.url, "_blank");
    } catch (e: any) {
      toast.error(e.message || "Não foi possível abrir o portal");
    } finally { setOpening(false); }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Crown className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">{usage.display_name}</span>
        </div>
        <Badge variant="secondary" className="text-xs">{usage.plan}</Badge>
      </div>
      <div className="space-y-2.5">
        <UsageRow label="Reels IA (mês)" used={usage.reels_used} limit={usage.reels_limit} />
        <UsageRow label="Imagens IA (mês)" used={usage.images_used} limit={usage.images_limit} />
        <UsageRow label="Contas Instagram" used={usage.ig_accounts_used} limit={usage.ig_accounts_limit} />
        <UsageRow label="Fontes RSS" used={usage.rss_sources_used} limit={usage.rss_sources_limit} />
        <UsageRow label="Posts hoje" used={usage.posts_today} limit={usage.posts_per_day_limit} />
        <UsageRow
          label="Cortes IA hoje"
          used={(usage.cuts_used_today || 0) + (usage.cuts_reserved_today || 0)}
          limit={usage.cuts_limit ?? 0}
        />
      </div>
      {usage.plan !== "business" && (
        <Button asChild size="sm" variant="outline" className="w-full">
          <Link to="/pricing"><Sparkles className="h-3.5 w-3.5 mr-1" /> Fazer upgrade</Link>
        </Button>
      )}
      {isPaid && (
        <Button size="sm" variant="ghost" className="w-full" onClick={openPortal} disabled={opening}>
          <CreditCard className="h-3.5 w-3.5 mr-1" /> Gerenciar assinatura
        </Button>
      )}
    </Card>
  );
}
