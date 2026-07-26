import { motion, useReducedMotion } from "framer-motion";
import type { IconContent } from "./landingContent";

type FeatureCardProps = IconContent & {
  index?: number;
};

export function FeatureCard({ icon: Icon, title, text, index = 0 }: FeatureCardProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.article
      initial={reduceMotion ? false : { opacity: 0, y: 24 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.45, delay: Math.min(index * 0.06, 0.24) }}
      className="landing-card group h-full p-6 sm:p-7"
    >
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-primary/25 bg-primary/10 text-primary transition-colors duration-300 group-hover:bg-primary/15">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </div>
      <h3 className="font-display text-xl font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">{text}</p>
    </motion.article>
  );
}
