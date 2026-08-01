import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AlertTriangle, Clock3, CreditCard, Loader2, MailCheck, ShieldCheck, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { getStripeEnvironment } from "@/lib/stripe";
import { resolveSubscriptionAccessView } from "@/lib/subscriptionAccess";

type SubscriptionAccess = {
  has_access: boolean;
  effective_plan: string;
  status: string | null;
  approval_status: string | null;
  reason: string | null;
  subscription_id: string | null;
} | null;

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const [accessState, setAccessState] = useState<"loading" | "loaded" | "error">("loading");
  const [subscription, setSubscription] = useState<SubscriptionAccess>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const { signOut } = useAuth();

  useEffect(() => {
    if (!user) {
      setAccessState("loading");
      setSubscription(null);
      setIsAdmin(false);
      return;
    }
    let cancelled = false;
    setAccessState("loading");

    (async () => {
      try {
        const { data: roleData } = await supabase
          .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
        if (cancelled) return;
        if (roleData) {
          setIsAdmin(true);
          setSubscription(null);
          setAccessState("loaded");
          return;
        }
        setIsAdmin(false);

        const environment = getStripeEnvironment();
        const { data: subscriptionData, error: subscriptionError } = await supabase.rpc(
          "compute_subscription_access",
          { _user_id: user.id, _environment: environment },
        );
        if (cancelled) return;
        if (subscriptionError) throw subscriptionError;

        const access = subscriptionData?.[0] || null;
        setSubscription(access);
        setAccessState("loaded");
      } catch {
        if (cancelled) return;
        // Fail closed without misrepresenting an availability error as a card requirement.
        setSubscription(null);
        setAccessState("error");
      }
    })();

    return () => { cancelled = true; };
  }, [retryKey, user]);

  if (loading || (user && accessState === "loading"))
    return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!user) return <Navigate to="/auth" replace />;

  if (accessState === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md text-center space-y-4">
          <AlertTriangle className="h-16 w-16 text-amber-500 mx-auto" />
          <h1 className="text-2xl font-bold">Não foi possível verificar seu acesso</h1>
          <p className="text-muted-foreground">
            A consulta da assinatura está temporariamente indisponível. Nenhuma cobrança ou alteração foi realizada.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={() => setRetryKey((current) => current + 1)}>Tentar novamente</Button>
            <Button variant="outline" onClick={() => signOut()}>Sair</Button>
          </div>
        </div>
      </div>
    );
  }

  const accessView = resolveSubscriptionAccessView(subscription, isAdmin);

  if (accessView === "denied") {
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

  if (accessView === "checkout_required") {
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

  if (accessView === "verify_email") {
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

  if (accessView === "pending_approval") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md text-center space-y-4">
          <Clock3 className="h-16 w-16 text-primary mx-auto" />
          <h1 className="text-2xl font-bold">Aguardando aprovação</h1>
          <p className="text-muted-foreground">
            Seu pagamento foi identificado e o acesso está aguardando a validação administrativa.
          </p>
          <p className="text-sm text-muted-foreground">{user.email}</p>
          <Button variant="outline" onClick={() => signOut()}>Sair</Button>
        </div>
      </div>
    );
  }

  if (accessView === "expired" || accessView === "payment_issue") {
    const expired = accessView === "expired";
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md text-center space-y-4">
          <AlertTriangle className="h-16 w-16 text-amber-500 mx-auto" />
          <h1 className="text-2xl font-bold">{expired ? "Sua assinatura expirou" : "Acesso à assinatura indisponível"}</h1>
          <p className="text-muted-foreground">
            {expired
              ? "Revise seu plano para voltar a acessar o painel."
              : "Sua assinatura precisa de atenção. Consulte o suporte antes de iniciar outro checkout."}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button asChild><Link to="/pricing">Ver planos</Link></Button>
            <Button variant="outline" asChild>
              <a href="mailto:contato@fluxifeed.com?subject=Ajuda%20com%20acesso%20ao%20Flux%20%26%20Feed">Falar com suporte</a>
            </Button>
            <Button variant="ghost" onClick={() => signOut()}>Sair</Button>
          </div>
        </div>
      </div>
    );
  }

  if (accessView === "unavailable") {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md text-center space-y-4">
          <AlertTriangle className="h-16 w-16 text-amber-500 mx-auto" />
          <h1 className="text-2xl font-bold">Não foi possível liberar seu acesso</h1>
          <p className="text-muted-foreground">
            O estado da assinatura precisa ser revisado. Nenhum cartão é exigido automaticamente por esta mensagem.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button onClick={() => setRetryKey((current) => current + 1)}>Verificar novamente</Button>
            <Button variant="outline" onClick={() => signOut()}>Sair</Button>
          </div>
        </div>
      </div>
    );
  }

  return accessView === "allowed" ? <>{children}</> : null;
};
