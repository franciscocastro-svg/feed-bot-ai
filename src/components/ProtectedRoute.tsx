import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, MailCheck, XCircle, CreditCard, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { getStripeEnvironment } from "@/lib/stripe";

type SubscriptionAccess = {
  has_access: boolean;
  effective_plan: string;
  status: string;
  approval_status: string;
  reason: string;
  subscription_id: string | null;
} | null;

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const [approval, setApproval] = useState<"loading" | "approved" | "pending" | "rejected">("loading");
  const [subscription, setSubscription] = useState<SubscriptionAccess>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const { signOut } = useAuth();

  useEffect(() => {
    if (!user) {
      setApproval("loading");
      setSubscription(null);
      setIsAdmin(false);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const { data: roleData } = await supabase
          .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
        if (cancelled) return;
        if (roleData) {
          setIsAdmin(true);
          setApproval("approved");
          return;
        }

        const environment = getStripeEnvironment();
        const { data: subscriptionData, error: subscriptionError } = await supabase.rpc(
          "compute_subscription_access",
          { _user_id: user.id, _environment: environment },
        );
        if (cancelled) return;
        if (subscriptionError) throw subscriptionError;

        const access = subscriptionData?.[0] || null;
        const status = access?.approval_status || "pending_payment";
        setApproval(
          status === "approved" ? "approved" :
          status === "rejected" || status === "blocked" ? "rejected" : "pending"
        );
        setSubscription(access);
      } catch {
        if (cancelled) return;
        // Never leave a signed-in customer trapped behind an endless loader.
        setApproval("pending");
        setSubscription(null);
      }
    })();

    return () => { cancelled = true; };
  }, [user]);

  if (loading || (user && approval === "loading"))
    return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!user) return <Navigate to="/auth" replace />;

  if (approval === "rejected") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md text-center space-y-4">
          <XCircle className="h-16 w-16 text-destructive mx-auto" />
          <h1 className="text-2xl font-bold">Acesso negado</h1>
          <p className="text-muted-foreground">
            Seu cadastro foi rejeitado pelo administrador. Entre em contato para mais informações.
          </p>
          <p className="text-sm text-muted-foreground">{user.email}</p>
          <Button variant="outline" onClick={() => signOut()}>Sair</Button>
        </div>
      </div>
    );
  }

  const hasCardBackedAccess =
    isAdmin ||
    (!!subscription &&
      (subscription.has_access ||
        (!!subscription.subscription_id &&
          ["trialing", "active", "past_due"].includes(subscription.status) &&
          ["email_not_verified", "pending_approval"].includes(subscription.reason))));

  if (!hasCardBackedAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-lg text-center space-y-5">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <CreditCard className="h-8 w-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">Ative seus 7 dias com cartão</h1>
            <p className="text-muted-foreground">
              Para proteger a plataforma contra cadastros curiosos, o painel é liberado somente após cadastrar um cartão na Stripe.
              Você testa por 7 dias e pode cancelar antes da cobrança.
            </p>
          </div>
          <div className="rounded-lg border bg-card p-4 text-left text-sm text-muted-foreground space-y-2">
            <div className="flex gap-2"><ShieldCheck className="h-4 w-4 text-primary mt-0.5" /> Pagamento seguro pela Stripe.</div>
            <div className="flex gap-2"><ShieldCheck className="h-4 w-4 text-primary mt-0.5" /> Sem acesso ao painel antes do cartão.</div>
            <div className="flex gap-2"><ShieldCheck className="h-4 w-4 text-primary mt-0.5" /> O teste começa após confirmar o checkout.</div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <Button asChild>
              <Link to="/pricing">Cadastrar cartão e iniciar teste</Link>
            </Button>
            <Button variant="outline" onClick={() => signOut()}>Sair</Button>
          </div>
          <p className="text-xs text-muted-foreground">{user.email}</p>
        </div>
      </div>
    );
  }

  if (approval !== "approved") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md text-center space-y-4">
          <MailCheck className="h-16 w-16 text-primary mx-auto" />
          <h1 className="text-2xl font-bold">Confirme seu e-mail</h1>
          <p className="text-muted-foreground">
            Digite o código enviado ao seu e-mail. Após a confirmação, o acesso é liberado automaticamente.
          </p>
          <p className="text-sm text-muted-foreground">{user.email}</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button asChild>
              <Link to={`/verify-email?email=${encodeURIComponent(user.email || "")}`}>Informar código</Link>
            </Button>
            <Button variant="outline" onClick={() => signOut()}>Sair</Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
