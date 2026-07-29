import { motion, useReducedMotion } from "framer-motion";
import { Check, MessageCircle, Star } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { LandingPlan } from "./landingContent";

const PLAN_SUBTITLES: Record<string, string> = {
  starter: "Para começar com automação de verdade",
  pro: "Para criadores e pequenas equipes",
  business: "Para marcas e operações com várias contas",
  agency: "Para agências, portais e grandes operações",
};

const PLAN_CTA: Record<string, { label: string; to?: string; whatsapp?: boolean }> = {
  starter: { label: "Testar Creator por 7 dias", to: "/pricing?plan=starter_monthly" },
  pro: { label: "Começar 7 dias com Pro", to: "/pricing?plan=pro_monthly" },
  business: { label: "Testar Business por 7 dias", to: "/pricing?plan=business_monthly" },
  agency: { label: "Falar com um especialista", whatsapp: true },
};

const PLAN_BEST_FOR: Record<string, string> = {
  starter: "Mantenha seu Instagram ativo sem produzir cada publicação manualmente.",
  pro: "Gerencie três perfis com conteúdo, horários e estratégias independentes.",
  business: "Escale várias marcas sem misturar fontes, filas ou identidade editorial.",
  agency: "Estrutura personalizada para administrar uma carteira maior de clientes.",
};

function fmtBRL(value: number | null | undefined, negotiable: boolean): string {
  if (negotiable || value === null || value === undefined) return "Sob consulta";
  if (Number(value) === 0) return "R$ 0";
  return `R$ ${Number(value).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function buildFeatures(plan: LandingPlan): string[] {
  const accounts = plan.max_ig_accounts === 1
    ? "1 conta Instagram"
    : `${plan.max_ig_accounts ?? "—"} contas Instagram`;
  const posts = `Até ${plan.max_posts_per_day ?? "—"} publicações/dia por conta`;
  const sources = `${plan.max_rss_sources ?? "—"} fontes de conteúdo`;
  const cuts = `${plan.max_cuts_per_day ?? 0} ${plan.max_cuts_per_day === 1 ? "corte inteligente" : "cortes inteligentes"} por dia`;
  if (plan.plan === "starter") {
    return [accounts, posts, "Todos os formatos", sources, "Perfil de voz personalizado", cuts, "Autopiloto", "Suporte por email"];
  }
  if (plan.plan === "pro") {
    return [accounts, posts, "Todos os formatos", sources, "Voz e nicho por conta", cuts, "Tradução de conteúdo", "Suporte prioritário"];
  }
  if (plan.plan === "business") {
    return [accounts, posts, "Todos os formatos", sources, "Autopiloto por conta", cuts, `${plan.max_templates ?? "Mais"} templates`, "Suporte prioritário"];
  }
  if (plan.plan === "agency") {
    return ["20+ contas ou configuração personalizada", "Volume personalizado por conta", "Operação independente por cliente", "Fontes, templates e cortes personalizados", "Configuração assistida", "Atendimento pelo WhatsApp"];
  }
  return [accounts, posts, sources];
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

      <div className="mx-auto mt-12 grid max-w-7xl gap-5 md:grid-cols-2 xl:grid-cols-4">
        {status === "loading" && [...Array(4)].map((_, index) => (
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
        O limite diário é separado por Instagram e inclui Feed, Reels, Carrosséis e Stories. Um carrossel completo conta como uma publicação. Todos os planos usam a API oficial da Meta.
      </p>
    </section>
  );
}
