import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, ChevronLeft, ChevronRight, TrendingUp } from "lucide-react";
import proofInstagramProfile from "@/assets/proof-instagram-profile.jpg";
import proofInstagramInsights from "@/assets/proof-instagram-insights.jpg";
import proofInstagramStories from "@/assets/proof-instagram-stories.jpg";
import proofInstagramAfterProfile from "@/assets/proof-instagram-after-profile.jpg";
import proofInstagramAfterInsights from "@/assets/proof-instagram-after-insights.jpg";
import proofInstagramAfterStories from "@/assets/proof-instagram-after-stories.jpg";

const proofSlides = [
  {
    image: proofInstagramProfile,
    eyebrow: "Primeiro ciclo",
    title: "Perfil com 964 publicações",
    description: "Registro inicial da operação com identidade visual consistente.",
    alt: "Perfil do Instagram no primeiro ciclo da operação Flux & Feed",
  },
  {
    image: proofInstagramInsights,
    eyebrow: "Primeiro ciclo",
    title: "292,6 mil visualizações",
    description: "Painel profissional com 3,3 mil interações e 194 novos seguidores.",
    alt: "Painel profissional do Instagram com 292,6 mil visualizações",
  },
  {
    image: proofInstagramStories,
    eyebrow: "Primeiro ciclo",
    title: "Stories em operação",
    description: "Conteúdo publicado com visualizações recorrentes.",
    alt: "Stories do Instagram com contagem de visualizações",
  },
  {
    image: proofInstagramAfterProfile,
    eyebrow: "Após 30 dias",
    title: "Perfil com 8.208 seguidores",
    description: "Total atual confirmado diretamente no perfil do Instagram.",
    alt: "Perfil do Instagram após 30 dias com 8.208 seguidores",
  },
  {
    image: proofInstagramAfterInsights,
    eyebrow: "Após 30 dias",
    title: "10,6 milhões de visualizações",
    description: "86 mil interações e 4,5 mil novos seguidores registrados pela Meta até 13 de junho.",
    alt: "Painel profissional do Instagram após 30 dias com 10,6 milhões de visualizações",
  },
  {
    image: proofInstagramAfterStories,
    eyebrow: "Após 30 dias",
    title: "Stories alcançando público real",
    description: "Um dos Stories documentados registrou 311 visualizações.",
    alt: "Story do Instagram após 30 dias com 311 visualizações",
  },
];

type ProofSectionProps = {
  instagramUrl: string;
};

export function ProofSection({ instagramUrl }: ProofSectionProps) {
  const [activeIndex, setActiveIndex] = useState(3);
  const reduceMotion = useReducedMotion();
  const active = proofSlides[activeIndex];

  const previous = () => setActiveIndex((current) => (current - 1 + proofSlides.length) % proofSlides.length);
  const next = () => setActiveIndex((current) => (current + 1) % proofSlides.length);

  return (
    <div className="grid items-center gap-10 lg:grid-cols-[0.82fr_1.18fr] lg:gap-14">
      <div>
        <span className="landing-eyebrow">
          <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
          Operação real documentada
        </span>
        <h2 className="mt-5 font-display text-3xl font-bold leading-tight text-foreground sm:text-5xl">
          Resultado é consequência de uma rotina que consegue{" "}
          <span className="text-gradient">manter consistência.</span>
        </h2>
        <p className="mt-5 text-base leading-7 text-muted-foreground sm:text-lg">
          Os registros abaixo comparam o primeiro ciclo da conta com um período posterior de 30 dias, usando evidências do perfil e do painel profissional da Meta.
        </p>

        <div className="mt-7 grid grid-cols-2 gap-3">
          {[
            ["292,6 mil", "10,6 mi", "visualizações"],
            ["3,3 mil", "86 mil", "interações"],
            ["243", "8.208", "seguidores"],
            ["964", "1.763", "publicações"],
          ].map(([before, after, label]) => (
            <div key={label} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{before}</span>
                <ArrowUpRight className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                <span className="font-semibold text-foreground">{after}</span>
              </div>
              <div className="mt-2 text-xs font-medium text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>

        <a
          href={instagramUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-foreground transition hover:border-primary/30 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          Ver perfil no Instagram
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>

      <div className="relative">
        <div className="absolute -inset-5 rounded-[2rem] bg-primary/15 blur-3xl" aria-hidden="true" />
        <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-card/80 p-3 shadow-2xl shadow-black/25 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="font-display text-base font-semibold text-foreground">Evolução comprovada</div>
              <div className="mt-0.5 text-xs text-muted-foreground">Selecione cada registro para conferir</div>
            </div>
            <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-medium text-emerald-300">
              Evidência real
            </span>
          </div>

          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-white/10 bg-background/70">
            <AnimatePresence mode="wait">
              <motion.img
                key={active.image}
                src={active.image}
                alt={active.alt}
                initial={reduceMotion ? false : { opacity: 0, scale: 1.02 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.35 }}
                className="absolute inset-0 h-full w-full object-cover object-top"
                loading="lazy"
                width={960}
                height={720}
              />
            </AnimatePresence>
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/90 to-transparent px-5 pb-5 pt-20">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">{active.eyebrow}</div>
              <div className="mt-1 font-display text-base font-semibold text-foreground sm:text-lg">{active.title}</div>
              <div className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">{active.description}</div>
            </div>
            <button
              type="button"
              onClick={previous}
              className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-background/85 text-foreground backdrop-blur transition hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Ver evidência anterior"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={next}
              className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-background/85 text-foreground backdrop-blur transition hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Ver próxima evidência"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="mt-3 grid grid-cols-6 gap-2" aria-label="Escolher evidência">
            {proofSlides.map((slide, index) => (
              <button
                key={slide.title}
                type="button"
                onClick={() => setActiveIndex(index)}
                aria-label={`Ver ${slide.title}`}
                aria-pressed={index === activeIndex}
                className={`relative aspect-square overflow-hidden rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                  index === activeIndex ? "border-primary ring-1 ring-primary/40" : "border-white/10 opacity-60 hover:opacity-100"
                }`}
              >
                <img src={slide.image} alt="" className="h-full w-full object-cover object-top" loading="lazy" width={96} height={96} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
