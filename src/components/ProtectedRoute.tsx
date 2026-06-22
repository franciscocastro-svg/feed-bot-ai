import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Clock, XCircle, CreditCard, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

type SubscriptionAccess = {
  plan: string;
  effective_plan: string;
  status: string;
  is_expired: boolean;
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

        const [{ data: approvalData }, { data: subscriptionData }] = await Promise.all([
          supabase.from("user_subscriptions").select("approval_status").eq("user_id", user.id).maybeSingle(),
          supabase.rpc("get_subscription_status", { _user_id: user.id }),
        ]);
        if (cancelled) return;

        const status = approvalData?.approval_status || "pending";
        setApproval(status === "approved" ? "approved" : status === "rejected" ? "rejected" : "pending");
        setSubscription((subscriptionData as any)?.[0] || null);
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
      subscription.plan !== "free" &&
      subscription.effective_plan !== "free" &&
      subscription.effective_plan !== "expired" &&
      !subscription.is_expired &&
      ["trialing", "active"].includes(subscription.status));

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
          <Clock className="h-16 w-16 text-orange-500 mx-auto" />
          <h1 className="text-2xl font-bold">Aguardando aprovação</h1>
          <p className="text-muted-foreground">
            Seu cartão foi cadastrado e seu acesso está aguardando aprovação manual do administrador.
          </p>
          <p className="text-sm text-muted-foreground">{user.email}</p>
          <Button variant="outline" onClick={() => signOut()}>Sair</Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
