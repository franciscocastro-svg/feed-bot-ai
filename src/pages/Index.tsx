import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { SEO } from "@/components/SEO";
import { useEffect, useRef, useState } from "react";
import { motion, useTransform, useMotionValue, useSpring } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Sparkles, Newspaper, Bot, Image as ImageIcon, Instagram, Calendar, Shield,
  ArrowRight, Check, MessageCircle, Zap, Rocket, TrendingUp, Star, Play, HelpCircle,
  ChevronLeft, ChevronRight
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import whatsappBot from "@/assets/whatsapp-bot.jpg";
import logoImg from "@/assets/logo.png";
import proofInstagramProfile from "@/assets/proof-instagram-profile.jpg";
import proofInstagramInsights from "@/assets/proof-instagram-insights.jpg";
import proofInstagramStories from "@/assets/proof-instagram-stories.jpg";

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

function fmtBRL(n: number | null | undefined, isNegotiable: boolean): string {
  if (isNegotiable || n === null || n === undefined) return "Sob consulta";
  if (Number(n) === 0) return "R$ 0";
  return `R$ ${Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
function fmtLimit(n: number | null | undefined, label: string): string {
  if (n === null || n === undefined || n === -1) return `${label} ilimitado`;
  return `${n} ${label}`;
}
function buildFeatures(p: any): string[] {
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
  { value: "RSS", label: "Fontes automáticas" },
  { value: "Reels", label: "Templates prontos" },
  { value: "API", label: "Meta oficial" },
  { value: "Seguro", label: "Intervalos por conta" },
];

const steps = [
  { n: "01", title: "Conecte fontes RSS", text: "Escolha os sites, nichos e contas do Instagram que receberão as notícias." },
  { n: "02", title: "A IA prepara o conteúdo", text: "O NewsFlow reescreve, cria legenda e monta o Reel ou post com template." },
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

const proofItems = [
  { label: "998 conteúdos compartilhados", text: "Volume real publicado em um ciclo de operação intensa." },
  { label: "292,6 mil visualizações", text: "Alcance exibido no painel profissional do Instagram." },
  { label: "3,3 mil interações", text: "Conteúdo recorrente gerando atividade na conta." },
];

const faqItems = [
  { q: "Como funciona o trial gratuito?", a: "Você tem 7 dias para testar todos os recursos do plano Free sem precisar de cartão. Pode cancelar a qualquer momento." },
  { q: "Vocês usam a API oficial do Instagram?", a: "Sim, usamos integração oficial e segura com o Instagram." },
  { q: "O Instagram pode bloquear a conta?", a: "Qualquer automação pode sofrer limites se houver excesso de ações. Por isso o NewsFlow usa intervalo mínimo, limite diário, horários e fila por conta para reduzir risco. Você também pode revisar manualmente antes de publicar." },
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
    title: "Perfil com volume real",
    description: "964 posts publicados com identidade visual consistente.",
    alt: "Perfil do Instagram com posts gerados pelo NewsFlow",
    crop: "object-top",
  },
  {
    image: proofInstagramInsights,
    title: "Painel profissional",
    description: "292,6 mil visualizações, 3,3 mil interações e 194 novos seguidores.",
    alt: "Painel profissional do Instagram com 292,6 mil visualizações",
    crop: "object-top",
  },
  {
    image: proofInstagramStories,
    title: "Stories com público real",
    description: "Stories recebendo visualizações recorrentes ao longo da operação.",
    alt: "Stories do Instagram com contagem de visualizações",
    crop: "object-[center_top]",
  },
];

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

/** Custom cursor — small dot + trailing ring that grows over interactive elements */
function CursorGlow() {
  const dotX = useMotionValue(-100);
  const dotY = useMotionValue(-100);
  const ringX = useSpring(dotX, { stiffness: 250, damping: 28, mass: 0.5 });
  const ringY = useSpring(dotY, { stiffness: 250, damping: 28, mass: 0.5 });
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      dotX.set(e.clientX);
      dotY.set(e.clientY);
      const t = e.target as HTMLElement | null;
      setHovering(!!t?.closest("a, button, [role='button'], input, textarea, select, label"));
    };
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, [dotX, dotY]);

  return (
    <>
      <motion.div
        aria-hidden
        style={{ x: dotX, y: dotY }}
        className="pointer-events-none fixed left-0 top-0 z-[60] hidden md:block"
      >
        <div className="h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary))]" />
      </motion.div>
      <motion.div
        aria-hidden
        style={{ x: ringX, y: ringY }}
        className="pointer-events-none fixed left-0 top-0 z-[60] hidden md:block"
      >
        <motion.div
          animate={{ scale: hovering ? 2.2 : 1, opacity: hovering ? 0.9 : 0.5 }}
          transition={{ type: "spring", stiffness: 250, damping: 20 }}
          className="h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/60"
        />
      </motion.div>
    </>
  );
}

export default function Index() {
  const { user } = useAuth();
  const heroRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [livePlans, setLivePlans] = useState<any[] | null>(null);
  const [proofSlide, setProofSlide] = useState(0);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("plan_limits")
        .select("*")
        .neq("plan", "expired")
        .order("sort_order");
      if (data) setLivePlans(data);
    })();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setProofSlide((current) => (current + 1) % proofSlides.length);
    }, 4500);
    return () => window.clearInterval(timer);
  }, []);

  const activeProof = proofSlides[proofSlide];
  const previousProof = () => setProofSlide((current) => (current - 1 + proofSlides.length) % proofSlides.length);
  const nextProof = () => setProofSlide((current) => (current + 1) % proofSlides.length);

  return (
    <div className="min-h-screen overflow-x-hidden">
      <SEO
        title="NewsFlow — Automação de Instagram com IA"
        description="Automação de Instagram com IA para transformar notícias, pautas e conteúdos em posts, stories e reels. Capte por RSS, reescreva e publique pela API oficial da Meta."
        path="/"
      />
      <FAQStructuredData items={faqItems} />

      <CursorGlow />
      {/* Header */}
      <motion.header
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-500 ${scrolled ? "glass border-b border-border/40" : ""}`}
      >
        <div className="container flex items-center justify-between gap-3 py-3 md:py-4">
          <Link to="/" className="flex min-w-0 items-center gap-2 group">
            <motion.img
              src={logoImg}
              alt="NewsFlow logo"
              whileHover={{ scale: 1.1 }}
              transition={{ duration: 0.3 }}
              className="h-10 w-10 rounded-xl object-contain shadow-glow sm:h-12 sm:w-12 md:h-16 md:w-16"
            />
            <span className="truncate font-display text-xl font-bold sm:text-2xl">NewsFlow</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Recursos</a>
            <a href="#como-funciona" className="hover:text-foreground transition-colors">Como funciona</a>
            <a href="#planos" className="hover:text-foreground transition-colors">Planos</a>
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
                  <Link to="/auth">Testar 7 dias</Link>
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
            RSS + IA + Instagram em um fluxo seguro
          </motion.div>

          <div className="grid min-w-0 items-center gap-10 lg:grid-cols-[1.02fr_0.98fr] lg:gap-12">
            <div className="min-w-0 text-center lg:text-left">
              <h1
                className="mx-auto max-w-[22rem] font-display text-3xl font-bold leading-[1.08] tracking-normal sm:max-w-2xl sm:text-5xl md:text-7xl lg:mx-0 lg:text-8xl"
              >
                <span className="block sm:inline">Transforme notícias</span>{" "}
                <span className="block sm:inline">
                  em{" "}
                  <span className="relative inline-block">
                    <span className="text-gradient glow-text">Reels prontos</span>
                    <motion.span
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 1, delay: 0.8, ease: "easeOut" }}
                      className="absolute -bottom-2 left-0 right-0 h-1 bg-gradient-brand origin-left rounded-full"
                    />
                  </span>
                </span>
                <br className="hidden sm:block" />
                <span className="block sm:inline">para postar no Instagram.</span>
              </h1>

              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.3 }}
                className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg md:mt-8 md:text-xl lg:mx-0"
              >
                O NewsFlow busca notícias por RSS, reescreve com IA, monta artes e Reels com template
                e publica respeitando horários, limite diário e intervalo de cada conta.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.45 }}
                className="mt-8 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center md:mt-10 lg:justify-start"
              >
                <Button size="lg" asChild className="h-12 w-full bg-gradient-brand px-5 text-primary-foreground shadow-glow hover:opacity-90 group sm:w-auto sm:px-7">
                  <Link to="/auth">
                    Testar 7 dias com cartão
                    <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="glass h-12 w-full px-5 group sm:w-auto sm:px-7">
                  <a href="#como-funciona"><Play className="h-4 w-4 mr-2 group-hover:scale-125 transition-transform" /> Ver como funciona</a>
                </Button>
              </motion.div>
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
                    <div className="text-sm font-semibold text-foreground">Fila do autopiloto</div>
                    <div className="text-xs text-muted-foreground">1 notícia por vez, com intervalo seguro</div>
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

      {/* Marquee logos / trust */}
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
      <section id="features" className="container relative py-20 md:py-32">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="mx-auto mb-12 max-w-2xl text-center md:mb-16"
        >
          <div className="inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-medium mb-4">
            <Sparkles className="h-3 w-3 text-primary" /> Tudo que você precisa
          </div>
          <h2 className="font-display text-3xl font-bold tracking-normal sm:text-4xl md:text-6xl">
            Uma plataforma. <span className="text-gradient">Zero esforço.</span>
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
            Da captação à publicação — automatizamos cada etapa do seu fluxo de conteúdo.
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
      <section className="container relative py-20 md:py-24">
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
              O NewsFlow foi pensado para portais, criadores e páginas de nicho que precisam transformar
              notícias em conteúdo visual com velocidade, controle e consistência.
            </p>
            <div className="mt-8 grid gap-3">
              {proofItems.map((item) => (
                <div key={item.label} className="flex gap-3 rounded-xl border border-border/50 bg-card/50 p-4">
                  <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15">
                    <Check className="h-3.5 w-3.5 text-primary" />
                  </div>
                  <div>
                    <div className="font-medium text-foreground">{item.label}</div>
                    <div className="text-sm text-muted-foreground">{item.text}</div>
                  </div>
                </div>
              ))}
            </div>
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
                  <div className="text-sm font-semibold">Resultados em conta real</div>
                  <div className="text-xs text-muted-foreground">Prints reais do painel profissional e do perfil</div>
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
                {[
                  ["964", "posts"],
                  ["292,6 mil", "visualizações"],
                  ["3,3 mil", "interações"],
                  ["194", "novos seguidores"],
                ].map(([value, label]) => (
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
      <section id="como-funciona" className="container relative py-20 md:py-32">
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
            Do feed ao feed em <span className="text-gradient">4 passos</span>
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
      <section id="planos" className="container relative py-20 md:py-32">
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
          {(livePlans ?? []).filter(row => row.plan !== "free").map((row, i) => {
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
                  <a href="https://wa.me/5547996080134?text=Quero%20o%20plano%20Business" target="_blank" rel="noopener noreferrer">
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
      <section id="faq" className="container py-20 md:py-32">
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
              Crie seu autopiloto de notícias para <span className="text-gradient">Instagram</span>
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted-foreground sm:mt-6 sm:text-lg">
              Teste grátis, sem cartão, com RSS, IA, templates e fila de publicação em um único painel.
            </p>
            <Button size="lg" asChild className="mt-8 h-14 w-full bg-gradient-brand px-6 text-base text-primary-foreground shadow-glow hover:opacity-90 group sm:mt-10 sm:w-auto sm:px-10">
              <Link to="/auth">
                Criar meu autopiloto <ArrowRight className="h-5 w-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-10">
        <div className="container flex flex-col items-center justify-between gap-4 text-center text-sm text-muted-foreground md:flex-row md:text-left">
          <div className="flex items-center gap-2">
            <img src={logoImg} alt="NewsFlow logo" className="h-10 w-10 rounded-lg object-contain" />
            <span className="font-display font-bold text-foreground">NewsFlow</span>
          </div>
          <nav className="flex flex-wrap items-center justify-center gap-4 sm:gap-6">
            <Link to="/terms" className="hover:text-foreground transition-colors">Termos</Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">Privacidade</Link>
            <a href="https://wa.me/5547996080134" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">Contato</a>
          </nav>
          <div>© {new Date().getFullYear()} NewsFlow. Todos os direitos reservados.</div>
        </div>
      </footer>

      {/* WhatsApp flutuante */}
      <a
        href="https://wa.me/5547996080134?text=Ol%C3%A1%21%20Tenho%20interesse%20no%20NewsFlow"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Falar no WhatsApp"
        className="fixed bottom-4 right-4 z-50 h-14 w-14 rounded-full overflow-hidden shadow-glow transition-transform hover:scale-110 sm:bottom-6 sm:right-6 sm:h-16 sm:w-16"
      >
        <img src={whatsappBot} alt="Falar no WhatsApp" width={64} height={64} loading="lazy" decoding="async" className="h-full w-full object-cover" />
      </a>
    </div>
  );
}
