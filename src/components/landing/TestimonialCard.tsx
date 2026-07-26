import { BadgeCheck, Quote } from "lucide-react";

type TestimonialCardProps = {
  quote: string;
  author: string;
  role: string;
  verified?: boolean;
};

export function TestimonialCard({ quote, author, role, verified = false }: TestimonialCardProps) {
  return (
    <figure className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card/80 to-accent/5 p-7 sm:p-9">
      <Quote className="absolute right-7 top-7 h-12 w-12 text-primary/15" aria-hidden="true" />
      <blockquote className="relative max-w-3xl font-display text-xl font-medium leading-relaxed text-foreground sm:text-2xl">
        “{quote}”
      </blockquote>
      <figcaption className="mt-6 flex flex-wrap items-center gap-3 text-sm">
        <span className="font-semibold text-foreground">{author}</span>
        <span className="text-muted-foreground">{role}</span>
        {verified && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Evidências verificadas
          </span>
        )}
      </figcaption>
    </figure>
  );
}
