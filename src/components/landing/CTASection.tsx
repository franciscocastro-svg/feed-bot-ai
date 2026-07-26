import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";

type CTASectionProps = {
  isAuthenticated: boolean;
};

export function CTASection({ isAuthenticated }: CTASectionProps) {
  const reduceMotion = useReducedMotion();
  const href = isAuthenticated ? "/dashboard" : "/auth";

  return (
    <section className="landing-section container" aria-labelledby="final-cta-title">
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, scale: 0.98 }}
        whileInView={reduceMotion ? undefined : { opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.55 }}
        className="relative overflow-hidden rounded-[2rem] border border-primary/25 bg-gradient-to-br from-primary/15 via-card/90 to-accent/10 px-6 py-14 text-center shadow-2xl shadow-primary/10 sm:px-10 sm:py-20"
      >
        <div className="landing-grid absolute inset-0 opacity-40" aria-hidden="true" />
        <div className="landing-orb absolute -left-24 top-0 h-64 w-64 bg-primary/25" aria-hidden="true" />
        <div className="landing-orb absolute -right-24 bottom-0 h-64 w-64 bg-accent/20" aria-hidden="true" />
        <div className="relative mx-auto max-w-3xl">
          <span className="landing-eyebrow">Sua próxima pauta já pode entrar em um fluxo melhor</span>
          <h2 id="final-cta-title" className="mt-5 font-display text-3xl font-bold leading-tight text-foreground sm:text-5xl">
            Menos operação repetitiva. Mais conteúdo com consistência.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            Organize fontes, criação, aprovação, agenda e publicação em uma plataforma preparada para acompanhar o crescimento da sua operação.
          </p>
          <Button asChild size="lg" className="mt-8 h-[3.25rem] w-full bg-gradient-brand px-7 text-primary-foreground shadow-glow hover:opacity-90 sm:w-auto">
            <Link to={href}>
              {isAuthenticated ? "Abrir meu painel" : "Começar gratuitamente"}
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            </Link>
          </Button>
          {!isAuthenticated && (
            <div className="mt-5 flex items-center justify-center gap-2 text-xs text-muted-foreground sm:text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              7 dias de teste com cartão cadastrado. Cancele antes da primeira cobrança.
            </div>
          )}
        </div>
      </motion.div>
    </section>
  );
}
