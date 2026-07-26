import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, CheckCircle2, CirclePlay, ShieldCheck, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { DashboardPreview } from "./DashboardPreview";

type HeroSectionProps = {
  isAuthenticated: boolean;
};

export function HeroSection({ isAuthenticated }: HeroSectionProps) {
  const reduceMotion = useReducedMotion();
  const primaryHref = isAuthenticated ? "/dashboard" : "/auth";

  return (
    <section className="relative overflow-hidden pb-20 pt-28 sm:pb-24 sm:pt-36 lg:min-h-[860px] lg:pb-28 lg:pt-40" aria-labelledby="hero-title">
      <div className="landing-grid absolute inset-0 opacity-55" aria-hidden="true" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_28%,hsl(var(--primary)/0.19),transparent_32%),radial-gradient(circle_at_82%_36%,hsl(var(--accent)/0.13),transparent_34%)]" aria-hidden="true" />
      <div className="landing-orb absolute -left-40 top-14 h-[420px] w-[420px] bg-primary/20" aria-hidden="true" />
      <div className="landing-orb absolute -right-32 top-40 h-[360px] w-[360px] bg-accent/15" aria-hidden="true" />

      <div className="container relative z-10">
        <div className="grid items-center gap-14 lg:grid-cols-[0.92fr_1.08fr] lg:gap-10 xl:gap-16">
          <div className="text-center lg:text-left">
            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="landing-eyebrow mx-auto lg:mx-0"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Da pauta à publicação em um único fluxo
            </motion.div>

            <motion.h1
              id="hero-title"
              initial={reduceMotion ? false : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.08 }}
              className="mx-auto mt-6 max-w-3xl font-display text-[2.65rem] font-bold leading-[1.03] tracking-[-0.035em] text-foreground sm:text-6xl lg:mx-0 lg:text-[4.4rem] xl:text-[4.9rem]"
            >
              Transforme pautas em conteúdo{" "}
              <span className="text-gradient">pronto para publicar.</span>
            </motion.h1>

            <motion.p
              initial={reduceMotion ? false : { opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.18 }}
              className="mx-auto mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8 lg:mx-0"
            >
              Centralize fontes, IA, design, aprovação, agenda e publicação pela API oficial da Meta.
              Você mantém o controle — o Flux &amp; Feed reduz o trabalho repetitivo.
            </motion.p>

            <motion.div
              initial={reduceMotion ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.26 }}
              className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center lg:justify-start"
            >
              <Button asChild size="lg" className="h-[3.25rem] w-full bg-gradient-brand px-7 text-primary-foreground shadow-glow hover:opacity-90 sm:w-auto">
                <Link to={primaryHref}>
                  {isAuthenticated ? "Abrir meu painel" : "Começar gratuitamente"}
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="h-[3.25rem] w-full border-white/15 bg-white/[0.035] px-7 hover:bg-white/[0.07] sm:w-auto">
                <a href="#demonstracao">
                  <CirclePlay className="mr-2 h-5 w-5 text-primary" aria-hidden="true" />
                  Assistir demonstração
                </a>
              </Button>
            </motion.div>

            <motion.div
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.38 }}
              className="mt-6 flex flex-col items-center gap-2 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:justify-center sm:gap-x-5 lg:justify-start"
            >
              <span className="inline-flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
                7 dias de teste
              </span>
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
                Cartão processado pela Stripe
              </span>
              <span>Cancele antes da primeira cobrança</span>
            </motion.div>
          </div>

          <DashboardPreview />
        </div>

        <div className="mt-14 grid grid-cols-2 gap-3 border-t border-white/10 pt-7 sm:grid-cols-4 lg:mt-20">
          {[
            ["Fontes", "RSS, sites, temas e URLs"],
            ["Criação", "Texto, Feed, Stories e Reels"],
            ["Controle", "Aprovação, agenda e filas"],
            ["Publicação", "API oficial da Meta"],
          ].map(([title, text]) => (
            <div key={title} className="px-2 text-left sm:px-4">
              <div className="font-display text-sm font-semibold text-foreground sm:text-base">{title}</div>
              <div className="mt-1 text-[11px] leading-5 text-muted-foreground sm:text-xs">{text}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
