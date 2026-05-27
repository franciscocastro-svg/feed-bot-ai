import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Clock, CreditCard, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { useSubscriptionStatus } from "@/hooks/useSubscriptionStatus";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { useState } from "react";
import { toast } from "sonner";

export function SubscriptionBanner() {
  const { status, loading } = useSubscriptionStatus();
  const [opening, setOpening] = useState(false);
  if (loading || !status) return null;

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

  // Expired
  if (status.is_expired) {
    return (
      <Card className="p-4 border-destructive/40 bg-destructive/10 flex items-start gap-3">
        <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">
            {status.is_trial ? "Seu teste grátis acabou" : "Sua assinatura expirou"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Reative um plano para voltar a publicar automaticamente.
          </p>
        </div>
        <Button size="sm" asChild><Link to="/pricing">Ver planos</Link></Button>
      </Card>
    );
  }

  // Past due
  if (status.status === "past_due") {
    return (
      <Card className="p-4 border-warning/40 bg-warning/10 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">Falha no pagamento</p>
          <p className="text-xs text-muted-foreground mt-1">
            Atualize seu cartão antes que sua assinatura seja cancelada.
          </p>
        </div>
        <Button size="sm" onClick={openPortal} disabled={opening}>
          <CreditCard className="h-4 w-4 mr-1" /> Atualizar
        </Button>
      </Card>
    );
  }

  // Trial ending soon
  if (status.is_trial && status.days_remaining !== null && status.days_remaining <= 3) {
    return (
      <Card className="p-4 border-warning/40 bg-warning/10 flex items-start gap-3">
        <Clock className="h-5 w-5 text-warning shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">
            Teste grátis termina em {status.days_remaining} {status.days_remaining === 1 ? "dia" : "dias"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Escolha um plano para continuar publicando sem interrupção.
          </p>
        </div>
        <Button size="sm" asChild><Link to="/pricing">Fazer upgrade</Link></Button>
      </Card>
    );
  }

  // Paid plan ending soon
  if (!status.is_trial && status.days_remaining !== null && status.days_remaining <= 5 && status.cancel_at_period_end) {
    return (
      <Card className="p-4 border-warning/40 bg-warning/10 flex items-start gap-3">
        <Clock className="h-5 w-5 text-warning shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">
            Assinatura termina em {status.days_remaining} {status.days_remaining === 1 ? "dia" : "dias"}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Você cancelou a renovação. Reative para manter o acesso.
          </p>
        </div>
        <Button size="sm" onClick={openPortal} disabled={opening}>Gerenciar</Button>
      </Card>
    );
  }

  return null;
}
