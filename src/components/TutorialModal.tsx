import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Calendar,
  Check,
  CheckCircle2,
  Clock3,
  FilePlus2,
  Instagram,
  LayoutTemplate,
  Newspaper,
  PlayCircle,
  Rss,
  Settings2,
  Sparkles,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

const STORAGE_KEY = "flux-feed_tutorial_views";

export function getTutorialViewCount(): number {
  return Number(localStorage.getItem(STORAGE_KEY) || "0");
}

export function incrementTutorialView() {
  localStorage.setItem(STORAGE_KEY, String(getTutorialViewCount() + 1));
}

export function shouldAutoShowTutorial(): boolean {
  return getTutorialViewCount() < 1;
}

type TutorialStep = {
  icon: typeof Sparkles;
  navTitle: string;
  eyebrow: string;
  title: string;
  summary: string;
  items: string[];
  note: string;
  route?: string;
  action?: string;
};

const steps: TutorialStep[] = [
  {
    icon: PlayCircle,
    navTitle: "Visão geral",
    eyebrow: "Boas-vindas",
    title: "Organize sua operação de conteúdo",
    summary: "Este guia apresenta o fluxo completo, da entrada da notícia até a publicação no Instagram.",
    items: [
      "Conectar a conta que receberá as publicações",
      "Definir fontes ou escrever matérias próprias",
      "Aplicar a identidade visual da marca",
      "Revisar, programar e acompanhar resultados",
    ],
    note: "Reserve cerca de 7 minutos. Você pode sair e abrir este guia novamente em Configurações.",
  },
  {
    icon: Instagram,
    navTitle: "Conta Instagram",
    eyebrow: "Etapa 1",
    title: "Conecte uma conta profissional",
    summary: "A publicação automática depende de uma conta Business ou Criador vinculada corretamente à Meta.",
    items: [
      "Use uma conta Instagram profissional, não uma conta pessoal",
      "Confirme o vínculo com uma Página do Facebook",
      "Autorize as permissões solicitadas durante a conexão",
      "Para várias marcas, configure identidade e regras por conta",
    ],
    note: "A senha do Instagram não é armazenada pelo Flux & Feed. A conexão acontece pelo fluxo oficial da Meta.",
    route: "/dashboard/accounts",
    action: "Abrir Contas IG",
  },
  {
    icon: Rss,
    navTitle: "Entrada de conteúdo",
    eyebrow: "Etapa 2",
    title: "Escolha de onde virão as matérias",
    summary: "Você pode automatizar a coleta por RSS ou criar conteúdos próprios diretamente na plataforma.",
    items: [
      "Cadastre sites e portais em Fontes para monitoramento recorrente",
      "Use Descobrir RSS quando souber apenas o endereço do site",
      "Em Notícias, clique em Criar notícia para escrever uma matéria manual",
      "Adicione título, texto, imagem, formato e conta de destino",
    ],
    note: "Comece com poucas fontes confiáveis. Isso facilita a revisão e mantém a linha editorial consistente.",
    route: "/dashboard/sources",
    action: "Configurar fontes",
  },
  {
    icon: Newspaper,
    navTitle: "Revisão editorial",
    eyebrow: "Etapa 3",
    title: "Revise cada notícia antes de publicar",
    summary: "A área Notícias concentra o texto original, a versão processada e todas as ações editoriais.",
    items: [
      "Processe a matéria usando seu template ou uma imagem gerada",
      "Ajuste título, legenda e hashtags antes da aprovação",
      "Abra a prévia e confira a leitura no celular",
      "Rejeite conteúdos que não combinam com a marca",
    ],
    note: "Automação não elimina revisão editorial. Nomes, datas, números e afirmações importantes devem ser conferidos.",
    route: "/dashboard/news",
    action: "Abrir Notícias",
  },
  {
    icon: LayoutTemplate,
    navTitle: "Identidade visual",
    eyebrow: "Etapa 4",
    title: "Crie uma identidade reconhecível",
    summary: "Templates controlam como títulos, fotos, cores, selos e marca aparecem nas peças publicadas.",
    items: [
      "Escolha composições diferentes para Feed, Stories e Reels",
      "Arraste os blocos e ajuste posição, tamanho, cor e alinhamento",
      "Defina um template padrão para cada formato",
      "Use a prévia final antes de salvar alterações",
    ],
    note: "Stories precisam carregar a informação na própria arte. Reels podem funcionar como capa e complementar o conteúdo na legenda.",
    route: "/dashboard/templates",
    action: "Personalizar templates",
  },
  {
    icon: FilePlus2,
    navTitle: "Formatos",
    eyebrow: "Etapa 5",
    title: "Prepare cada formato para seu objetivo",
    summary: "A mesma matéria pode ser adaptada para diferentes momentos da jornada do público.",
    items: [
      "Feed: conteúdo permanente, com arte e legenda detalhada",
      "Story: leitura rápida na própria tela, disponível por 24 horas",
      "Reel: capa vertical e vídeo curto para ampliar descoberta",
      "Revise enquadramento e áreas seguras antes de programar",
    ],
    note: "Não replique a mesma peça sem adaptação. Cada formato possui proporção, interface e comportamento próprios.",
    route: "/dashboard/news",
    action: "Escolher uma matéria",
  },
  {
    icon: Calendar,
    navTitle: "Agenda",
    eyebrow: "Etapa 6",
    title: "Programe uma rotina sustentável",
    summary: "A agenda organiza o que será publicado, em qual conta e em qual horário.",
    items: [
      "Escolha Feed, Story ou Reel ao aprovar uma matéria",
      "Use o próximo horário disponível ou defina um horário customizado",
      "Revise a fila antes de ativar um volume maior de publicações",
      "Reagende ou cancele uma peça quando necessário",
    ],
    note: "Consistência é mais importante que volume. Comece com uma frequência que sua equipe consiga revisar.",
    route: "/dashboard/scheduled",
    action: "Ver agenda",
  },
  {
    icon: Settings2,
    navTitle: "Automação",
    eyebrow: "Etapa 7",
    title: "Defina as regras da operação",
    summary: "Configurações reúne identidade, tom editorial, frequência, horários e preferências de publicação.",
    items: [
      "Cadastre nome, arroba e logotipo da marca",
      "Defina tom, nicho e quantidade máxima de posts",
      "Ajuste horários preferidos e intervalo entre publicações",
      "Personalize regras específicas quando houver várias contas",
    ],
    note: "Faça uma alteração por vez e acompanhe o resultado. Isso facilita entender qual configuração melhorou a operação.",
    route: "/dashboard/settings",
    action: "Abrir Configurações",
  },
  {
    icon: BarChart3,
    navTitle: "Resultados",
    eyebrow: "Etapa 8",
    title: "Acompanhe o que realmente funciona",
    summary: "Use os dados publicados para ajustar temas, formatos e frequência com critérios objetivos.",
    items: [
      "Compare alcance, curtidas, comentários e salvamentos",
      "Observe quais assuntos geram resposta consistente",
      "Analise Feed, Stories e Reels separadamente",
      "Consulte Atividade para acompanhar o histórico operacional",
    ],
    note: "Evite decisões baseadas em uma única publicação. Procure padrões ao longo de várias semanas.",
    route: "/dashboard/insights",
    action: "Ver Insights",
  },
  {
    icon: CheckCircle2,
    navTitle: "Conclusão",
    eyebrow: "Tudo pronto",
    title: "Seu fluxo está preparado para começar",
    summary: "Faça uma primeira publicação acompanhada antes de aumentar a automação.",
    items: [
      "Conta Instagram conectada e com permissões válidas",
      "Uma fonte cadastrada ou matéria manual criada",
      "Templates padrão definidos para os formatos utilizados",
      "Horários e frequência revisados",
    ],
    note: "Para ajuda operacional, use Suporte. Este tutorial permanece disponível em Configurações.",
    route: "/dashboard",
    action: "Ir para Visão geral",
  },
];

export function TutorialModal({ open, onOpenChange }: { open: boolean; onOpenChange: (value: boolean) => void }) {
  const { language, t } = useLanguage();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const current = steps[step];
  const Icon = current.icon;
  const last = step === steps.length - 1;
  const progress = ((step + 1) / steps.length) * 100;

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  const close = () => onOpenChange(false);
  const openSection = () => {
    if (!current.route) return;
    close();
    navigate(current.route);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">{t("Guia de primeiros passos do Flux & Feed")}</DialogTitle>
        <DialogDescription className="sr-only">{t("Tutorial completo para configurar e usar a plataforma.")}</DialogDescription>

        <div className="grid h-[min(720px,92vh)] min-h-0 md:grid-cols-[250px_1fr]">
          <aside className="hidden border-r border-border bg-muted/20 p-5 md:flex md:flex-col">
            <div className="mb-5 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-brand shadow-glow">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <p className="font-display font-semibold">{t("Primeiros passos")}</p>
                <p className="flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3 w-3" /> {t("Guia de 7 minutos")}</p>
              </div>
            </div>

            <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1" aria-label={t("Etapas do tutorial")}>
              {steps.map((item, index) => {
                const StepIcon = item.icon;
                const active = index === step;
                const completed = index < step;
                return (
                  <button
                    key={item.navTitle}
                    type="button"
                    onClick={() => setStep(index)}
                    aria-current={active ? "step" : undefined}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition",
                      active ? "bg-primary/10 text-foreground ring-1 ring-primary/30" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border", active && "border-primary bg-primary text-primary-foreground", completed && "border-emerald-500/40 bg-emerald-500/10 text-emerald-400")}>
                      {completed ? <Check className="h-3.5 w-3.5" /> : <StepIcon className="h-3.5 w-3.5" />}
                    </span>
                    <span className="truncate font-medium">{t(item.navTitle)}</span>
                  </button>
                );
              })}
            </nav>

            <button type="button" onClick={close} className="mt-4 text-left text-xs text-muted-foreground transition hover:text-foreground">
              {t("Fechar e continuar depois")}
            </button>
          </aside>

          <section className="flex min-h-0 min-w-0 flex-col">
            <div className="border-b border-border px-5 pb-4 pt-5 md:px-8">
              <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                <span className="font-medium text-muted-foreground">{language === "en-US" ? `Step ${step + 1} of ${steps.length}` : `Etapa ${step + 1} de ${steps.length}`}</span>
                <span className="text-muted-foreground">{language === "en-US" ? `${Math.round(progress)}% complete` : `${Math.round(progress)}% concluído`}</span>
              </div>
              <Progress value={progress} className="h-1.5" />
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-6 md:px-8 md:py-8">
              <div className="mb-5 flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                  <Icon className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-primary">{t(current.eyebrow)}</p>
                  <h2 className="font-display text-2xl font-semibold leading-tight md:text-3xl">{t(current.title)}</h2>
                </div>
              </div>

              <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground md:text-base">{t(current.summary)}</p>

              <div className="my-6 grid gap-3 sm:grid-cols-2">
                {current.items.map((item, index) => (
                  <div key={item} className="flex gap-3 rounded-xl border border-border bg-card/60 p-3.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>
                    <p className="text-sm leading-relaxed">{t(item)}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Orientação prática")}</p>
                <p className="text-sm leading-relaxed">{t(current.note)}</p>
              </div>
            </div>

            <footer className="border-t border-border bg-card/40 px-5 py-4 md:px-8">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button variant="ghost" onClick={() => setStep(value => Math.max(0, value - 1))} disabled={step === 0}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> {t("Voltar")}
                </Button>
                <div className="ml-auto flex flex-wrap justify-end gap-2">
                  {current.route && !last && (
                    <Button variant="outline" onClick={openSection}>{t(current.action || "")}</Button>
                  )}
                  {last ? (
                    <Button onClick={openSection}>{t("Concluir")} <CheckCircle2 className="ml-2 h-4 w-4" /></Button>
                  ) : (
                    <Button onClick={() => setStep(value => Math.min(steps.length - 1, value + 1))}>
                      {t("Próxima etapa")} <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </footer>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
