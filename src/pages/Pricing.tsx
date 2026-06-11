import { useState, useEffect } from "react";
import { SEO } from "@/components/SEO";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Check, CreditCard, Instagram, Loader2, MessageCircle, ShieldCheck, Sparkles, Zap } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { usePlanUsage } from "@/hooks/usePlanUsage";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

const WHATSAPP_BUSINESS = "5547996080134";
type PlanLimit = Database["public"]["Tables"]["plan_limits"]["Row"];

// Maps internal plan key -> Stripe price lookup_key
const PRICE_ID_MAP: Record<string, string | null> = {
  free: null,
  starter: "starter_monthly",
  pro: "pro_monthly",
  business: null, // negotiable / contact sales
};

const HIGHLIGHT_PLAN = "pro";

const PLAN_POSITIONING: Record<string, { bestFor: string; promise: string }> = {
  free: {
    bestFor: "Teste antigo",
    promise: "O acesso agora exige cartão para ativar o teste.",
  },
  starter: {
    bestFor: "Teste com cartão",
    promise: "7 dias para validar o fluxo antes da primeira cobrança.",
  },
  pro: {
    bestFor: "Criadores e agências",
    promise: "7 dias grátis com cartão e mais volume para escalar com controle.",
  },
  business: {
    bestFor: "Operações com várias contas",
    promise: "Para portais, times e projetos que precisam de acompanhamento próximo.",
  },
};

const TRUST_ITEMS = [
  { icon: CreditCard, title: "Pagamento seguro", text: "Checkout processado pela Stripe." },
  { icon: Instagram, title: "API oficial", text: "Publicação via Meta Graph API." },
  { icon: ShieldCheck, title: "Controle anti-excesso", text: "Intervalos, limites e fila por conta." },
  { icon: Zap, title: "7 dias com cartão", text: "O teste começa após confirmar o checkout." },
];

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

function buildFeatures(p: PlanLimit): string[] {
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
  const [plans, setPlans] = useState<PlanLimit[]>([]);
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
        title="Planos do NewsFlow — preços e recursos"
        description="Planos do NewsFlow para automatizar Instagram com IA: reescrita por IA, geração de Reels, agendamento e publicação pela API oficial da Meta."
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
          <h1 className="font-display text-4xl md:text-5xl font-bold">Planos do NewsFlow</h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Escolha o plano ideal e ative 7 dias de teste com cartão. Para proteger a plataforma contra curiosos, o painel é liberado após cadastrar o cartão na Stripe. Cancele antes da cobrança se não quiser continuar.
          </p>
        </header>

        <div className="grid gap-3 md:grid-cols-4">
          {TRUST_ITEMS.map((item) => (
            <div key={item.title} className="rounded-xl border border-border/60 bg-card/70 p-4">
              <item.icon className="h-5 w-5 text-primary" />
              <div className="mt-3 text-sm font-semibold">{item.title}</div>
              <div className="mt-1 text-xs text-muted-foreground">{item.text}</div>
            </div>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 max-w-5xl mx-auto">
            {plans.filter((p) => p.plan !== "free").map((p) => {
              const isCurrent = usage?.plan === p.plan;
              const highlight = p.plan === HIGHLIGHT_PLAN;
              const priceId = PRICE_ID_MAP[p.plan] ?? null;
              const isBusinessContact = p.is_negotiable;
              const features = buildFeatures(p);
              const positioning = PLAN_POSITIONING[p.plan] || {
                bestFor: "Plano flexível",
                promise: "Escolha o volume ideal para sua rotina.",
              };
              const subtitle = isBusinessContact ? "negociado" : "/mês após 7 dias";

              return (
                <Card key={p.plan} className={`p-6 flex flex-col relative min-h-[460px] ${highlight ? "border-primary shadow-lg ring-2 ring-primary/20 pt-8" : ""}`}>
                  {highlight && <div className="absolute inset-x-0 top-0 h-1 rounded-t-xl bg-gradient-brand" />}
                  {highlight && (
                    <Badge className="absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap px-3">
                      Mais popular
                    </Badge>
                  )}
                  <div className="space-y-1 mb-4">
                    <h2 className="text-xl font-bold leading-tight">{p.display_name || p.plan}</h2>
                    <p className="text-xs font-medium text-primary leading-tight">{positioning.bestFor}</p>
                    <div className="flex flex-wrap items-end gap-x-2 gap-y-1 pt-1">
                      <span className={`font-bold leading-none ${isBusinessContact ? "text-3xl" : "text-4xl"}`}>
                        {formatPrice(p.price_brl, p.is_negotiable)}
                      </span>
                      <span className="text-sm text-muted-foreground pb-1">{subtitle}</span>
                    </div>
                    <p className="pt-2 text-xs text-muted-foreground min-h-10">{positioning.promise}</p>
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
                      {highlight ? "Iniciar 7 dias com cartão" : `Testar ${p.display_name || p.plan} por 7 dias`}
                    </Button>
                  ) : (
                    <Button variant="secondary" className="w-full" onClick={() => navigate(user ? "/pricing" : "/auth")}>
                      Escolher plano com cartão
                    </Button>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        <section className="rounded-2xl border border-border/60 bg-card/70 p-6 md:p-8">
          <div className="grid gap-6 md:grid-cols-[1fr_1.2fr] md:items-center">
            <div>
              <Badge variant="secondary">Recomendação</Badge>
              <h2 className="mt-3 font-display text-2xl font-bold">Comece seguro e aumente o ritmo aos poucos</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Para evitar excesso de ações no Instagram, use intervalos maiores nos primeiros dias e aumente volume depois que a conta estiver estável.
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-background/70 p-4">
                <div className="text-sm font-semibold">Conta nova</div>
                <div className="mt-1 text-xs text-muted-foreground">60 a 120 min entre posts.</div>
              </div>
              <div className="rounded-xl bg-background/70 p-4">
                <div className="text-sm font-semibold">Conta ativa</div>
                <div className="mt-1 text-xs text-muted-foreground">30 a 60 min com limite diário.</div>
              </div>
              <div className="rounded-xl bg-background/70 p-4">
                <div className="text-sm font-semibold">Operação alta</div>
                <div className="mt-1 text-xs text-muted-foreground">Use Pro ou Business e monitore a fila.</div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Ativar teste de 7 dias</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Cadastre o cartão com segurança pela Stripe. A cobrança começa somente após o período de teste.
            </p>
          </DialogHeader>
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
