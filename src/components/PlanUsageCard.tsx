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

  const isStripeManaged = ["starter", "pro", "business"].includes(usage.plan);

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
        <UsageRow label="Imagens IA (mês)" used={usage.images_used} limit={usage.images_limit} />
        <UsageRow label="Contas Instagram" used={usage.ig_accounts_used} limit={usage.ig_accounts_limit} />
        <UsageRow label="Fontes RSS" used={usage.rss_sources_used} limit={usage.rss_sources_limit} />
        <div className="rounded-lg border border-border/60 bg-background/40 p-2.5 text-xs">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Publicações hoje (todas as contas)</span>
            <span className="font-medium">{usage.posts_today}</span>
          </div>
          <div className="mt-1 flex justify-between gap-3">
            <span className="text-muted-foreground">Limite diário</span>
            <span className="font-medium">
              {isUnlimited(usage.posts_per_day_limit) ? "Ilimitado" : `${usage.posts_per_day_limit} por conta`}
            </span>
          </div>
        </div>
        <UsageRow
          label="Cortes IA hoje"
          used={(usage.cuts_used_today || 0) + (usage.cuts_reserved_today || 0)}
          limit={usage.cuts_limit ?? 0}
        />
      </div>
      {usage.plan !== "agency" && (
        <Button asChild size="sm" variant="outline" className="w-full">
          <Link to="/pricing"><Sparkles className="h-3.5 w-3.5 mr-1" /> Fazer upgrade</Link>
        </Button>
      )}
      {isStripeManaged && (
        <Button size="sm" variant="ghost" className="w-full" onClick={openPortal} disabled={opening}>
          <CreditCard className="h-3.5 w-3.5 mr-1" /> Gerenciar assinatura
        </Button>
      )}
    </Card>
  );
}
