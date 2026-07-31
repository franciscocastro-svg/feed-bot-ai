import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AlertCircle, CreditCard, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface Props {
  priceId: string;
  returnUrl?: string;
}

type CheckoutState =
  | { kind: "loading" }
  | { kind: "ready"; clientSecret: string }
  | { kind: "existing"; portalAvailable: boolean }
  | { kind: "error"; message: string };

export function StripeEmbeddedCheckout({ priceId, returnUrl }: Props) {
  const [state, setState] = useState<CheckoutState>({ kind: "loading" });
  const [openingPortal, setOpeningPortal] = useState(false);

  useEffect(() => {
    let active = true;
    setState({ kind: "loading" });

    void supabase.functions.invoke("create-checkout", {
      body: {
        priceId,
        returnUrl:
          returnUrl ||
          `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`,
        environment: getStripeEnvironment(),
      },
    }).then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setState({ kind: "error", message: error.message || "Falha ao iniciar checkout" });
        return;
      }
      if (data?.code === "subscription_exists" || data?.existingSubscription === true) {
        setState({ kind: "existing", portalAvailable: data?.portalAvailable === true });
        return;
      }
      if (!data?.clientSecret) {
        setState({ kind: "error", message: "A Stripe não retornou uma sessão válida" });
        return;
      }
      setState({ kind: "ready", clientSecret: data.clientSecret });
    });

    return () => {
      active = false;
    };
  }, [priceId, returnUrl]);

  const openPortal = async () => {
    setOpeningPortal(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-portal-session", {
        body: {
          returnUrl: `${window.location.origin}/pricing`,
          environment: getStripeEnvironment(),
        },
      });
      if (error || !data?.url) {
        throw new Error(error?.message || "Não foi possível abrir o portal");
      }
      window.location.assign(data.url);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Não foi possível abrir o portal",
      );
    } finally {
      setOpeningPortal(false);
    }
  };

  if (state.kind === "loading") {
    return (
      <div className="flex min-h-48 items-center justify-center" aria-live="polite">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        <span className="sr-only">Verificando assinatura</span>
      </div>
    );
  }

  if (state.kind === "existing") {
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-6 text-center">
        <CreditCard className="mx-auto h-8 w-8 text-primary" />
        <h3 className="mt-3 text-lg font-semibold">Você já possui uma assinatura</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Para evitar cobranças duplicadas, um novo checkout não foi aberto.
          Gerencie o plano e o cartão da assinatura atual.
        </p>
        {state.portalAvailable ? (
          <Button className="mt-5" onClick={openPortal} disabled={openingPortal}>
            {openingPortal ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="mr-2 h-4 w-4" />
            )}
            Gerenciar assinatura atual
          </Button>
        ) : (
          <p className="mt-4 text-sm font-medium">
            Seu plano atual foi liberado sem cobrança pela Stripe. Fale com o suporte
            para fazer alterações.
          </p>
        )}
      </div>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-sm">
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
          <div>
            <p className="font-semibold">Não foi possível iniciar o checkout</p>
            <p className="mt-1 text-muted-foreground">{state.message}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="checkout">
      <EmbeddedCheckoutProvider
        stripe={getStripe()}
        options={{ clientSecret: state.clientSecret }}
      >
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
