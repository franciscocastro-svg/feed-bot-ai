import { motion, useReducedMotion } from "framer-motion";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Instagram,
  LayoutDashboard,
  MoreHorizontal,
  Newspaper,
  Sparkles,
} from "lucide-react";

const queueItems = [
  {
    title: "Tecnologia muda a rotina de pequenos negócios",
    meta: "Carrossel · 6 slides",
    status: "Pronto para revisar",
    icon: Sparkles,
    tone: "text-fuchsia-300 bg-fuchsia-400/10",
  },
  {
    title: "Mercado reage a nova decisão de juros",
    meta: "Reel · 00:38",
    status: "Agendado para 12:30",
    icon: CalendarDays,
    tone: "text-orange-300 bg-orange-400/10",
  },
  {
    title: "Novas tendências para criadores em 2026",
    meta: "Feed · imagem 1:1",
    status: "Gerando mídia",
    icon: Clock3,
    tone: "text-violet-300 bg-violet-400/10",
  },
];

export function DashboardPreview() {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 26, rotateX: 4 }}
      animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 0.7, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="relative mx-auto w-full max-w-[680px] [perspective:1200px]"
      aria-label="Prévia ilustrativa do painel Flux & Feed"
    >
      <div className="absolute -inset-6 rounded-[2.5rem] bg-gradient-brand opacity-20 blur-3xl" aria-hidden="true" />
      <div className="relative overflow-hidden rounded-[1.75rem] border border-white/[0.12] bg-[#0f0c14]/95 shadow-[0_34px_100px_rgba(0,0,0,0.55)] backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-5">
          <div className="flex items-center gap-2" aria-hidden="true">
            <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/80" />
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-medium text-muted-foreground sm:text-xs">
            Operação em tempo real
          </div>
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>

        <div className="grid min-h-[410px] grid-cols-[64px_1fr] sm:grid-cols-[150px_1fr]">
          <aside className="border-r border-white/10 bg-black/15 p-3 sm:p-4" aria-label="Menu ilustrativo do painel">
            <div className="mb-5 flex items-center gap-2 rounded-xl bg-primary/[0.12] p-2.5 text-primary">
              <LayoutDashboard className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="hidden text-xs font-medium sm:inline">Visão geral</span>
            </div>
            {[
              [Newspaper, "Pautas"],
              [Sparkles, "Criação"],
              [CalendarDays, "Agenda"],
              [Instagram, "Contas IG"],
            ].map(([Icon, label]) => {
              const MenuIcon = Icon as typeof Newspaper;
              return (
                <div key={label as string} className="mb-1 flex items-center gap-2 rounded-xl p-2.5 text-muted-foreground">
                  <MenuIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="hidden text-xs sm:inline">{label as string}</span>
                </div>
              );
            })}
          </aside>

          <div className="min-w-0 p-3 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Fila editorial</div>
                <div className="mt-1 font-display text-base font-semibold text-foreground sm:text-lg">Conteúdos de hoje</div>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-3 py-1.5 text-[10px] font-medium text-emerald-300">
                <span className="relative flex h-2 w-2">
                  {!reduceMotion && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-60" />}
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-300" />
                </span>
                Conta conectada
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                ["12", "na fila"],
                ["08", "publicados"],
                ["94%", "prontos"],
              ].map(([value, label]) => (
                <div key={label} className="rounded-xl border border-white/[0.08] bg-white/[0.035] p-2.5 sm:p-3">
                  <div className="font-display text-base font-bold text-foreground sm:text-lg">{value}</div>
                  <div className="mt-0.5 truncate text-[9px] text-muted-foreground sm:text-[10px]">{label}</div>
                </div>
              ))}
            </div>

            <div className="mt-4 space-y-2.5">
              {queueItems.map((item, index) => {
                const Icon = item.icon;
                return (
                  <motion.div
                    key={item.title}
                    initial={reduceMotion ? false : { opacity: 0, x: 14 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.55 + index * 0.1, duration: 0.4 }}
                    className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.035] p-3"
                  >
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${item.tone}`}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] font-medium text-foreground sm:text-xs">{item.title}</div>
                      <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[9px] text-muted-foreground sm:text-[10px]">
                        <span>{item.meta}</span>
                        <span>•</span>
                        <span>{item.status}</span>
                      </div>
                    </div>
                    {index < 2 && <CheckCircle2 className="hidden h-4 w-4 shrink-0 text-emerald-400 sm:block" aria-hidden="true" />}
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
