import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { SEO } from "@/components/SEO";
import { useEffect, useRef, useState } from "react";
import { motion, useTransform, useMotionValue, useSpring } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Sparkles, Newspaper, Bot, Image as ImageIcon, Instagram, Calendar, Shield,
  ArrowRight, Check, MessageCircle, Zap, Rocket, TrendingUp, Star, HelpCircle,
  ChevronLeft, ChevronRight
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { BrandLogo } from "@/components/BrandLogo";
import proofInstagramProfile from "@/assets/proof-instagram-profile.jpg";
import proofInstagramInsights from "@/assets/proof-instagram-insights.jpg";
import proofInstagramStories from "@/assets/proof-instagram-stories.jpg";
import proofInstagramAfterProfile from "@/assets/proof-instagram-after-profile.jpg";
import proofInstagramAfterInsights from "@/assets/proof-instagram-after-insights.jpg";
import proofInstagramAfterStories from "@/assets/proof-instagram-after-stories.jpg";

const PLAN_SUBTITLES: Record<string, string> = {
  starter: "Para uma conta em crescimento",
  pro: "Para criadores e agências",
  business: "Para operação com várias contas",
};
const PLAN_CTA: Record<string, { label: string; to?: string; whatsapp?: boolean }> = {
  starter: { label: "Assinar Starter", to: "/pricing?plan=starter_monthly" },
  pro: { label: "Assinar Pro", to: "/pricing?plan=pro_monthly" },
  business: { label: "Falar com vendas", whatsapp: true },
};
const INSTAGRAM_URL = "https://www.instagram.com/fluxifeed?utm_source=qr&igsh=MXVkbHIxa3FwMWJ3YQ==";
const WHATSAPP_CONTACT_URL =
  "https://api.whatsapp.com/send?phone=5561999052691&text=Ol%C3%A1%21%20Quero%20saber%20mais%20sobre%20o%20Flux%20%26%20Feed.";

type LandingPlan = {
  plan: string;
  display_name: string | null;
  price_brl: number | null;
  is_negotiable: boolean;
  max_ig_accounts: number | null;
  max_posts_per_day: number | null;
  max_rss_sources: number | null;
  max_reels_per_month: number | null;
  max_images_per_month: number | null;
  auto_publish_enabled: boolean | null;
};

function fmtBRL(n: number | null | undefined, isNegotiable: boolean): string {
  if (isNegotiable || n === null || n === undefined) return "Sob consulta";
  if (Number(n) === 0) return "R$ 0";
  return `R$ ${Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
function fmtLimit(n: number | null | undefined, label: string): string {
  if (n === null || n === undefined || n === -1) return `${label} ilimitado`;
  return `${n} ${label}`;
}
function buildFeatures(p: LandingPlan): string[] {
  const f: string[] = [];
  f.push(fmtLimit(p.max_ig_accounts, p.max_ig_accounts === 1 ? "conta Instagram" : "contas Instagram"));
  f.push(fmtLimit(p.max_posts_per_day, "posts/dia"));
  f.push(fmtLimit(p.max_rss_sources, "fontes RSS"));
  f.push(fmtLimit(p.max_reels_per_month, "reels IA/mês"));
  f.push(fmtLimit(p.max_images_per_month, "imagens IA/mês"));
  if (p.auto_publish_enabled) f.push("Auto-publicação");
  f.push(p.is_negotiable ? "Suporte por WhatsApp" : (p.plan === "pro" ? "Suporte prioritário" : "Suporte por email"));
  return f;
}


const features = [
  { icon: Newspaper, title: "Captação de notícias", text: "Conecte feeds RSS por nicho e deixe o sistema buscar as melhores pautas automaticamente.", color: "from-pink-500 to-rose-500" },
  { icon: Bot, title: "Texto pronto com IA", text: "Título, resumo e legenda adaptados para Instagram, com revisão manual opcional.", color: "from-purple-500 to-pink-500" },
  { icon: ImageIcon, title: "Reels e artes com template", text: "Gere vídeos, capas e posts com identidade visual consistente para cada conta.", color: "from-orange-500 to-pink-500" },
  { icon: Instagram, title: "Publicação pela API oficial", text: "Agende ou publique usando a Meta Graph API, sem depender de navegador aberto.", color: "from-fuchsia-500 to-purple-500" },
  { icon: Calendar, title: "Fila inteligente", text: "Acompanhe status, erros, horários e próximas tentativas em um painel simples.", color: "from-pink-500 to-orange-400" },
  { icon: Shield, title: "Intervalo seguro", text: "Controle ritmo, limite diário e horários para reduzir excesso de ações no Instagram.", color: "from-purple-500 to-fuchsia-500" },
];

const stats = [
  { value: "Fontes", label: "RSS, sites, temas e URLs" },
  { value: "Criação", label: "Texto, Feed, Stories e Reels" },
  { value: "Operação", label: "Aprovação, agenda e filas" },
  { value: "Publicação", label: "API oficial da Meta" },
];

const steps = [
  { n: "01", title: "Conecte fontes RSS", text: "Escolha os sites, nichos e contas do Instagram que receberão as notícias." },
  { n: "02", title: "A IA prepara o conteúdo", text: "O Flux & Feed reescreve, cria legenda e monta o Reel ou post com template." },
  { n: "03", title: "A fila organiza tudo", text: "Cada conta segue horários, limite diário e intervalo mínimo configurado." },
  { n: "04", title: "Você acompanha em tempo real", text: "Veja status, erros, próximos horários e posts publicados dentro do painel." },
];

const heroQueue = [
  { title: "Mercado reage a nova decisão de juros", status: "Reel pronto", time: "12:30" },
  { title: "Tecnologia impulsiona pequenas empresas", status: "Agendado", time: "13:30" },
  { title: "Nova pauta em análise pela IA", status: "Preparando", time: "A seguir" },
];

const planBestFor: Record<string, string> = {
  starter: "Uma marca, um nicho e rotina simples.",
  pro: "Mais contas, volume e suporte prioritário.",
  business: "Times, portais e operações em escala.",
};

const proofComparison = [
  { label: "Publicações no perfil", before: "964", after: "1.763", growth: "1,83×" },
  { label: "Visualizações", before: "292,6 mil", after: "10,6 mi", growth: "36,23×" },
  { label: "Interações", before: "3,3 mil", after: "86 mil", growth: "26,06×" },
  { label: "Total de seguidores", before: "243", after: "8.208", growth: "33,78×" },
];

const faqItems = [
  { q: "Como funciona o teste de 7 dias?", a: "Você escolhe um plano, cadastra o cartão com segurança pela Stripe e testa a plataforma por 7 dias. A cobrança começa somente após o período de teste, e você pode cancelar antes disso." },
  { q: "Vocês usam a API oficial do Instagram?", a: "Sim, usamos integração oficial e segura com o Instagram." },
  { q: "O Instagram pode bloquear a conta?", a: "Qualquer automação pode sofrer limites se houver excesso de ações. Por isso o Flux & Feed usa intervalo mínimo, limite diário, horários e fila por conta para reduzir risco. Você também pode revisar manualmente antes de publicar." },
  { q: "Preciso deixar meu computador ligado?", a: "Não. A geração de mídia e a fila rodam na infraestrutura do sistema, então o painel pode ficar fechado." },
  { q: "Funciona com Reels?", a: "Sim. O sistema gera Reels com capa/template, áudio configurado e vídeo pronto para publicação." },
  { q: "Posso conectar mais de uma conta?", a: "Sim. O plano Pro permite até 3 contas e o Business 10+. Cada conta tem agenda e regras independentes." },
  { q: "A IA pode publicar sem revisão?", a: "Você escolhe. Tem o modo de aprovação manual (você revisa cada post) e o modo piloto automático (publica direto seguindo seus filtros e horários)." },
  { q: "Posso cancelar quando quiser?", a: "Sim. Cobrança mensal recorrente sem fidelidade. Cancele em um clique pelo painel — o acesso fica até o fim do período pago." },
  { q: "Quais fontes de notícias posso usar?", a: "Qualquer feed RSS público: G1, UOL, ESPN, blogs de nicho, NewsAPI etc. Você cadastra quantos quiser dentro do limite do seu plano." },
  { q: "Como é cobrado?", a: "Cobrança mensal via cartão de crédito processada pela Stripe. Emissão de nota fiscal sob demanda." },
  { q: "Tem suporte humano?", a: "Sim. Suporte por email em todos os planos e por WhatsApp nos planos Pro e Business." },
];

function FAQStructuredData({ items }: { items: { q: string; a: string }[] }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.q,
      acceptedAnswer: { "@type": "Answer", text: it.a },
    })),
  };
  return (
    <Helmet>
      <script type="application/ld+json">{JSON.stringify(data)}</script>
    </Helmet>
  );
}

const proofSlides = [
  {
    image: proofInstagramProfile,
    period: "before" as const,
    eyebrow: "Resultado inicial",
    title: "Perfil no primeiro ciclo",
    description: "964 posts publicados com identidade visual consistente.",
    alt: "Perfil do Instagram com posts gerados pelo Flux & Feed",
    crop: "object-top",
  },
  {
    image: proofInstagramInsights,
    period: "before" as const,
    eyebrow: "Resultado inicial",
    title: "Painel profissional no primeiro ciclo",
    description: "292,6 mil visualizações, 3,3 mil interações e 194 novos seguidores.",
    alt: "Painel profissional do Instagram com 292,6 mil visualizações",
    crop: "object-top",
  },
  {
    image: proofInstagramStories,
    period: "before" as const,
    eyebrow: "Resultado inicial",
    title: "Stories no primeiro ciclo",
    description: "Stories recebendo visualizações recorrentes ao longo da operação.",
    alt: "Stories do Instagram com contagem de visualizações",
    crop: "object-[center_top]",
  },
  {
    image: proofInstagramAfterProfile,
    period: "after" as const,
    eyebrow: "Após 30 dias",
    title: "Perfil com 8.208 seguidores",
    description: "Perfil atual com 1.763 publicações e 8.208 seguidores, confirmados diretamente no Instagram.",
    alt: "Perfil do Instagram após 30 dias com 8.208 seguidores",
    crop: "object-top",
  },
  {
    image: proofInstagramAfterInsights,
    period: "after" as const,
    eyebrow: "Após 30 dias",
    title: "10,6 milhões de visualizações",
    description: "86 mil interações e 4,5 mil novos seguidores registrados pela Meta até 13 de junho.",
    alt: "Painel profissional do Instagram após 30 dias com 10,6 milhões de visualizações",
    crop: "object-top",
  },
  {
    image: proofInstagramAfterStories,
    period: "after" as const,
    eyebrow: "Após 30 dias",
    title: "Stories alcançando público real",
    description: "Um dos Stories registrou 311 visualizações, com audiência identificável no Instagram.",
    alt: "Story do Instagram após 30 dias com 311 visualizações",
    crop: "object-top",
  },
];

const proofMetrics = {
  before: [
    ["964", "publicações"],
    ["292,6 mil", "visualizações"],
    ["3,3 mil", "interações"],
    ["243", "seguidores iniciais"],
  ],
  after: [
    ["1.763", "publicações"],
    ["10,6 mi", "visualizações"],
    ["86 mil", "interações"],
    ["8.208", "seguidores atuais"],
  ],
};

function FloatingBlobs() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <motion.div
        className="blob absolute -top-24 -left-24 h-[260px] w-[260px] bg-primary/40 sm:-top-40 sm:-left-40 sm:h-[500px] sm:w-[500px]"
        animate={{ x: [0, 100, 0], y: [0, 60, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="blob absolute top-1/3 -right-24 h-[300px] w-[300px] bg-accent/30 sm:-right-40 sm:h-[600px] sm:w-[600px]"
        animate={{ x: [0, -120, 0], y: [0, -80, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="blob absolute bottom-0 left-1/3 h-[260px] w-[260px] sm:h-[450px] sm:w-[450px]"
        style={{ background: "hsl(280 95% 65% / 0.4)" }}
        animate={{ x: [0, 80, 0], y: [0, -50, 0] }}
        transition={{ duration: 25, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

function MagneticCard({ children, className = "", glowColor = "320 90% 60%" }: { children: React.ReactNode; className?: string; glowColor?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const mouseX = useMotionValue(-200);
  const mouseY = useMotionValue(-200);
  const rotateX = useSpring(useTransform(y, [-150, 150], [6, -6]), { stiffness: 200, damping: 20 });
  const rotateY = useSpring(useTransform(x, [-150, 150], [-6, 6]), { stiffness: 200, damping: 20 });

  const handleMouse = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    x.set(px - r.width / 2);
    y.set(py - r.height / 2);
    mouseX.set(px);
    mouseY.set(py);
  };
  const reset = () => { x.set(0); y.set(0); mouseX.set(-300); mouseY.set(-300); };

  const background = useTransform(
    [mouseX, mouseY],
    ([mx, my]: number[]) =>
      `radial-gradient(360px circle at ${mx}px ${my}px, hsl(${glowColor} / 0.22), transparent 60%)`
  );

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={reset}
      style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
      className={`relative ${className}`}
    >
      <motion.div
        style={{ background }}
        className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />
      {children}
    </motion.div>
  );
}

export default function Index() {
  const { user } = useAuth();
  const heroRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [livePlans, setLivePlans] = useState<LandingPlan[] | null>(null);
  const [plansStatus, setPlansStatus] = useState<"loading" | "ready" | "error">("loading");
  const [proofSlide, setProofSlide] = useState(3);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("plan_limits")
        .select("*")
        .neq("plan", "expired")
        .order("sort_order");
      if (error) {
        setLivePlans([]);
        setPlansStatus("error");
        return;
      }
      setLivePlans(data ?? []);
      setPlansStatus("ready");
    })();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setProofSlide((current) => (current + 1) % proofSlides.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, []);

  const activeProof = proofSlides[proofSlide];
  const availablePlans = (livePlans ?? []).filter((row) => row.plan !== "free");
  const previousProof = () => setProofSlide((current) => (current - 1 + proofSlides.length) % proofSlides.length);
  const nextProof = () => setProofSlide((current) => (current + 1) % proofSlides.length);

  return (
    <div className="min-h-screen overflow-x-hidden">
      <SEO
        title="Flux & Feed — Plataforma de conteúdo para Instagram"
        description="Centralize fontes, criação com IA, templates, aprovações, agendamento e publicação no Instagram em uma única plataforma."
        path="/"
      />
      <FAQStructuredData items={faqItems} />

      {/* Header */}
      <motion.header
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-500 ${scrolled ? "glass border-b border-border/40" : ""}`}
      >
        <div className="container flex items-center justify-between gap-3 py-3 md:py-4">
          <Link to="/" className="min-w-0">
            <BrandLogo priority className="h-8 max-w-[190px] sm:h-10 sm:max-w-[240px]" />
          </Link>
          <nav aria-label="Navegação principal" className="hidden items-center gap-5 text-sm text-muted-foreground xl:flex">
            <a href="#features" className="hover:text-foreground transition-colors">Plataforma</a>
            <a href="#resultados" className="hover:text-foreground transition-colors">Resultados</a>
            <a href="#como-funciona" className="hover:text-foreground transition-colors">Como funciona</a>
            <a href="#planos" className="hover:text-foreground transition-colors">Planos</a>
            <a href="#faq" className="hover:text-foreground transition-colors">Ajuda</a>
          </nav>
          <div className="flex shrink-0 items-center gap-2">
            {user ? (
              <Button asChild className="bg-gradient-brand px-3 text-primary-foreground shadow-glow hover:opacity-90 sm:px-4">
                <Link to="/dashboard">Abrir painel <ArrowRight className="h-4 w-4 ml-1" /></Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild className="px-3 sm:px-4"><Link to="/auth">Entrar</Link></Button>
                <Button asChild className="hidden bg-gradient-brand text-primary-foreground shadow-glow hover:opacity-90 sm:inline-flex">
                  <Link to="/auth">Começar teste</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </motion.header>

      {/* HERO */}
      <section ref={heroRef} className="relative overflow-hidden pb-16 pt-28 sm:pb-20 md:pt-40 md:pb-28">
        <div className="absolute inset-0 bg-grid" />
        <div className="absolute inset-0 spotlight opacity-60" />
        <FloatingBlobs />

        <div className="container relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mx-auto flex w-fit items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-medium mb-8 lg:mx-0"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            Toda a operação de conteúdo em um único sistema
          </motion.div>

          <div className="grid min-w-0 items-center gap-10 lg:grid-cols-[1.02fr_0.98fr] lg:gap-12">
            <div className="min-w-0 text-center lg:text-left">
              <h1
                className="mx-auto max-w-[22rem] font-display text-3xl font-bold leading-[1.06] tracking-normal sm:max-w-2xl sm:text-5xl md:text-6xl lg:mx-0 lg:max-w-3xl lg:text-7xl"
              >
                <span className="block">Sua operação de</span>
                <span className="relative inline-block text-gradient glow-text">
                  conteúdo para Instagram
                  <motion.span
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: 1, delay: 0.8, ease: "easeOut" }}
                    className="absolute -bottom-2 left-0 right-0 h-1 origin-left rounded-full bg-gradient-brand"
                  />
                </span>
                <span className="mt-1 block">em um só lugar.</span>
              </h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg md:mt-8 md:text-xl lg:mx-0"
              >
                Centralize fontes, pautas, IA, templates, aprovações, Feed, Stories, Reels e agendamentos.
                Publique pela API oficial da Meta com regras próprias para cada conta.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.45 }}
                className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center md:mt-10 lg:justify-start"
              >
                <Button size="lg" asChild className="h-12 w-full bg-gradient-brand px-5 text-primary-foreground shadow-glow hover:opacity-90 group sm:w-auto sm:px-7">
                  <a href="#features">
                    Explorar a plataforma
                    <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </a>
                </Button>
                <Button size="lg" variant="outline" asChild className="glass h-12 w-full px-5 group sm:w-auto sm:px-7">
                  <a href="#resultados">Ver resultados reais</a>
                </Button>
              </motion.div>
              <p className="mt-4 text-center text-xs text-muted-foreground lg:text-left">
                Teste por 7 dias com cartão cadastrado. Cancele antes da primeira cobrança.
              </p>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 32, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.35, ease: [0.16, 1, 0.3, 1] }}
              className="relative min-w-0 max-w-full"
            >
              <div className="absolute -inset-4 rounded-[2rem] bg-gradient-brand opacity-20 blur-3xl sm:-inset-8" />
              <div className="relative w-full max-w-full overflow-hidden rounded-2xl border border-border/60 bg-card/80 shadow-2xl backdrop-blur-xl">
                <div className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-4 sm:px-5">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">Central de operação</div>
                    <div className="text-xs text-muted-foreground">Conteúdo, agenda e publicação por conta</div>
                  </div>
                  <span className="hidden rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary sm:inline-flex">Online</span>
                </div>
                <div className="grid gap-4 p-3 sm:p-5">
                  <div className="rounded-xl border border-border/60 bg-background/70 p-4">
                    <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                      <span>Conta conectada</span>
                      <span className="truncate">@showdeesportes</span>
                    </div>
                    <div className="mt-3 grid gap-3 text-center sm:grid-cols-3">
                      <div className="rounded-lg bg-muted/50 p-3">
                        <div className="text-lg font-bold text-gradient">60m</div>
                        <div className="text-[11px] text-muted-foreground">Intervalo</div>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3">
                        <div className="text-lg font-bold text-gradient">Reel</div>
                        <div className="text-[11px] text-muted-foreground">Formato</div>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3">
                        <div className="text-lg font-bold text-gradient">API</div>
                        <div className="text-[11px] text-muted-foreground">Publicação</div>
                      </div>
                    </div>
                  </div>
                  {heroQueue.map((item, index) => (
                    <div key={item.title} className="flex min-w-0 items-center gap-3 rounded-xl border border-border/50 bg-background/55 p-3 sm:gap-4 sm:p-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-brand text-sm font-bold text-primary-foreground">
                        {String(index + 1).padStart(2, "0")}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-foreground">{item.title}</div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{item.status}</span>
                          <span>•</span>
                          <span>{item.time}</span>
                        </div>
                      </div>
                      <Check className="hidden h-4 w-4 shrink-0 text-primary sm:block" />
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.7 }}
            className="mx-auto mt-12 grid max-w-4xl grid-cols-2 gap-3 sm:gap-4 md:mt-16 md:grid-cols-4"
          >
            {stats.map((s) => (
              <motion.div
                key={s.label}
                whileHover={{ y: -4 }}
                className="glass rounded-2xl p-5 text-center"
              >
                <div className="font-display text-2xl md:text-3xl font-bold text-gradient">{s.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Bottom fade */}
        <div className="absolute bottom-0 inset-x-0 h-32 bg-gradient-to-t from-background to-transparent pointer-events-none" />
      </section>

      {/* Capacidades da plataforma */}
      <section className="relative border-y border-border/40 py-6 overflow-hidden glass">
        <div className="marquee whitespace-nowrap">
          {[...Array(2)].map((_, k) => (
            <div key={k} className="flex items-center gap-12 text-muted-foreground/60 text-sm font-medium pr-12">
              <span className="flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /> Reescrita com IA generativa</span>
              <span>•</span>
              <span className="flex items-center gap-2"><Instagram className="h-4 w-4 text-primary" /> Meta Graph API oficial</span>
              <span>•</span>
              <span className="flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /> Intervalos seguros por conta</span>
              <span>•</span>
              <span className="flex items-center gap-2"><Rocket className="h-4 w-4 text-primary" /> Fila automática de publicação</span>
              <span>•</span>
              <span className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Painel de status em tempo real</span>
              <span>•</span>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="container relative scroll-mt-20 py-20 md:py-32">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="mx-auto mb-12 max-w-2xl text-center md:mb-16"
        >
          <div className="inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-medium mb-4">
            <Sparkles className="h-3 w-3 text-primary" /> Módulos da plataforma
          </div>
          <h2 className="font-display text-3xl font-bold tracking-normal sm:text-4xl md:text-6xl">
            Toda a operação. <span className="text-gradient">Um só painel.</span>
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
            Explore os recursos que conectam descoberta, produção, aprovação, agenda e publicação.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 perspective-1000">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
            >
              <MagneticCard className="group relative rounded-2xl glass p-6 h-full overflow-hidden hover:shadow-glow transition-shadow duration-500">
                <div className={`absolute -top-20 -right-20 w-48 h-48 rounded-full bg-gradient-to-br ${f.color} opacity-0 group-hover:opacity-30 blur-3xl transition-opacity duration-700`} />
                <motion.div
                  whileHover={{ rotate: 6, scale: 1.05 }}
                  transition={{ type: "spring", stiffness: 300 }}
                  className={`relative h-12 w-12 rounded-xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-5 shadow-lg`}
                >
                  <f.icon className="h-5 w-5 text-white" />
                </motion.div>
                <h3 className="relative font-display font-semibold text-xl mb-2">{f.title}</h3>
                <p className="relative text-sm text-muted-foreground leading-relaxed">{f.text}</p>
              </MagneticCard>
            </motion.div>
          ))}
        </div>
      </section>

      {/* PROVA VISUAL */}
      <section id="resultados" className="container relative scroll-mt-20 py-20 md:py-24">
        <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-medium mb-4">
              <TrendingUp className="h-3 w-3 text-primary" /> Operação real
            </div>
            <h2 className="font-display text-3xl font-bold tracking-normal sm:text-4xl md:text-6xl">
              Feito para quem publica <span className="text-gradient">todo dia</span>
            </h2>
            <p className="mt-5 text-base leading-relaxed text-muted-foreground sm:text-lg">
              O Flux & Feed foi pensado para portais, criadores e páginas de nicho que precisam transformar
              notícias em conteúdo visual com velocidade, controle e consistência.
            </p>
            <div className="mt-8 overflow-hidden rounded-2xl border border-border/60 bg-card/55">
              <div className="grid grid-cols-[1.25fr_0.8fr_0.8fr] border-b border-border/60 bg-background/40 px-4 py-3 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground sm:grid-cols-[1.4fr_0.8fr_0.8fr_0.65fr]">
                <span>Indicador</span>
                <span>Inicial</span>
                <span>Após 30 dias</span>
                <span className="hidden text-right sm:block">Vezes</span>
              </div>
              {proofComparison.map((item) => (
                <div
                  key={item.label}
                  className="grid grid-cols-[1.25fr_0.8fr_0.8fr] items-center border-b border-border/40 px-4 py-4 last:border-b-0 sm:grid-cols-[1.4fr_0.8fr_0.8fr_0.65fr]"
                >
                  <span className="pr-2 text-sm font-medium text-foreground">{item.label}</span>
                  <span className="text-sm text-muted-foreground">{item.before}</span>
                  <span className="font-display text-base font-bold text-foreground">{item.after}</span>
                  <span className="hidden justify-self-end rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300 sm:block">
                    {item.growth}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Comparação entre os registros reais do primeiro ciclo e o período atual de 20 de maio a 18 de junho.
              A última coluna mostra quantas vezes o resultado atual representa o valor inicial.
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              O perfil passou de 243 para 8.208 seguidores. No painel da Meta, a atualização disponível até 13 de junho
              registrava 4,5 mil novos seguidores; o total atual foi confirmado diretamente no perfil do Instagram.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.98 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7 }}
            className="relative"
          >
            <div className="absolute -inset-4 rounded-[2rem] bg-primary/20 blur-3xl sm:-inset-8" />
            <div className="relative rounded-2xl border border-border/60 bg-card/80 p-3 shadow-2xl backdrop-blur-xl sm:p-5">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold">Evolução comprovada em conta real</div>
                  <div className="text-xs text-muted-foreground">Registros do primeiro ciclo e do resultado após 30 dias</div>
                </div>
                <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-300">Ativo</span>
              </div>
              <div className="relative overflow-hidden rounded-xl border border-border/60 bg-background/70">
                <img
                  src={activeProof.image}
                  alt={activeProof.alt}
                  className={`h-[360px] w-full object-cover transition-all duration-500 sm:h-[430px] md:h-[520px] ${activeProof.crop}`}
                  loading="lazy"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/80 to-transparent p-5">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">{activeProof.eyebrow}</div>
                  <div className="text-sm font-semibold text-foreground">{activeProof.title}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{activeProof.description}</div>
                </div>
                <button
                  type="button"
                  onClick={previousProof}
                  className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-background/80 text-foreground backdrop-blur transition hover:bg-background"
                  aria-label="Ver prova anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={nextProof}
                  className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border/60 bg-background/80 text-foreground backdrop-blur transition hover:bg-background"
                  aria-label="Ver próxima prova"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
                <div className="absolute left-1/2 top-4 flex -translate-x-1/2 gap-2">
                  {proofSlides.map((slide, index) => (
                    <button
                      key={slide.title}
                      type="button"
                      onClick={() => setProofSlide(index)}
                      className={`h-2 rounded-full transition-all ${index === proofSlide ? "w-7 bg-primary" : "w-2 bg-foreground/35"}`}
                      aria-label={`Ver ${slide.title}`}
                    />
                  ))}
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                {proofMetrics[activeProof.period].map(([value, label]) => (
                  <div key={label} className="rounded-xl bg-background/70 p-3 text-center">
                    <div className="font-display text-xl font-bold text-gradient">{value}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section id="como-funciona" className="container relative scroll-mt-20 py-20 md:py-32">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mx-auto mb-12 max-w-2xl text-center md:mb-16"
        >
          <div className="inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-medium mb-4">
            <Rocket className="h-3 w-3 text-primary" /> Como funciona
          </div>
          <h2 className="font-display text-3xl font-bold tracking-normal sm:text-4xl md:text-6xl">
            Da fonte à publicação em <span className="text-gradient">4 passos</span>
          </h2>
        </motion.div>

        <div className="relative grid gap-8 md:grid-cols-4 md:gap-6">
          <div className="hidden md:block absolute top-12 left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          {steps.map((s, i) => (
            <motion.div
              key={s.n}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: i * 0.15 }}
              className="relative text-center"
            >
              <div className="relative inline-flex items-center justify-center mb-6">
                <div className="absolute inset-0 bg-gradient-brand blur-2xl opacity-50 animate-float" />
                <div className="relative h-20 w-20 rounded-2xl bg-gradient-brand flex items-center justify-center shadow-glow">
                  <span className="font-display font-bold text-2xl text-primary-foreground">{s.n}</span>
                </div>
              </div>
              <h3 className="mb-2 font-display text-xl font-semibold sm:text-2xl">{s.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">{s.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* PLANOS */}
      <section id="planos" className="container relative scroll-mt-20 py-20 md:py-32">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mx-auto mb-12 max-w-2xl text-center md:mb-16"
        >
          <div className="inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-medium mb-4">
            <Star className="h-3 w-3 text-primary" /> Planos
          </div>
          <h2 className="font-display text-3xl font-bold tracking-normal sm:text-4xl md:text-6xl">
            Escolha seu <span className="text-gradient">volume</span>
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
            Comece pequeno, valide sua operação e escale para mais contas quando precisar.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 max-w-7xl mx-auto">
          {plansStatus === "loading" && [...Array(3)].map((_, index) => (
            <div key={index} className="h-[430px] animate-pulse rounded-2xl border border-border/40 bg-card/45" aria-hidden="true" />
          ))}
          {plansStatus === "error" && (
            <div className="col-span-full rounded-2xl border border-amber-300/20 bg-amber-300/5 p-8 text-center">
              <h3 className="font-display text-xl font-semibold">Planos temporariamente indisponíveis</h3>
              <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
                Não foi possível carregar os valores agora. Nossa equipe pode apresentar o plano ideal para sua operação.
              </p>
              <Button variant="outline" asChild className="mt-5">
                <a href={WHATSAPP_CONTACT_URL} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 h-4 w-4" /> Falar com a equipe
                </a>
              </Button>
            </div>
          )}
          {plansStatus === "ready" && availablePlans.length === 0 && (
            <div className="col-span-full rounded-2xl border border-border/50 bg-card/50 p-8 text-center">
              <h3 className="font-display text-xl font-semibold">Novos planos em configuração</h3>
              <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
                Fale com nossa equipe para conhecer os limites, valores e opções disponíveis para sua operação.
              </p>
              <Button variant="outline" asChild className="mt-5">
                <a href={WHATSAPP_CONTACT_URL} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 h-4 w-4" /> Consultar planos
                </a>
              </Button>
            </div>
          )}
          {plansStatus === "ready" && availablePlans.map((row, i) => {
            const cta = PLAN_CTA[row.plan] || { label: "Saiba mais", to: "/pricing" };
            const p = {
              name: row.display_name?.split(" (")[0] || row.plan,
              price: fmtBRL(row.price_brl, row.is_negotiable),
              suffix: row.is_negotiable ? "" : "/mês",
              subtitle: PLAN_SUBTITLES[row.plan] || "",
              bestFor: planBestFor[row.plan] || "Escolha o volume ideal para sua rotina.",
              cta: cta.label,
              to: cta.to,
              whatsapp: !!cta.whatsapp,
              highlight: row.plan === "pro",
              features: buildFeatures(row),
            };
            return (
            <motion.div
              key={p.name}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              whileHover={{ y: -6 }}
              className={`relative rounded-2xl p-6 flex flex-col ${p.highlight ? "gradient-border shadow-glow" : "glass"}`}
            >
              {p.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-brand text-primary-foreground text-xs font-bold px-3 py-1 rounded-full shadow-glow">
                  MAIS POPULAR
                </div>
              )}
              <div className="mb-4">
                <h3 className="font-display font-bold text-xl">{p.name}</h3>
                <p className="text-xs text-muted-foreground mt-1">{p.subtitle}</p>
                <p className="mt-3 rounded-lg bg-muted/45 px-3 py-2 text-xs text-muted-foreground">{p.bestFor}</p>
              </div>
              <div className="mb-5">
                <div className="flex items-baseline gap-1 flex-wrap">
                  <span className={`font-display font-bold ${p.price.length > 6 ? "text-2xl" : "text-4xl"} ${p.highlight ? "text-gradient" : ""}`}>
                    {p.price}
                  </span>
                  {p.suffix && <span className="text-muted-foreground text-sm">{p.suffix}</span>}
                </div>
              </div>
              <ul className="space-y-2.5 mb-6 text-sm flex-1">
                {p.features.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <div className="h-5 w-5 rounded-full bg-primary/15 flex items-center justify-center shrink-0 mt-0.5">
                      <Check className="h-3 w-3 text-primary" />
                    </div>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              {p.whatsapp ? (
                <Button className="w-full" variant="outline" asChild>
                  <a href={WHATSAPP_CONTACT_URL} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="h-4 w-4 mr-2" /> {p.cta}
                  </a>
                </Button>
              ) : (
                <Button
                  className={`w-full ${p.highlight ? "bg-gradient-brand text-primary-foreground shadow-glow hover:opacity-90" : ""}`}
                  variant={p.highlight ? "default" : "outline"}
                  asChild
                >
                  <Link to={p.to!}>{p.cta}</Link>
                </Button>
              )}
            </motion.div>
            );
          })}
        </div>
        <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-muted-foreground">
          Todos os planos usam publicação pela API oficial da Meta. O ritmo de postagem depende dos limites configurados e das políticas do Instagram.
        </p>
      </section>

      {/* FAQ */}
      <section id="faq" className="container scroll-mt-20 py-20 md:py-32">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mx-auto mb-10 max-w-2xl text-center md:mb-12"
        >
          <div className="inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-medium mb-4">
            <HelpCircle className="h-3 w-3 text-primary" /> Perguntas frequentes
          </div>
          <h2 className="font-display text-3xl font-bold tracking-normal sm:text-4xl md:text-6xl">
            Ainda tem <span className="text-gradient">dúvidas?</span>
          </h2>
        </motion.div>
        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="space-y-3">
            {faqItems.map((item, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="glass rounded-xl border-border/40 px-5">
                <AccordionTrigger className="text-left font-medium hover:no-underline">{item.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>


      <section className="container py-20 md:py-32">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="relative overflow-hidden rounded-2xl glass p-6 text-center sm:p-10 md:rounded-3xl md:p-20"
        >
          <div className="absolute inset-0 spotlight opacity-50" />
          <div className="absolute inset-0 bg-grid opacity-50" />
          <div className="relative">
            <h2 className="mx-auto max-w-3xl font-display text-3xl font-bold tracking-normal sm:text-4xl md:text-6xl">
              Organize sua operação de conteúdo no <span className="text-gradient">Flux & Feed</span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:mt-6 sm:text-lg">
              Teste por 7 dias com cartão cadastrado. A cobrança começa somente depois do período de teste.
            </p>
            <Button size="lg" asChild className="mt-8 h-14 w-full bg-gradient-brand px-6 text-base text-primary-foreground shadow-glow hover:opacity-90 group sm:mt-10 sm:w-auto sm:px-10">
              <Link to="/auth">
                Começar teste de 7 dias <ArrowRight className="h-5 w-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-10">
        <div className="container flex flex-col items-center justify-between gap-4 text-center text-sm text-muted-foreground md:flex-row md:text-left">
          <BrandLogo className="h-8 max-w-[210px]" />
          <nav className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
            <Link to="/terms" className="hover:text-foreground transition-colors">Termos</Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">Privacidade</Link>
            <a href="#faq" className="hover:text-foreground transition-colors">Ajuda</a>
            <a href={WHATSAPP_CONTACT_URL} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">Contato</a>
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Abrir Instagram do Flux & Feed"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-card/60 text-muted-foreground transition-colors hover:border-primary/60 hover:text-primary"
            >
              <Instagram className="h-5 w-5" />
            </a>
          </nav>
          <div>© {new Date().getFullYear()} Flux & Feed. Todos os direitos reservados.</div>
        </div>
      </footer>

      {/* Atendimento via WhatsApp */}
      <a
        href={WHATSAPP_CONTACT_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Falar com a equipe do Flux & Feed pelo WhatsApp"
        title="Falar com a equipe pelo WhatsApp"
        className="group fixed bottom-4 right-4 z-[70] inline-flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-full border border-emerald-400/30 bg-[#0d1712]/95 p-2 shadow-[0_16px_45px_rgba(0,0,0,0.45),0_0_28px_rgba(37,211,102,0.16)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-emerald-300/60 hover:shadow-[0_20px_55px_rgba(0,0,0,0.5),0_0_34px_rgba(37,211,102,0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:bottom-6 sm:right-6 sm:pr-5"
      >
        <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-emerald-950/40 transition-transform duration-300 group-hover:scale-105">
          <MessageCircle className="h-6 w-6" strokeWidth={2.4} aria-hidden="true" />
          <span className="absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-[#0d1712] bg-emerald-200" />
        </span>
        <span className="hidden min-w-0 flex-col text-left sm:flex">
          <span className="whitespace-nowrap text-sm font-semibold text-white">Fale com a equipe</span>
          <span className="whitespace-nowrap text-[11px] text-emerald-200/80">Atendimento pelo WhatsApp</span>
        </span>
      </a>
    </div>
  );
}
