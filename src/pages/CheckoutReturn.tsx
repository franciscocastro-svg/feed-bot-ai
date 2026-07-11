import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export default function CheckoutReturn() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = params.get("session_id");
  const { user } = useAuth();
  const [status, setStatus] = useState<"waiting" | "verify" | "approved" | "timeout">("waiting");

  useEffect(() => {
    if (!user) return;
    // Poll approval_status for up to 45s waiting for the Stripe webhook to
    // land. The browser never approves the account — the webhook is the only
    // signal that unblocks the verification code email.
    let cancelled = false;
    const started = Date.now();
    const tick = async () => {
      const { data } = await supabase
        .from("user_subscriptions")
        .select("approval_status")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const s = data?.approval_status;
      if (s === "approved") { setStatus("approved"); setTimeout(() => navigate("/dashboard", { replace: true }), 800); return; }
      if (s === "pending_email_verification") { setStatus("verify"); setTimeout(() => navigate("/verify-email", { replace: true }), 400); return; }
      if (Date.now() - started > 45_000) { setStatus("timeout"); return; }
      setTimeout(tick, 2000);
    };
    tick();
    return () => { cancelled = true; };
  }, [user, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Helmet>
        <title>Confirmando pagamento — Flux & Feed</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <Card className="p-8 max-w-md text-center space-y-4">
        {status === "waiting" && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto" />
            <h1 className="text-2xl font-bold">Confirmando pagamento…</h1>
            <p className="text-muted-foreground">Aguardando confirmação da Stripe. Isso costuma levar poucos segundos.</p>
          </>
        )}
        {status === "verify" && (
          <>
            <CheckCircle2 className="h-16 w-16 text-primary mx-auto" />
            <h1 className="text-2xl font-bold">Pagamento confirmado</h1>
            <p className="text-muted-foreground">Enviamos um código para o seu e-mail. Redirecionando…</p>
          </>
        )}
        {status === "approved" && (
          <>
            <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
            <h1 className="text-2xl font-bold">Tudo pronto!</h1>
            <p className="text-muted-foreground">Abrindo o painel…</p>
          </>
        )}
        {status === "timeout" && (
          <>
            <h1 className="text-2xl font-bold">Ainda processando</h1>
            <p className="text-muted-foreground">
              O pagamento pode demorar um pouco para ser confirmado. Recarregue esta página em alguns instantes.
            </p>
            <Button onClick={() => window.location.reload()} className="w-full">Recarregar</Button>
          </>
        )}
        {sessionId && <p className="text-xs text-muted-foreground break-all">Ref: {sessionId}</p>}
      </Card>
    </div>
  );
}
