import { motion, useReducedMotion } from "framer-motion";
import type { IconContent } from "./landingContent";

type TimelineProps = {
  steps: IconContent[];
};

export function Timeline({ steps }: TimelineProps) {
  const reduceMotion = useReducedMotion();

  return (
    <ol className="relative grid gap-5 lg:grid-cols-4">
      <div className="pointer-events-none absolute left-[12.5%] right-[12.5%] top-[52px] hidden h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-primary/50 to-transparent lg:block" aria-hidden="true" />
      {steps.map((step, index) => {
        const Icon = step.icon;
        return (
          <motion.li
            key={step.title}
            initial={reduceMotion ? false : { opacity: 0, y: 22 }}
            whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.4, delay: Math.min(index * 0.08, 0.24) }}
            className="relative z-10 rounded-3xl border border-white/10 bg-card p-6"
          >
            <div className="mb-5 flex items-center justify-between">
              <span className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-brand text-primary-foreground shadow-glow">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <span className="font-display text-sm font-bold text-primary/80">
                {String(index + 1).padStart(2, "0")}
              </span>
            </div>
            <h3 className="font-display text-lg font-semibold text-foreground">{step.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.text}</p>
          </motion.li>
        );
      })}
    </ol>
  );
}
