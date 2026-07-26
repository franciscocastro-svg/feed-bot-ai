import { motion, useReducedMotion } from "framer-motion";

type StatsCardProps = {
  value: string;
  label: string;
  detail: string;
  index?: number;
};

export function StatsCard({ value, label, detail, index = 0 }: StatsCardProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.article
      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.07, 0.2) }}
      className="rounded-3xl border border-white/10 bg-background/60 p-5 text-left shadow-xl shadow-black/10 backdrop-blur-lg sm:p-6"
    >
      <div className="font-display text-3xl font-bold text-gradient sm:text-4xl">{value}</div>
      <div className="mt-2 font-medium text-foreground">{label}</div>
      <div className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</div>
    </motion.article>
  );
}
