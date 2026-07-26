import { motion, useReducedMotion } from "framer-motion";
import { Check, MessageCircle, Star } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { LandingPlan } from "./landingContent";

const PLAN_SUBTITLES: Record<string, string> = {
  starter: "Para uma conta em crescimento",
  pro: "Para criadores e agências",
  business: "Para operação com várias contas",
};

const PLAN_CTA: Record<string, { label: string; to?: string; whatsapp?: boolean }> = {
  starter: { label: "Assinar Starter", to: "/pricing?plan=starter_monthly" },
  pro: { label: "Assinar Pro", to: "/pricing?plan=pro_monthly" },
  business: { label: "Falar com vendas", whatsapp: true },
};

const PLAN_BEST_FOR: Record<string, string> = {
  starter: "Uma marca, um nicho e uma rotina simples.",
  pro: "Mais contas, volume e suporte prioritário.",
  business: "Times, portais e operações em escala.",
};

function fmtBRL(value: number | null | undefined, negotiable: boolean): string {
  if (negotiable || value === null || value === undefined) return "Sob consulta";
  if (Number(value) === 0) return "R$ 0";
  return `R$ ${Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function fmtLimit(value: number | null | undefined, label: string): string {
  if (value === null || value === undefined || value === -1) return `${label} ilimitado`;
  return `${value} ${label}`;
}

function buildFeatures(plan: LandingPlan): string[] {
  return [
    fmtLimit(plan.max_ig_accounts, plan.max_ig_accounts === 1 ? "conta Instagram" : "contas Instagram"),
    fmtLimit(plan.max_posts_per_day, "posts/dia"),
    fmtLimit(plan.max_rss_sources, "fontes RSS"),
    fmtLimit(plan.max_reels_per_month, "reels IA/mês"),
    fmtLimit(plan.max_images_per_month, "imagens IA/mês"),
    ...(plan.auto_publish_enabled ? ["Auto-publicação"] : []),
    plan.is_negotiable ? "Suporte por WhatsApp" : plan.plan === "pro" ? "Suporte prioritário" : "Suporte por email",
  ];
}

type PricingSectionProps = {
  plans: LandingPlan[];
  status: "loading" | "ready" | "error";
  whatsappUrl: string;
};

export function PricingSection({ plans, status, whatsappUrl }: PricingSectionProps) {
  const reduceMotion = useReducedMotion();
  const availablePlans = plans.filter((plan) => plan.plan !== "free");

  return (
    <section id="planos" className="landing-section landing-content-auto container scroll-mt-24" aria-labelledby="pricing-title">
      <div className="landing-heading">
        <span className="landing-eyebrow">
          <Star className="h-3.5 w-3.5" aria-hidden="true" />
          Planos conectados ao seu volume
        </span>
        <h2 id="pricing-title" className="landing-title">
          Comece com o que precisa. <span className="text-gradient">Escale quando fizer sentido.</span>
        </h2>
        <p className="landing-description">
          Os valores e limites abaixo são carregados diretamente da configuração comercial atual da plataforma.
        </p>
      </div>

      <div className="mx-auto mt-12 grid max-w-7xl gap-5 md:grid-cols-2 lg:grid-cols-3">
        {status === "loading" && [...Array(3)].map((_, index) => (
          <div key={index} className="h-[450px] animate-pulse rounded-3xl border border-white/10 bg-white/[0.035]" aria-hidden="true" />
        ))}

        {status === "error" && (
          <div className="col-span-full rounded-3xl border border-amber-300/20 bg-amber-300/5 p-8 text-center">
            <h3 className="font-display text-xl font-semibold text-foreground">Planos temporariamente indisponíveis</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Não foi possível carregar os valores agora. A equipe pode apresentar a opção indicada para sua operação.
            </p>
            <Button variant="outline" asChild className="mt-5">
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                Falar com a equipe
              </a>
            </Button>
          </div>
        )}

        {status === "ready" && availablePlans.length === 0 && (
          <div className="col-span-full rounded-3xl border border-white/10 bg-white/[0.035] p-8 text-center">
            <h3 className="font-display text-xl font-semibold text-foreground">Novos planos em configuração</h3>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Fale com nossa equipe para conhecer os limites, valores e opções disponíveis.
            </p>
            <Button variant="outline" asChild className="mt-5">
              <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                Consultar planos
              </a>
            </Button>
          </div>
        )}

        {status === "ready" && availablePlans.map((row, index) => {
          const cta = PLAN_CTA[row.plan] || { label: "Saiba mais", to: "/pricing" };
          const highlight = row.plan === "pro";
          const price = fmtBRL(row.price_brl, row.is_negotiable);
          const features = buildFeatures(row);

          return (
            <motion.article
              key={row.plan}
              initial={reduceMotion ? false : { opacity: 0, y: 24 }}
              whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.45, delay: Math.min(index * 0.08, 0.2) }}
              className={`relative flex flex-col rounded-3xl p-6 sm:p-7 ${
                highlight
                  ? "border border-primary/40 bg-gradient-to-b from-primary/[0.12] to-card/75 shadow-2xl shadow-primary/10"
                  : "border border-white/10 bg-white/[0.035]"
              }`}
            >
              {highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-brand px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-primary-foreground shadow-glow">
                  Mais escolhido
                </span>
              )}
              <div>
                <div className="text-xs font-medium text-primary">{PLAN_SUBTITLES[row.plan] || "Plano Flux & Feed"}</div>
                <h3 className="mt-2 font-display text-2xl font-bold text-foreground">
                  {row.display_name?.split(" (")[0] || row.plan}
                </h3>
                <p className="mt-3 min-h-10 text-sm leading-6 text-muted-foreground">
                  {PLAN_BEST_FOR[row.plan] || "Escolha o volume ideal para sua rotina."}
                </p>
              </div>

              <div className="my-6 border-y border-white/10 py-5">
                <div className="flex flex-wrap items-baseline gap-1.5">
                  <span className={`font-display font-bold text-foreground ${price.length > 7 ? "text-3xl" : "text-4xl"}`}>
                    {price}
                  </span>
                  {!row.is_negotiable && <span className="text-sm text-muted-foreground">/mês</span>}
                </div>
              </div>

              <ul className="mb-7 flex-1 space-y-3 text-sm">
                {features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/[0.12] text-primary">
                      <Check className="h-3 w-3" aria-hidden="true" />
                    </span>
                    <span className="text-foreground/90">{feature}</span>
                  </li>
                ))}
              </ul>

              {cta.whatsapp ? (
                <Button variant="outline" asChild className="h-12 w-full">
                  <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="mr-2 h-4 w-4" aria-hidden="true" />
                    {cta.label}
                  </a>
                </Button>
              ) : (
                <Button asChild variant={highlight ? "default" : "outline"} className={`h-12 w-full ${highlight ? "bg-gradient-brand text-primary-foreground shadow-glow hover:opacity-90" : ""}`}>
                  <Link to={cta.to!}>{cta.label}</Link>
                </Button>
              )}
            </motion.article>
          );
        })}
      </div>

      <p className="mx-auto mt-7 max-w-2xl text-center text-xs leading-5 text-muted-foreground">
        Todos os planos usam publicação pela API oficial da Meta. O ritmo de postagem depende das regras configuradas e das políticas do Instagram.
      </p>
    </section>
  );
}
