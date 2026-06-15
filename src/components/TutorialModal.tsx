import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Rss, Newspaper, Calendar, Instagram, Palette, Settings as SettingsIcon, Sparkles, BarChart3, CheckCircle2, ArrowRight, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "flux-feed_tutorial_views";

export function getTutorialViewCount(): number {
  return Number(localStorage.getItem(STORAGE_KEY) || "0");
}
export function incrementTutorialView() {
  localStorage.setItem(STORAGE_KEY, String(getTutorialViewCount() + 1));
}
export function shouldAutoShowTutorial(): boolean {
  return getTutorialViewCount() < 2;
}

const steps = [
  {
    icon: Sparkles,
    title: "Bem-vindo ao Flux & Feed!",
    desc: "Sua plataforma de automação de conteúdo para Instagram. Vamos te mostrar como funciona em poucos passos.",
    tip: "Em ~5 minutos você terá o autopilot rodando.",
  },
  {
    icon: Instagram,
    title: "1. Conecte seu Instagram",
    desc: "Vá em Contas IG e conecte uma conta Profissional (Business ou Criador) ligada a uma página do Facebook. Sem isso, não conseguimos publicar.",
    tip: "Você pode conectar várias contas no mesmo plano.",
  },
  {
    icon: Rss,
    title: "2. Cadastre suas Fontes",
    desc: "Em Fontes, adicione feeds RSS dos sites que você quer monitorar (G1, ESPN, etc.). A IA busca notícias novas a cada hora automaticamente.",
    tip: "Não sabe o RSS? Use o botão 'Descobrir RSS' colando a URL do site.",
  },
  {
    icon: Newspaper,
    title: "3. Aprove ou edite as Notícias",
    desc: "Em Notícias, a IA mostra cada matéria reescrita com legenda, hashtags e imagem. Você aprova, edita ou descarta. Pode ativar Aprovação Automática nas Configurações.",
    tip: "Cada notícia gera um Reel, Feed ou Story conforme suas regras.",
  },
  {
    icon: Palette,
    title: "4. Personalize os Templates",
    desc: "Em Templates, escolha cores, fontes e logo. Em Feed/Stories/Reels você ajusta o visual de cada formato. Sua marca, seu estilo.",
    tip: "Teste antes de publicar usando a pré-visualização.",
  },
  {
    icon: Calendar,
    title: "5. Agende e publique",
    desc: "Em Agendados você vê tudo que vai sair, em qual horário e em qual conta. O sistema publica sozinho nos melhores horários do seu nicho.",
    tip: "Você pode reordenar, reagendar ou cancelar a qualquer momento.",
  },
  {
    icon: BarChart3,
    title: "6. Acompanhe os Insights",
    desc: "Em Insights veja curtidas, comentários, alcance e o que mais engaja. A IA aprende com os melhores posts e melhora o conteúdo seguinte.",
    tip: "Atividade mostra o histórico completo de tudo que aconteceu.",
  },
  {
    icon: SettingsIcon,
    title: "7. Configure a Automação",
    desc: "Em Configurações ajuste: nicho, tom da IA, posts/dia, horários preferidos, biblioteca de trilhas para Reels e identidade da marca.",
    tip: "Você pode rever este tutorial a qualquer momento por aqui.",
  },
  {
    icon: CheckCircle2,
    title: "Pronto para começar!",
    desc: "Comece conectando uma conta IG e cadastrando 1-2 fontes RSS. Em poucas horas você verá notícias chegando para aprovar.",
    tip: "Qualquer dúvida, use o botão de tutorial nas Configurações.",
  },
];

export function TutorialModal({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [step, setStep] = useState(0);
  const s = steps[step];
  const Icon = s.icon;
  const last = step === steps.length - 1;

  const close = () => {
    onOpenChange(false);
    setTimeout(() => setStep(0), 300);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) close(); else onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="h-14 w-14 rounded-2xl bg-gradient-brand flex items-center justify-center shadow-glow mb-2">
            <Icon className="h-7 w-7 text-primary-foreground" />
          </div>
          <DialogTitle className="font-display text-2xl">{s.title}</DialogTitle>
          <DialogDescription className="text-base leading-relaxed pt-1">{s.desc}</DialogDescription>
        </DialogHeader>

        <div className="rounded-lg bg-secondary/60 border border-border p-3 text-sm">
          <span className="font-medium">💡 Dica:</span> {s.tip}
        </div>

        <div className="flex items-center justify-center gap-1.5 py-2">
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === step ? "w-6 bg-primary" : "w-1.5 bg-muted hover:bg-muted-foreground/40"
              )}
              aria-label={`Passo ${i + 1}`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <span className="text-xs text-muted-foreground">{step + 1} de {steps.length}</span>
          {last ? (
            <Button onClick={close}>Começar <CheckCircle2 className="h-4 w-4 ml-1" /></Button>
          ) : (
            <Button onClick={() => setStep(s => Math.min(steps.length - 1, s + 1))}>
              Próximo <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>

        {step === 0 && (
          <button onClick={close} className="text-xs text-muted-foreground hover:text-foreground text-center mt-1">
            Pular tutorial
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}
