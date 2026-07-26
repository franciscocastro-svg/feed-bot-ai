import { motion, useReducedMotion } from "framer-motion";
import type { IconContent } from "./landingContent";

type BenefitCardProps = IconContent & {
  index?: number;
};

export function BenefitCard({ icon: Icon, title, text, index = 0 }: BenefitCardProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.article
      initial={reduceMotion ? false : { opacity: 0, scale: 0.97 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.06, 0.2) }}
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] p-6"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
      <div className="flex items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-brand text-primary-foreground shadow-glow">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h3 className="font-display text-lg font-semibold text-foreground">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
        </div>
      </div>
    </motion.article>
  );
}
