import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Pause, Play, Sparkles } from "lucide-react";
import { workflowSteps } from "./landingContent";

export function WorkflowAnimation() {
  const reduceMotion = useReducedMotion();
  const [activeStep, setActiveStep] = useState(0);
  const [playing, setPlaying] = useState(!reduceMotion);

  useEffect(() => {
    if (reduceMotion) setPlaying(false);
  }, [reduceMotion]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setActiveStep((current) => (current + 1) % workflowSteps.length);
    }, 2200);
    return () => window.clearInterval(timer);
  }, [playing]);

  const active = workflowSteps[activeStep];
  const ActiveIcon = active.icon;

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-card/65 p-4 shadow-2xl shadow-black/25 sm:p-6 lg:p-8">
      <div className="landing-grid absolute inset-0 opacity-25" aria-hidden="true" />
      <div className="relative">
        <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Demonstração do fluxo</div>
            <h3 className="mt-2 font-display text-xl font-semibold text-foreground sm:text-2xl">
              Uma pauta avançando pela operação
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setPlaying((current) => !current)}
            aria-label={playing ? "Pausar demonstração" : "Continuar demonstração"}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {playing ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
            {playing ? "Pausar" : "Continuar"}
          </button>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <div className="relative grid grid-cols-5 gap-2" aria-label="Etapas da demonstração">
              <div className="absolute left-[8%] right-[8%] top-6 h-px bg-white/10" aria-hidden="true" />
              <motion.div
                className="absolute left-[8%] top-6 h-px origin-left bg-gradient-brand"
                animate={{ width: `${(activeStep / (workflowSteps.length - 1)) * 84}%` }}
                transition={{ duration: reduceMotion ? 0 : 0.5 }}
                aria-hidden="true"
              />
              {workflowSteps.map((step, index) => {
                const Icon = step.icon;
                const isActive = index === activeStep;
                const isComplete = index < activeStep;
                return (
                  <button
                    key={step.shortLabel}
                    type="button"
                    onClick={() => {
                      setActiveStep(index);
                      setPlaying(false);
                    }}
                    aria-pressed={isActive}
                    aria-label={`${index + 1}. ${step.title}`}
                    className="relative z-10 flex min-w-0 flex-col items-center gap-2 rounded-xl py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl border transition-all duration-300 ${
                        isActive
                          ? "border-primary bg-gradient-brand text-primary-foreground shadow-glow"
                          : isComplete
                            ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                            : "border-white/10 bg-background/90 text-muted-foreground"
                      }`}
                    >
                      {isComplete ? <Check className="h-4 w-4" aria-hidden="true" /> : <Icon className="h-4 w-4" aria-hidden="true" />}
                    </span>
                    <span className={`hidden text-[10px] font-medium sm:block ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                      {step.shortLabel}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-7 rounded-2xl border border-white/10 bg-background/65 p-5 sm:p-6 lg:min-h-[190px]">
              <AnimatePresence mode="wait">
                <motion.div
                  key={active.title}
                  initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/[0.12] text-primary">
                      <ActiveIcon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <div className="text-xs font-medium text-primary">Etapa {activeStep + 1} de {workflowSteps.length}</div>
                      <h4 className="font-display text-lg font-semibold text-foreground">{active.title}</h4>
                    </div>
                  </div>
                  <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">{active.text}</p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0b0910]/90 p-4 sm:p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Conteúdo em processamento</span>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-medium text-primary">Automação ativa</span>
            </div>
            <div className="mt-5 overflow-hidden rounded-xl border border-white/10 bg-white/[0.035]">
              <div className="aspect-[4/3] bg-[linear-gradient(135deg,hsl(var(--primary)/0.16),transparent_45%),linear-gradient(315deg,hsl(var(--accent)/0.13),transparent_50%)] p-5">
                <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                  Flux &amp; Feed
                </div>
                <div className="mt-8 max-w-[15rem] font-display text-xl font-bold leading-tight text-foreground sm:text-2xl">
                  Como a tecnologia está mudando o jeito de criar conteúdo
                </div>
                <div className="mt-5 h-2 w-3/4 rounded-full bg-white/10" />
                <div className="mt-2 h-2 w-1/2 rounded-full bg-white/[0.08]" />
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Progresso do fluxo</span>
                <span>{Math.round(((activeStep + 1) / workflowSteps.length) * 100)}%</span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
                <motion.div
                  className="h-full rounded-full bg-gradient-brand"
                  animate={{ width: `${((activeStep + 1) / workflowSteps.length) * 100}%` }}
                  transition={{ duration: reduceMotion ? 0 : 0.45 }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
