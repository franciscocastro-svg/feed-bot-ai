import { useState, useEffect } from "react";
import { SEO } from "@/components/SEO";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check, Sparkles, MessageCircle, ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { usePlanUsage } from "@/hooks/usePlanUsage";
import { toast } from "sonner";

const WHATSAPP_BUSINESS = "5547996080134";

// Maps internal plan key -> Stripe price lookup_key
const PRICE_ID_MAP: Record<string, string | null> = {
  free: null,
  starter: "starter_monthly",
  pro: "pro_monthly",
  business: null, // negotiable / contact sales
};

const HIGHLIGHT_PLAN = "pro";

function parseWhatsAppNumber(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return digits;
}

function whatsappLink(number: string, message = "Quero o plano Business"): string | null {
  const digits = parseWhatsAppNumber(number);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function formatPrice(brl: number | null | undefined, isNegotiable: boolean): string {
  if (isNegotiable) return "Sob consulta";
  if (brl === null || brl === undefined) return "Sob consulta";
  if (Number(brl) === 0) return "R$ 0";
  return `R$ ${Number(brl).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtLimit(n: number | null | undefined, suffix: string): string {
  if (n === null || n === undefined) return `${suffix} ilimitado`;
  if (n === -1) return `${suffix} ilimitado`;
  return `${n} ${suffix}`;
}

function buildFeatures(p: any): string[] {
  const features: string[] = [];
  features.push(fmtLimit(p.max_ig_accounts, p.max_ig_accounts === 1 ? "conta Instagram" : "contas Instagram"));
  features.push(fmtLimit(p.max_posts_per_day, "posts/dia"));
  features.push(fmtLimit(p.max_rss_sources, "fontes RSS"));
  features.push(fmtLimit(p.max_reels_per_month, "reels IA/mês"));
  features.push(fmtLimit(p.max_images_per_month, "imagens IA/mês"));
  features.push(fmtLimit(p.max_templates, p.max_templates === 1 ? "template" : "templates"));
  if (p.auto_publish_enabled) features.push("Auto-publicação");
  if (p.translation_enabled) features.push("Tradução & adaptação BR 🌍");
  const support = p.is_negotiable ? "Suporte por WhatsApp" : (p.plan === "pro" ? "Suporte prioritário" : "Suporte por email");
  features.push(support);
  return features;
}

export default function Pricing() {
  const { user } = useAuth();
  const { usage } = usePlanUsage();
  const navigate = useNavigate();
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [selectedPriceId, setSelectedPriceId] = useState<string | null>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("plan_limits")
        .select("*")
        .neq("plan", "expired")
        .order("sort_order");
      if (error) toast.error(error.message);
      setPlans(data || []);
      setLoading(false);
    })();
  }, []);

  const openCheckout = (priceId: string) => {
    if (!user) {
      toast.info("Faça login para assinar um plano");
      navigate(`/auth?redirect=${encodeURIComponent(`/pricing?plan=${priceId}`)}`);
      return;
    }
    setSelectedPriceId(priceId);
    setCheckoutOpen(true);
  };

  const [searchParams] = useSearchParams();
  useEffect(() => {
    const plan = searchParams.get("plan");
    if (plan && Object.values(PRICE_ID_MAP).includes(plan)) {
      if (!user) return; // wait until auth resolves; if still no user, user must log in via button
      setSelectedPriceId(plan);
      setCheckoutOpen(true);
    }
  }, [searchParams, user]);

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(user ? "/dashboard" : "/");
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO
        title="Planos e Preços — NewsFlow"
        description="Escolha o plano ideal para automatizar seu Instagram: Free trial 7 dias, Starter, Pro e Business. Reescrita com IA, agendamento e publicação automática."
        path="/pricing"
      />
      <PaymentTestModeBanner />
      <div className="max-w-7xl mx-auto p-6 space-y-8">
        <div className="pt-4">
          <Button variant="ghost" size="sm" onClick={handleBack} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
        </div>
        <header className="text-center space-y-3 py-4">
          <Badge variant="secondary" className="mx-auto"><Sparkles className="h-3 w-3 mr-1" /> Planos</Badge>
          <h1 className="font-display text-4xl md:text-5xl font-bold">Escolha seu plano</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Automatize seu Instagram com IA. Cancele quando quiser.
          </p>
        </header>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {plans.map((p) => {
              const isCurrent = usage?.plan === p.plan;
              const highlight = p.plan === HIGHLIGHT_PLAN;
              const priceId = PRICE_ID_MAP[p.plan] ?? null;
              const isFree = p.plan === "free";
              const isBusinessContact = p.is_negotiable;
              const features = buildFeatures(p);
              const subtitle = isFree
                ? (p.trial_days ? `Trial ${p.trial_days} dias` : "Grátis")
                : isBusinessContact ? "negociado" : "/mês";

              return (
                <Card key={p.plan} className={`p-6 flex flex-col relative ${highlight ? "border-primary shadow-lg ring-2 ring-primary/20" : ""}`}>
                  {highlight && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2">Mais popular</Badge>
                  )}
                  <div className="space-y-1 mb-4">
                    <h3 className="text-xl font-bold">{p.display_name || p.plan}</h3>
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold">{formatPrice(p.price_brl, p.is_negotiable)}</span>
                      <span className="text-sm text-muted-foreground">{subtitle}</span>
                    </div>
                  </div>
                  <ul className="space-y-2 mb-6 flex-1">
                    {features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  {isCurrent ? (
                    <Button disabled variant="secondary" className="w-full">Plano atual</Button>
                  ) : isBusinessContact ? (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => {
                        const link = whatsappLink(WHATSAPP_BUSINESS);
                        if (link) window.open(link, "_blank", "noopener,noreferrer");
                        else toast.error("Número de WhatsApp inválido. Contate o suporte.");
                      }}
                    >
                      <MessageCircle className="h-4 w-4 mr-2" /> Falar com vendas
                    </Button>
                  ) : priceId ? (
                    <Button onClick={() => openCheckout(priceId)} className="w-full" variant={highlight ? "default" : "outline"}>
                      Assinar {p.display_name || p.plan}
                    </Button>
                  ) : (
                    <Button disabled variant="secondary" className="w-full">Trial grátis</Button>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Finalizar assinatura</DialogTitle></DialogHeader>
          {selectedPriceId && (
            <StripeEmbeddedCheckout
              priceId={selectedPriceId}
              customerEmail={user?.email || undefined}
              userId={user?.id}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
