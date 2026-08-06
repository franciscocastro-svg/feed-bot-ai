import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  CirclePlay,
  HelpCircle,
  LayoutDashboard,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Workflow,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SEO } from "@/components/SEO";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { buildSupportWhatsAppUrl } from "@/lib/contact";
import { BenefitCard } from "@/components/landing/BenefitCard";
import { ComparisonTable } from "@/components/landing/ComparisonTable";
import { CTASection } from "@/components/landing/CTASection";
import { DashboardPreview } from "@/components/landing/DashboardPreview";
import { FAQAccordion } from "@/components/landing/FAQAccordion";
import { FeatureCard } from "@/components/landing/FeatureCard";
import { HeroSection } from "@/components/landing/HeroSection";
import { LandingFooter } from "@/components/landing/LandingFooter";
import { LandingHeader } from "@/components/landing/LandingHeader";
import {
  aiPrinciples,
  benefitCards,
  comparisonRows,
  faqItems,
  featureCards,
  problemCards,
  resultStats,
  solutionBenefits,
  timelineSteps,
  type LandingPlan,
} from "@/components/landing/landingContent";
import { PricingSection } from "@/components/landing/PricingSection";
import { ProofSection } from "@/components/landing/ProofSection";
import { StatsCard } from "@/components/landing/StatsCard";
import { TestimonialCard } from "@/components/landing/TestimonialCard";
import { Timeline } from "@/components/landing/Timeline";
import { WorkflowAnimation } from "@/components/landing/WorkflowAnimation";
import "@/styles/landing.css";

const INSTAGRAM_URL = "https://www.instagram.com/fluxifeed?utm_source=qr&igsh=MXVkbHIxa3FwMWJ3YQ==";
const WHATSAPP_CONTACT_URL = buildSupportWhatsAppUrl("Olá! Quero saber mais sobre o Flux & Feed.");

function FAQStructuredData() {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.a,
      },
    })),
  };

  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(data)}</script>
    </Helmet>
  );
}

export default function Index() {
  const { user } = useAuth();
  const [plans, setPlans] = useState<LandingPlan[]>([]);
  const [plansStatus, setPlansStatus] = useState<"loading" | "ready" | "error">("loading");
  const isAuthenticated = Boolean(user);

  useEffect(() => {
    let active = true;

    void (async () => {
      const { data, error } = await supabase
        .from("plan_limits")
        .select("*")
        .neq("plan", "expired")
        .order("sort_order");

      if (!active) return;
      if (error) {
        setPlans([]);
        setPlansStatus("error");
        return;
      }

      setPlans((data ?? []) as LandingPlan[]);
      setPlansStatus("ready");
    })();

    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="landing-shell">
      <SEO
        title="Flux & Feed — Conteúdo para Instagram da pauta à publicação"
        description="Centralize fontes, criação com IA, templates, aprovação, agendamento e publicação pela API oficial da Meta em uma única plataforma."
        path="/"
      />
      <FAQStructuredData />
      <LandingHeader isAuthenticated={isAuthenticated} />
      <HeroSection isAuthenticated={isAuthenticated} />

      <main>
        <section id="problema" className="landing-section container scroll-mt-24" aria-labelledby="problem-title">
          <div className="landing-heading">
            <span className="landing-eyebrow">
              <Zap className="h-3.5 w-3.5" aria-hidden="true" />
              Conteúdo não deveria consumir toda a operação
            </span>
            <h2 id="problem-title" className="landing-title">
              Publicar com frequência parece simples.{" "}
              <span className="text-gradient">Até todas as etapas se acumularem.</span>
            </h2>
            <p className="landing-description">
              O problema não é falta de pauta. É fazer descoberta, produção, revisão e agenda funcionarem juntas, todos os dias.
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {problemCards.map((item, index) => (
              <FeatureCard key={item.title} {...item} index={index} />
            ))}
          </div>

          <div className="mt-20 grid items-start gap-10 lg:grid-cols-[0.78fr_1.22fr] lg:gap-14">
            <div className="lg:sticky lg:top-28">
              <span className="landing-eyebrow">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                Uma operação conectada
              </span>
              <h2 className="mt-5 font-display text-3xl font-bold leading-tight text-foreground sm:text-5xl">
                O Flux &amp; Feed transforma etapas isoladas em{" "}
                <span className="text-gradient">um fluxo contínuo.</span>
              </h2>
              <p className="mt-5 text-base leading-7 text-muted-foreground sm:text-lg">
                Tudo parte das regras da sua conta: fontes, voz, formatos, aprovação, frequência e horários.
              </p>
              <Button asChild variant="outline" className="mt-7 min-h-12 border-white/15 bg-white/[0.035]">
                <a href="#demonstracao">
                  <CirclePlay className="mr-2 h-4 w-4 text-primary" aria-hidden="true" />
                  Ver o fluxo em ação
                </a>
              </Button>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {solutionBenefits.map((item, index) => (
                <BenefitCard key={item.title} {...item} index={index} />
              ))}
            </div>
          </div>
        </section>

        <section
          id="demonstracao"
          className="landing-section landing-content-auto relative scroll-mt-24 border-y border-white/10 bg-white/[0.018]"
          aria-labelledby="demo-title"
        >
          <div className="landing-grid absolute inset-0 opacity-25" aria-hidden="true" />
          <div className="container relative">
            <div className="landing-heading">
              <span className="landing-eyebrow">
                <Workflow className="h-3.5 w-3.5" aria-hidden="true" />
                Fluxo automatizado
              </span>
              <h2 id="demo-title" className="landing-title">
                Da descoberta ao Instagram,{" "}
                <span className="text-gradient">sem perder o contexto no caminho.</span>
              </h2>
              <p className="landing-description">
                Acompanhe uma pauta passando pela IA, identidade visual, agenda e publicação. Pause ou selecione qualquer etapa.
              </p>
            </div>
            <div className="mx-auto mt-12 max-w-6xl">
              <WorkflowAnimation />
            </div>
          </div>
        </section>

        <section id="como-funciona" className="landing-section landing-content-auto container scroll-mt-24" aria-labelledby="how-title">
          <div className="landing-heading">
            <span className="landing-eyebrow">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Como funciona
            </span>
            <h2 id="how-title" className="landing-title">
              Configure uma vez.{" "}
              <span className="text-gradient">Acompanhe com clareza todos os dias.</span>
            </h2>
            <p className="landing-description">
              Você decide de onde o conteúdo vem, como sua marca se comunica e o que precisa de aprovação.
            </p>
          </div>
          <div className="mt-12">
            <Timeline steps={timelineSteps} />
          </div>
        </section>

        <section id="recursos" className="landing-section landing-content-auto scroll-mt-24 border-y border-white/10 bg-white/[0.018]" aria-labelledby="dashboard-title">
          <div className="container">
            <div className="grid items-center gap-12 lg:grid-cols-[0.88fr_1.12fr]">
              <div>
                <span className="landing-eyebrow">
                  <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" />
                  Dashboard operacional
                </span>
                <h2 id="dashboard-title" className="mt-5 font-display text-3xl font-bold leading-tight text-foreground sm:text-5xl">
                  Veja o que está acontecendo.{" "}
                  <span className="text-gradient">E o que precisa de você.</span>
                </h2>
                <p className="mt-5 text-base leading-7 text-muted-foreground sm:text-lg">
                  O painel reúne conteúdos em preparação, revisões, agenda, publicações e falhas para que nenhuma etapa fique invisível.
                </p>
                <ul className="mt-7 space-y-3 text-sm text-foreground/90 sm:text-base">
                  {[
                    "Status e próximos horários por conta",
                    "Prévia, edição e aprovação no mesmo contexto",
                    "Fila organizada por formato e prioridade",
                    "Erros visíveis para agir sem adivinhação",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/[0.12] text-primary">
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
              <DashboardPreview />
            </div>

            <div className="mt-20">
              <div className="landing-heading">
                <span className="landing-eyebrow">Recursos conectados</span>
                <h2 className="landing-title">
                  Uma plataforma para cada etapa,{" "}
                  <span className="text-gradient">não uma coleção de atalhos.</span>
                </h2>
              </div>
              <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                {featureCards.map((item, index) => (
                  <FeatureCard key={item.title} {...item} index={index} />
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="landing-section landing-content-auto container" aria-labelledby="ai-title">
          <div className="grid items-center gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="relative overflow-hidden rounded-[2rem] border border-primary/20 bg-gradient-to-br from-primary/15 via-card/80 to-accent/[0.08] p-6 shadow-2xl shadow-primary/5 sm:p-9">
              <div className="landing-grid absolute inset-0 opacity-25" aria-hidden="true" />
              <div className="relative">
                <div className="flex items-center justify-between">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-brand text-primary-foreground shadow-glow">
                    <Bot className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <span className="rounded-full border border-white/10 bg-background/60 px-3 py-1 text-[10px] font-medium text-muted-foreground">
                    Revisão humana disponível
                  </span>
                </div>
                <div className="mt-10 space-y-3">
                  <div className="h-2.5 w-4/5 rounded-full bg-white/[0.12]" />
                  <div className="h-2.5 w-full rounded-full bg-white/[0.08]" />
                  <div className="h-2.5 w-3/5 rounded-full bg-white/[0.08]" />
                </div>
                <div className="mt-8 rounded-2xl border border-white/10 bg-background/60 p-4">
                  <div className="text-xs font-medium text-primary">Sugestão editorial</div>
                  <p className="mt-2 text-sm leading-6 text-foreground/85">
                    Estrutura pronta para revisar, com título, corpo, legenda e formato alinhados ao perfil da conta.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-lg bg-emerald-400/10 px-3 py-1.5 text-[10px] font-medium text-emerald-300">Aprovar</span>
                    <span className="rounded-lg bg-white/5 px-3 py-1.5 text-[10px] font-medium text-muted-foreground">Editar texto</span>
                    <span className="rounded-lg bg-white/5 px-3 py-1.5 text-[10px] font-medium text-muted-foreground">Trocar mídia</span>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <span className="landing-eyebrow">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Inteligência artificial com direção
              </span>
              <h2 id="ai-title" className="mt-5 font-display text-3xl font-bold leading-tight text-foreground sm:text-5xl">
                A IA acelera a primeira versão.{" "}
                <span className="text-gradient">Sua estratégia continua no comando.</span>
              </h2>
              <p className="mt-5 text-base leading-7 text-muted-foreground sm:text-lg">
                O objetivo não é tirar você da decisão. É entregar mais contexto e menos trabalho mecânico antes dela.
              </p>
              <div className="mt-7 grid gap-4">
                {aiPrinciples.map((item, index) => (
                  <BenefitCard key={item.title} {...item} index={index} />
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="landing-section landing-content-auto border-y border-white/10 bg-white/[0.018]" aria-labelledby="comparison-title">
          <div className="container">
            <div className="landing-heading">
              <span className="landing-eyebrow">
                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                Manual vs. Flux &amp; Feed
              </span>
              <h2 id="comparison-title" className="landing-title">
                O mesmo trabalho editorial.{" "}
                <span className="text-gradient">Com menos troca de contexto.</span>
              </h2>
              <p className="landing-description">
                A plataforma conecta as etapas que normalmente ficam espalhadas entre abas, mensagens, pastas e planilhas.
              </p>
            </div>
            <div className="mt-12">
              <ComparisonTable rows={comparisonRows} />
            </div>
          </div>
        </section>

        <section className="landing-section landing-content-auto container" aria-labelledby="benefits-title">
          <div className="landing-heading">
            <span className="landing-eyebrow">Benefícios para a rotina</span>
            <h2 id="benefits-title" className="landing-title">
              A automação mais útil é a que{" "}
              <span className="text-gradient">devolve capacidade para sua equipe.</span>
            </h2>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {benefitCards.map((item, index) => (
              <BenefitCard key={item.title} {...item} index={index} />
            ))}
          </div>
        </section>

        <section id="resultados" className="landing-section landing-content-auto relative scroll-mt-24 border-y border-white/10 bg-white/[0.018]" aria-labelledby="results-title">
          <div className="container">
            <div className="landing-heading">
              <span className="landing-eyebrow">
                <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                Resultados documentados
              </span>
              <h2 id="results-title" className="landing-title">
                Prova real, com contexto.{" "}
                <span className="text-gradient">Sem promessas inventadas.</span>
              </h2>
              <p className="landing-description">
                Estes números pertencem a uma operação acompanhada pelo Flux &amp; Feed. Resultados variam conforme nicho, conteúdo, frequência e audiência.
              </p>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {resultStats.map((item, index) => (
                <StatsCard key={item.label} {...item} index={index} />
              ))}
            </div>

            <div className="mt-8">
              <TestimonialCard
                quote="O ganho mais importante foi transformar uma sequência de tarefas manuais em uma rotina capaz de manter volume, identidade e acompanhamento."
                author="Caso operacional Flux & Feed"
                role="Conta real acompanhada por 30 dias"
                verified
              />
            </div>

            <div className="mt-16">
              <ProofSection instagramUrl={INSTAGRAM_URL} />
            </div>
          </div>
        </section>

        <PricingSection plans={plans} status={plansStatus} whatsappUrl={WHATSAPP_CONTACT_URL} />

        <section id="faq" className="landing-section landing-content-auto container scroll-mt-24" aria-labelledby="faq-title">
          <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-16">
            <div className="lg:sticky lg:top-28 lg:self-start">
              <span className="landing-eyebrow">
                <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
                Perguntas frequentes
              </span>
              <h2 id="faq-title" className="mt-5 font-display text-3xl font-bold leading-tight text-foreground sm:text-5xl">
                O que você precisa saber{" "}
                <span className="text-gradient">antes de começar.</span>
              </h2>
              <p className="mt-5 text-base leading-7 text-muted-foreground">
                Não encontrou sua dúvida? Fale com a equipe e conte como funciona sua operação.
              </p>
              <Button variant="outline" asChild className="mt-7 min-h-12 border-white/15 bg-white/[0.035]">
                <a href={WHATSAPP_CONTACT_URL} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 h-4 w-4 text-emerald-400" aria-hidden="true" />
                  Falar pelo WhatsApp
                </a>
              </Button>
            </div>
            <FAQAccordion items={faqItems} />
          </div>
        </section>

        <CTASection isAuthenticated={isAuthenticated} />
      </main>

      <LandingFooter whatsappUrl={WHATSAPP_CONTACT_URL} instagramUrl={INSTAGRAM_URL} />

      <Link
        to={isAuthenticated ? "/dashboard" : "/auth"}
        className="sr-only focus:not-sr-only focus:fixed focus:bottom-4 focus:left-4 focus:z-[80] focus:rounded-xl focus:bg-primary focus:px-4 focus:py-3 focus:text-primary-foreground"
      >
        {isAuthenticated ? "Abrir painel" : "Começar gratuitamente"}
        <ArrowRight className="ml-2 inline h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
