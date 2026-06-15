import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function CheckoutReturn() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const sessionId = params.get("session_id");

  useEffect(() => {
    const t = setTimeout(() => navigate("/dashboard"), 5000);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Helmet>
        <title>Pagamento concluído — Flux & Feed</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <Card className="p-8 max-w-md text-center space-y-4">
        <CheckCircle2 className="h-16 w-16 text-primary mx-auto" />
        <h1 className="text-2xl font-bold">Teste ativado!</h1>
        <p className="text-muted-foreground">
          Seu cartão foi cadastrado e seu plano foi ativado. Você será redirecionado em instantes.
        </p>
        {sessionId && (
          <p className="text-xs text-muted-foreground break-all">Ref: {sessionId}</p>
        )}
        <Button onClick={() => navigate("/dashboard")} className="w-full">Ir para o painel</Button>
      </Card>
    </div>
  );
}
