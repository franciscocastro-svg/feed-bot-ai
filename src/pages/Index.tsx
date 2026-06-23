import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "framer-motion";
import {
  ArrowRight,
  Bot,
  Calendar,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Image as ImageIcon,
  Instagram,
  MessageCircle,
  Newspaper,
  Play,
  Radio,
  Shield,
  Zap,
} from "lucide-react";
import { SEO } from "@/components/SEO";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import proofInstagramProfile from "@/assets/proof-instagram-profile.jpg";
import proofInstagramInsights from "@/assets/proof-instagram-insights.jpg";
import proofInstagramStories from "@/assets/proof-instagram-stories.jpg";
import proofInstagramAfterProfile from "@/assets/proof-instagram-after-profile.jpg";
import proofInstagramAfterInsights from "@/assets/proof-instagram-after-insights.jpg";
import proofInstagramAfterStories from "@/assets/proof-instagram-after-stories.jpg";

const INSTAGRAM_URL = "https://www.instagram.com/fluxifeed?utm_source=qr&igsh=MXVkbHIxa3FwMWJ3YQ==";
const WHATSAPP_CONTACT_URL =
  "https://api.whatsapp.com/send?phone=5547996080134&text=Ol%C3%A1%21%20Quero%20saber%20mais%20sobre%20o%20Flux%20%26%20Feed.";

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

const PLAN_SUBTITLES: Record<string, string> = {
  starter: "Para começar uma operação",
  pro: "Para criadores e agências",
  business: "Para operações com várias contas",
};

const PLAN_CTA: Record<string, { label: string; to?: string; whatsapp?: boolean }> = {
  starter: { label: "Assinar Starter", to: "/pricing?plan=starter_monthly" },
  pro: { label: "Assinar Pro", to: "/pricing?plan=pro_monthly" },
  business: { label: "Falar com vendas", whatsapp: true },
};

const heroQueue = [
  { number: "01", title: "Mercado reage à nova decisão de juros", status: "REEL PRONTO", time: "12:30", color: "#ff4b19" },
  { number: "02", title: "Tecnologia impulsiona pequenas empresas", status: "AGENDADO", time: "13:30", color: "#11100f" },
  { number: "03", title: "Nova pauta em análise pela IA", status: "PREPARANDO", time: "A SEGUIR", color: "#aaa39d" },
];

const features = [
  { code: "CAP.01", icon: Newspaper, title: "Captação contínua", text: "RSS, sites, temas e URLs alimentam a operação sem depender de busca manual." },
  { code: "IA.02", icon: Bot, title: "Edição com IA", text: "Título, resumo e legenda são preparados no tom de cada marca, com revisão opcional." },
  { code: "VIS.03", icon: ImageIcon, title: "Identidade por conta", text: "Feed, Stories e Reels usam templates e elementos visuais próprios de cada cliente." },
  { code: "API.04", icon: Instagram, title: "Publicação oficial", text: "Agendamento e publicação pela Meta Graph API, sem navegador aberto ou extensão." },
  { code: "OPS.05", icon: Calendar, title: "Fila operacional", text: "Horários, status, tentativas e contas ficam organizados numa visão única." },
  { code: "SEG.06", icon: Shield, title: "Ritmo controlado", text: "Intervalos e limites diários reduzem excesso de ações e protegem a operação." },
];

const steps = [
  { n: "01", title: "Conecte as fontes", text: "Defina portais, temas, URLs e as contas que receberão cada conteúdo." },
  { n: "02", title: "A IA prepara", text: "A notícia vira texto editorial, arte e Reel com o padrão visual escolhido." },
  { n: "03", title: "Você aprova", text: "Revise cada peça ou ative o piloto automático conforme a sua operação." },
  { n: "04", title: "A fila publica", text: "O sistema respeita horários, intervalo e limite diário de cada conta." },
];

const proofComparison = [
  { label: "Publicações no perfil", before: "964", after: "1.763", growth: "1,83×" },
  { label: "Visualizações", before: "292,6 mil", after: "10,6 mi", growth: "36,23×" },
  { label: "Interações", before: "3,3 mil", after: "86 mil", growth: "26,06×" },
  { label: "Total de seguidores", before: "243", after: "8.208", growth: "33,78×" },
];

const proofSlides = [
  { image: proofInstagramProfile, period: "before" as const, title: "Perfil no primeiro ciclo", description: "964 publicações com identidade visual consistente.", alt: "Perfil do Instagram no primeiro ciclo" },
  { image: proofInstagramInsights, period: "before" as const, title: "292,6 mil visualizações", description: "Registro inicial do painel profissional do Instagram.", alt: "Insights iniciais do Instagram" },
  { image: proofInstagramStories, period: "before" as const, title: "Stories em operação", description: "Conteúdo recorrente distribuído ao longo do dia.", alt: "Stories no primeiro ciclo" },
  { image: proofInstagramAfterProfile, period: "after" as const, title: "8.208 seguidores", description: "Perfil atual com 1.763 publicações.", alt: "Perfil após 30 dias" },
  { image: proofInstagramAfterInsights, period: "after" as const, title: "10,6 milhões de visualizações", description: "86 mil interações registradas no período.", alt: "Insights após 30 dias" },
  { image: proofInstagramAfterStories, period: "after" as const, title: "Alcance em público real", description: "Stories publicados e acompanhados no Instagram.", alt: "Stories após 30 dias" },
];

const proofMetrics = {
  before: [["964", "publicações"], ["292,6 mil", "visualizações"], ["3,3 mil", "interações"], ["243", "seguidores"]],
  after: [["1.763", "publicações"], ["10,6 mi", "visualizações"], ["86 mil", "interações"], ["8.208", "seguidores"]],
};

const faqItems = [
  { q: "Como funciona o teste de 7 dias?", a: "Você escolhe um plano, cadastra o cartão com segurança pela Stripe e testa a plataforma por 7 dias. A cobrança começa somente depois do teste e você pode cancelar antes disso." },
  { q: "Vocês usam a API oficial do Instagram?", a: "Sim. A publicação utiliza a integração oficial da Meta para contas profissionais autorizadas." },
  { q: "Preciso deixar meu computador ligado?", a: "Não. A geração, a fila e a publicação rodam na infraestrutura da plataforma." },
  { q: "Posso revisar antes de publicar?", a: "Sim. Você pode trabalhar com aprovação manual ou ativar o piloto automático por conta." },
  { q: "Cada conta pode ter seu próprio template?", a: "Sim. Cada conta pode usar marca, template, frequência e regras próprias para Feed, Stories e Reels." },
  { q: "Posso conectar mais de uma conta?", a: "Sim. A quantidade disponível depende do plano contratado." },
  { q: "Posso cancelar quando quiser?", a: "Sim. A cobrança é mensal, sem fidelidade, e o cancelamento é feito pelo painel." },
];

const editorEase = [0.16, 1, 0.3, 1] as const;

function fmtBRL(n: number | null | undefined, isNegotiable: boolean): string {
  if (isNegotiable || n === null || n === undefined) return "Sob consulta";
  if (Number(n) === 0) return "R$ 0";
  return `R$ ${Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}`;
}

function fmtLimit(n: number | null | undefined, label: string): string {
  if (n === null || n === undefined || n === -1) return `${label} ilimitado`;
  return `${n} ${label}`;
}

function buildFeatures(plan: LandingPlan): string[] {
  return [
    fmtLimit(plan.max_ig_accounts, plan.max_ig_accounts === 1 ? "conta Instagram" : "contas Instagram"),
    fmtLimit(plan.max_posts_per_day, "posts/dia"),
    fmtLimit(plan.max_rss_sources, "fontes"),
    fmtLimit(plan.max_reels_per_month, "Reels IA/mês"),
    fmtLimit(plan.max_images_per_month, "imagens IA/mês"),
    plan.auto_publish_enabled ? "Piloto automático" : "Aprovação manual",
  ];
}

function FAQStructuredData() {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqItems.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
  return <Helmet><script type="application/ld+json">{JSON.stringify(data)}</script></Helmet>;
}

function SectionLabel({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div className={`mb-5 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] ${dark ? "text-white/55" : "text-[#625c57]"}`}>
      <span className="h-2 w-2 bg-gradient-to-br from-[#ff2ba6] via-[#a840f4] to-[#ff7417]" />
      {children}
    </div>
  );
}

function Reveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 28 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.65, delay, ease: editorEase }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function InteractivePanel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const pointerX = useMotionValue(50);
  const pointerY = useMotionValue(50);
  const rotateX = useSpring(useTransform(pointerY, [0, 100], [2.5, -2.5]), { stiffness: 180, damping: 25 });
  const rotateY = useSpring(useTransform(pointerX, [0, 100], [-2.5, 2.5]), { stiffness: 180, damping: 25 });

  const handlePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!ref.current || reduceMotion) return;
    const rect = ref.current.getBoundingClientRect();
    pointerX.set(((event.clientX - rect.left) / rect.width) * 100);
    pointerY.set(((event.clientY - rect.top) / rect.height) * 100);
  };

  return (
    <motion.div
      ref={ref}
      onPointerMove={handlePointer}
      onPointerLeave={() => { pointerX.set(50); pointerY.set(50); }}
      style={reduceMotion ? undefined : { rotateX, rotateY, transformPerspective: 1200 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function QueuePreview() {
  const reduceMotion = useReducedMotion();
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % heroQueue.length), 2400);
    return () => window.clearInterval(timer);
  }, [reduceMotion]);

  return (
    <InteractivePanel className="relative">
      <div className="absolute -right-3 top-3 h-full w-full border-2 border-[#11100f] bg-[#11100f] sm:-right-5 sm:top-5" />
      <div className="relative border border-[#cfc8c1] bg-[#fbf9f6] shadow-[0_30px_70px_rgba(40,25,17,0.12)]">
        <div className="flex items-center justify-between border-b border-[#d9d2cb] px-4 py-4 text-[10px] uppercase tracking-[0.12em] sm:px-6">
          <span className="flex items-center gap-2 font-semibold">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-50" />
              <span className="relative rounded-full bg-emerald-500" />
            </span>
            Online · @showdeesportes
          </span>
          <span className="text-[#716a64]">Fila ao vivo</span>
        </div>
        <div className="space-y-3 p-4 sm:p-6">
          {heroQueue.map((item, index) => (
            <motion.div
              key={item.number}
              animate={reduceMotion ? undefined : {
                x: active === index ? 5 : 0,
                borderColor: active === index ? "#ff4b19" : "#d9d2cb",
                backgroundColor: active === index ? "#fffdf9" : "#fbf9f6",
              }}
              transition={{ duration: 0.45, ease: editorEase }}
              className="grid grid-cols-[42px_1fr] gap-3 border p-4 sm:grid-cols-[50px_1fr] sm:gap-4"
            >
              <span className="font-display text-2xl font-bold text-[#aaa39d]">{item.number}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{item.title}</p>
                <div className="mt-2 flex items-center gap-2 text-[9px] uppercase tracking-[0.1em]">
                  <span className="px-2 py-1 text-white" style={{ backgroundColor: item.color }}>{item.status}</span>
                  <span className="text-[#756e68]">{item.time}</span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
        <div className="grid grid-cols-3 border-t border-[#d9d2cb]">
          {[["10,6 mi", "Visualizações"], ["Reel", "Formato"], ["API", "Publicação"]].map(([value, label], index) => (
            <div key={label} className={`p-4 text-center sm:p-5 ${index > 0 ? "border-l border-[#d9d2cb]" : ""}`}>
              <div className={`font-display text-xl font-bold sm:text-2xl ${index === 0 ? "text-[#ff4b19]" : "text-[#11100f]"}`}>{value}</div>
              <div className="mt-1 text-[9px] uppercase tracking-[0.1em] text-[#756e68]">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </InteractivePanel>
  );
}

export default function Index() {
  const { user } = useAuth();
  const reduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 24, restDelta: 0.001 });
  const [scrolled, setScrolled] = useState(false);
  const [plans, setPlans] = useState<LandingPlan[]>([]);
  const [plansStatus, setPlansStatus] = useState<"loading" | "ready" | "error">("loading");
  const [proofSlide, setProofSlide] = useState(3);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("plan_limits").select("*").neq("plan", "expired").order("sort_order");
      if (error) {
        setPlansStatus("error");
        return;
      }
      setPlans((data ?? []) as LandingPlan[]);
      setPlansStatus("ready");
    })();
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const timer = window.setInterval(() => setProofSlide((current) => (current + 1) % proofSlides.length), 5000);
    return () => window.clearInterval(timer);
  }, [reduceMotion]);

  const activeProof = proofSlides[proofSlide];
  const availablePlans = plans.filter((plan) => plan.plan !== "free");
  const previousProof = () => setProofSlide((current) => (current - 1 + proofSlides.length) % proofSlides.length);
  const nextProof = () => setProofSlide((current) => (current + 1) % proofSlides.length);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#f4f0eb] text-[#11100f] selection:bg-[#ff4b19] selection:text-white">
      <SEO
        title="Flux & Feed — Plataforma de conteúdo para Instagram"
        description="Centralize fontes, criação com IA, templates, aprovações, agendamento e publicação no Instagram."
        path="/"
      />
      <FAQStructuredData />

      <motion.div className="fixed inset-x-0 top-0 z-[80] h-[3px] origin-left bg-gradient-to-r from-[#ff2ba6] via-[#a840f4] to-[#ff7417]" style={{ scaleX: progress }} />

      <header className={`fixed inset-x-0 top-0 z-50 border-b transition duration-300 ${scrolled ? "border-[#d7d0c9] bg-[#f4f0eb]/95 shadow-[0_10px_40px_rgba(38,26,20,0.06)] backdrop-blur-xl" : "border-transparent bg-[#f4f0eb]/80 backdrop-blur-sm"}`}>
        <div className="container flex h-[74px] items-center justify-between gap-4">
          <Link to="/" aria-label="Flux & Feed — início">
            <BrandLogo priority className="h-8 max-w-[190px] sm:h-9 sm:max-w-[225px]" />
          </Link>
          <nav className="hidden items-center gap-8 text-sm lg:flex">
            <a href="#plataforma" className="transition hover:text-[#ff4b19]">Plataforma</a>
            <a href="#resultados" className="transition hover:text-[#ff4b19]">Resultados</a>
            <a href="#como-funciona" className="transition hover:text-[#ff4b19]">Como funciona</a>
            <a href="#planos" className="transition hover:text-[#ff4b19]">Planos</a>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Button asChild className="rounded-none bg-[#11100f] text-white hover:bg-[#ff4b19]">
                <Link to="/dashboard">Abrir painel <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" className="hidden rounded-none hover:bg-transparent hover:text-[#ff4b19] sm:inline-flex"><Link to="/auth">Entrar</Link></Button>
                <Button asChild className="rounded-none bg-[#11100f] text-white hover:bg-[#ff4b19]">
                  <Link to="/auth">Teste grátis 7 dias <ArrowRight className="ml-2 h-4 w-4" /></Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden pb-20 pt-32 md:pb-28 md:pt-40">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(49,37,30,0.055)_1px,transparent_1px),linear-gradient(to_bottom,rgba(49,37,30,0.055)_1px,transparent_1px)] bg-[size:64px_64px]" />
          <motion.div
            aria-hidden="true"
            animate={reduceMotion ? undefined : { x: ["-10%", "8%", "-10%"], y: ["0%", "5%", "0%"] }}
            transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
            className="pointer-events-none absolute -right-24 top-20 h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,rgba(255,43,166,0.12),rgba(168,64,244,0.07)_45%,transparent_70%)] blur-3xl md:h-[620px] md:w-[620px]"
          />
          <div className="container relative">
            <div className="mb-12 flex items-center justify-between border-b border-[#cec7c0] pb-7 text-[10px] uppercase tracking-[0.12em] text-[#625c57]">
              <span className="flex items-center gap-2"><span className="h-2 w-2 bg-[#ff4b19]" /> Ed. 01 · Operação de conteúdo</span>
              <span className="hidden sm:block">Brasil · Plataforma online</span>
            </div>

            <div className="grid items-center gap-14 lg:grid-cols-[1.12fr_0.88fr] lg:gap-16">
              <div>
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0, x: -24 }}
                  animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
                  transition={{ duration: 0.6, ease: editorEase }}
                  className="mb-8 inline-flex items-center gap-2 bg-[#11100f] px-4 py-2 text-[10px] font-medium uppercase tracking-[0.12em] text-white"
                >
                  <Zap className="h-3 w-3" /> Operação real · API oficial da Meta
                </motion.div>
                <motion.h1
                  initial={reduceMotion ? false : { opacity: 0, y: 34 }}
                  animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                  transition={{ duration: 0.8, delay: 0.08, ease: editorEase }}
                  className="max-w-[780px] font-display text-[clamp(3.4rem,8vw,7.5rem)] font-bold leading-[0.84] tracking-[-0.075em]"
                >
                  Toda sua<br />
                  operação de{" "}
                  <span className="bg-gradient-to-r from-[#ff2ba6] via-[#a840f4] to-[#ff7417] bg-clip-text font-serif font-normal italic tracking-[-0.04em] text-transparent">
                    Instagram
                  </span><br />
                  num único painel.
                </motion.h1>
                <motion.p
                  initial={reduceMotion ? false : { opacity: 0, y: 20 }}
                  animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                  transition={{ duration: 0.65, delay: 0.25, ease: editorEase }}
                  className="mt-8 max-w-xl text-base leading-relaxed text-[#625c57] md:text-lg"
                >
                  Fontes, IA, templates, aprovação, agenda e publicação trabalhando como uma única operação de conteúdo.
                </motion.p>
                <motion.div
                  initial={reduceMotion ? false : { opacity: 0, y: 18 }}
                  animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.36, ease: editorEase }}
                  className="mt-9 flex flex-col gap-3 sm:flex-row"
                >
                  <Button size="lg" asChild className="group h-[52px] rounded-none bg-gradient-to-r from-[#ff2ba6] via-[#a840f4] to-[#ff7417] px-7 text-white shadow-[0_16px_34px_rgba(192,47,148,0.2)] hover:brightness-105">
                    <Link to="/auth">Testar por 7 dias <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
                  </Button>
                  <Button size="lg" variant="outline" asChild className="h-[52px] rounded-none border-[#11100f] bg-transparent px-7 hover:bg-[#11100f] hover:text-white">
                    <a href="#como-funciona"><Play className="mr-2 h-4 w-4" /> Ver como funciona</a>
                  </Button>
                </motion.div>
                <p className="mt-4 text-[11px] uppercase tracking-[0.08em] text-[#817972]">Cartão cadastrado · cancele antes da primeira cobrança</p>
              </div>
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, x: 36, scale: 0.97 }}
                animate={reduceMotion ? undefined : { opacity: 1, x: 0, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.22, ease: editorEase }}
              >
                <QueuePreview />
              </motion.div>
            </div>
          </div>
        </section>

        <section className="overflow-hidden border-y border-[#cfc8c1] bg-[#fbf9f6] py-4">
          <div className="marquee flex w-max items-center text-[10px] font-semibold uppercase tracking-[0.13em] text-[#4f4944]">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex items-center gap-10 pr-10">
                {["RSS e sites", "IA editorial", "Templates por conta", "Feed, Stories e Reels", "API oficial da Meta", "Fila inteligente", "Métricas reais"].map((item) => (
                  <span key={item} className="flex items-center gap-3"><span className="h-1.5 w-1.5 bg-[#ff4b19]" /> {item}</span>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section id="plataforma" className="scroll-mt-24 bg-[#11100f] py-24 text-white md:py-32">
          <div className="container">
            <div className="grid gap-10 border-b border-white/15 pb-14 lg:grid-cols-[0.75fr_1.25fr]">
              <Reveal>
                <SectionLabel dark>Plataforma</SectionLabel>
                <p className="max-w-xs text-sm leading-relaxed text-white/55">
                  Um sistema operacional para quem transforma informação em conteúdo todos os dias.
                </p>
              </Reveal>
              <Reveal delay={0.08}>
                <h2 className="max-w-4xl font-display text-4xl font-bold leading-[0.98] tracking-[-0.055em] sm:text-6xl lg:text-7xl">
                  Menos ferramentas soltas.<br />
                  <span className="bg-gradient-to-r from-[#ff2ba6] via-[#b34cf4] to-[#ff7417] bg-clip-text text-transparent">Mais operação conectada.</span>
                </h2>
              </Reveal>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3">
              {features.map((feature, index) => (
                <motion.article
                  key={feature.code}
                  initial={reduceMotion ? false : { opacity: 0, y: 24 }}
                  whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.55, delay: index * 0.06, ease: editorEase }}
                  whileHover={reduceMotion ? undefined : { backgroundColor: "rgba(255,255,255,0.06)" }}
                  className="group min-h-[280px] border-b border-white/15 p-7 transition lg:border-r"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold tracking-[0.16em] text-white/40">{feature.code}</span>
                    <feature.icon className="h-5 w-5 text-[#ff5c24] transition-transform duration-300 group-hover:rotate-6 group-hover:scale-110" />
                  </div>
                  <h3 className="mt-16 font-display text-2xl font-semibold tracking-[-0.03em]">{feature.title}</h3>
                  <p className="mt-4 max-w-sm text-sm leading-relaxed text-white/55">{feature.text}</p>
                  <div className="mt-8 h-px w-10 bg-gradient-to-r from-[#ff2ba6] to-[#ff7417] transition-all duration-500 group-hover:w-full" />
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        <section id="resultados" className="scroll-mt-24 py-24 md:py-32">
          <div className="container">
            <div className="grid items-start gap-14 lg:grid-cols-[0.82fr_1.18fr]">
              <Reveal className="lg:sticky lg:top-28">
                <SectionLabel>Resultados em conta real</SectionLabel>
                <h2 className="font-display text-4xl font-bold leading-[0.98] tracking-[-0.055em] sm:text-6xl">
                  Números que saem do painel e chegam ao perfil.
                </h2>
                <p className="mt-6 max-w-lg text-base leading-relaxed text-[#625c57]">
                  Comparação entre o primeiro ciclo registrado e o período atual da operação.
                </p>
                <div className="mt-10 border-t border-[#cbc4bd]">
                  {proofComparison.map((item) => (
                    <div key={item.label} className="grid grid-cols-[1.2fr_0.7fr_0.8fr] items-center border-b border-[#cbc4bd] py-4 text-sm">
                      <span className="pr-3 font-medium">{item.label}</span>
                      <span className="text-[#817972]">{item.before}</span>
                      <span className="flex items-center justify-between font-bold">{item.after}<span className="hidden bg-[#dff4e9] px-2 py-1 text-[10px] text-[#087443] sm:block">{item.growth}</span></span>
                    </div>
                  ))}
                </div>
                <p className="mt-5 text-xs leading-relaxed text-[#817972]">
                  Resultados variam conforme nicho, frequência, qualidade editorial e período analisado.
                </p>
              </Reveal>

              <Reveal delay={0.08}>
                <InteractivePanel className="relative">
                  <div className="absolute -right-4 top-4 h-full w-full bg-gradient-to-br from-[#ff2ba6] via-[#a840f4] to-[#ff7417]" />
                  <div className="relative border border-[#cfc8c1] bg-[#fbf9f6] p-4 sm:p-6">
                    <div className="mb-5 flex items-center justify-between border-b border-[#d7d0c9] pb-4">
                      <div>
                        <p className="text-sm font-bold">Evolução comprovada</p>
                        <p className="mt-1 text-[10px] uppercase tracking-[0.1em] text-[#756e68]">Registros do Instagram</p>
                      </div>
                      <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.1em] text-[#087443]"><Radio className="h-3 w-3" /> Ativo</span>
                    </div>
                    <div className="relative overflow-hidden bg-[#e9e4de]">
                      <AnimatePresence mode="wait">
                        <motion.img
                          key={activeProof.image}
                          src={activeProof.image}
                          alt={activeProof.alt}
                          initial={reduceMotion ? false : { opacity: 0, scale: 1.03 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={reduceMotion ? undefined : { opacity: 0 }}
                          transition={{ duration: 0.45 }}
                          className="h-[390px] w-full object-cover object-top sm:h-[540px]"
                          loading="lazy"
                        />
                      </AnimatePresence>
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent p-5 text-white">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#ffb495]">{activeProof.period === "after" ? "Após 30 dias" : "Ciclo inicial"}</p>
                        <p className="mt-1 text-xl font-bold">{activeProof.title}</p>
                        <p className="mt-1 text-xs text-white/70">{activeProof.description}</p>
                      </div>
                      <button onClick={previousProof} aria-label="Resultado anterior" className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center bg-white text-black transition hover:bg-[#ff4b19] hover:text-white"><ChevronLeft className="h-4 w-4" /></button>
                      <button onClick={nextProof} aria-label="Próximo resultado" className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center bg-white text-black transition hover:bg-[#ff4b19] hover:text-white"><ChevronRight className="h-4 w-4" /></button>
                    </div>
                    <div className="mt-4 grid grid-cols-2 border border-[#d7d0c9] sm:grid-cols-4">
                      {proofMetrics[activeProof.period].map(([value, label], index) => (
                        <div key={label} className={`p-4 text-center ${index > 0 ? "border-l border-[#d7d0c9]" : ""}`}>
                          <p className="font-display text-xl font-bold text-[#ff4b19]">{value}</p>
                          <p className="mt-1 text-[9px] uppercase tracking-[0.1em] text-[#756e68]">{label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </InteractivePanel>
              </Reveal>
            </div>
          </div>
        </section>

        <section id="como-funciona" className="scroll-mt-24 border-y border-[#cbc4bd] bg-[#fbf9f6] py-24 md:py-32">
          <div className="container">
            <Reveal className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr]">
              <div>
                <SectionLabel>Fluxo de trabalho</SectionLabel>
                <p className="max-w-sm text-sm leading-relaxed text-[#625c57]">Da notícia encontrada à publicação no Instagram, com controle em cada etapa.</p>
              </div>
              <h2 className="font-display text-4xl font-bold leading-[0.98] tracking-[-0.055em] sm:text-6xl">
                Quatro etapas.<br />Uma operação contínua.
              </h2>
            </Reveal>
            <div className="mt-16 grid border-l border-t border-[#cbc4bd] md:grid-cols-2 lg:grid-cols-4">
              {steps.map((step, index) => (
                <motion.article
                  key={step.n}
                  initial={reduceMotion ? false : { opacity: 0, y: 24 }}
                  whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1, ease: editorEase }}
                  className="group min-h-[285px] border-b border-r border-[#cbc4bd] p-6 sm:p-8"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-display text-4xl font-bold text-[#b1aaa4]">{step.n}</span>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </div>
                  <h3 className="mt-20 font-display text-2xl font-semibold tracking-[-0.03em]">{step.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-[#625c57]">{step.text}</p>
                </motion.article>
              ))}
            </div>
          </div>
        </section>

        <section id="planos" className="scroll-mt-24 bg-[#11100f] py-24 text-white md:py-32">
          <div className="container">
            <Reveal className="grid gap-8 border-b border-white/15 pb-12 lg:grid-cols-[0.7fr_1.3fr]">
              <div>
                <SectionLabel dark>Planos</SectionLabel>
                <p className="max-w-sm text-sm leading-relaxed text-white/55">Comece com o volume atual e aumente quando a operação pedir.</p>
              </div>
              <h2 className="font-display text-4xl font-bold leading-[0.98] tracking-[-0.055em] sm:text-6xl">Estrutura para cada fase da sua operação.</h2>
            </Reveal>

            <div className="mt-12 grid gap-px bg-white/15 lg:grid-cols-3">
              {plansStatus === "loading" && [0, 1, 2].map((item) => <div key={item} className="h-[460px] animate-pulse bg-white/[0.04]" />)}
              {plansStatus === "error" && (
                <div className="col-span-full bg-white/[0.04] p-12 text-center">
                  <p className="text-white/65">Os planos não carregaram agora.</p>
                  <Button asChild variant="outline" className="mt-5 rounded-none border-white/30 bg-transparent text-white hover:bg-white hover:text-black"><a href={WHATSAPP_CONTACT_URL}>Falar com a equipe</a></Button>
                </div>
              )}
              {plansStatus === "ready" && availablePlans.map((plan, index) => {
                const cta = PLAN_CTA[plan.plan] || { label: "Ver plano", to: "/pricing" };
                const highlighted = plan.plan === "pro";
                return (
                  <motion.article
                    key={plan.plan}
                    initial={reduceMotion ? false : { opacity: 0, y: 24 }}
                    whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: index * 0.08, ease: editorEase }}
                    className={`relative flex min-h-[500px] flex-col p-7 sm:p-9 ${highlighted ? "bg-gradient-to-b from-[#321429] to-[#151013]" : "bg-[#171615]"}`}
                  >
                    {highlighted && <span className="absolute right-0 top-0 bg-gradient-to-r from-[#ff2ba6] to-[#ff7417] px-4 py-2 text-[9px] font-bold uppercase tracking-[0.12em]">Mais escolhido</span>}
                    <span className="text-[10px] uppercase tracking-[0.14em] text-white/40">{String(index + 1).padStart(2, "0")} · Plano</span>
                    <h3 className="mt-8 font-display text-3xl font-bold">{plan.display_name?.split(" (")[0] || plan.plan}</h3>
                    <p className="mt-2 text-sm text-white/50">{PLAN_SUBTITLES[plan.plan] || "Para sua operação"}</p>
                    <div className="mt-9 border-y border-white/15 py-7">
                      <span className="font-display text-4xl font-bold">{fmtBRL(plan.price_brl, plan.is_negotiable)}</span>
                      {!plan.is_negotiable && <span className="ml-2 text-sm text-white/45">/mês</span>}
                    </div>
                    <ul className="mt-7 flex-1 space-y-3">
                      {buildFeatures(plan).map((feature) => (
                        <li key={feature} className="flex items-center gap-3 text-sm text-white/70"><CircleCheck className="h-4 w-4 text-[#ff5c24]" /> {feature}</li>
                      ))}
                    </ul>
                    {cta.whatsapp ? (
                      <Button asChild className="mt-8 rounded-none bg-white text-black hover:bg-[#ff4b19] hover:text-white"><a href={WHATSAPP_CONTACT_URL} target="_blank" rel="noreferrer">{cta.label}</a></Button>
                    ) : (
                      <Button asChild className={`mt-8 rounded-none ${highlighted ? "bg-gradient-to-r from-[#ff2ba6] to-[#ff7417] text-white" : "bg-white text-black hover:bg-[#ff4b19] hover:text-white"}`}><Link to={cta.to || "/pricing"}>{cta.label}</Link></Button>
                    )}
                  </motion.article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-24 py-24 md:py-32">
          <div className="container grid gap-12 lg:grid-cols-[0.7fr_1.3fr]">
            <Reveal>
              <SectionLabel>Ajuda</SectionLabel>
              <h2 className="font-display text-4xl font-bold leading-[0.98] tracking-[-0.055em] sm:text-6xl">Perguntas antes de começar.</h2>
              <p className="mt-6 max-w-sm text-sm leading-relaxed text-[#625c57]">Informação clara para você decidir com segurança.</p>
            </Reveal>
            <Reveal delay={0.08}>
              <Accordion type="single" collapsible className="border-t border-[#bbb3ac]">
                {faqItems.map((item, index) => (
                  <AccordionItem key={item.q} value={`faq-${index}`} className="border-b border-[#bbb3ac]">
                    <AccordionTrigger className="py-6 text-left text-base font-semibold hover:text-[#ff4b19] hover:no-underline sm:text-lg">{item.q}</AccordionTrigger>
                    <AccordionContent className="max-w-2xl pb-6 leading-relaxed text-[#625c57]">{item.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </Reveal>
          </div>
        </section>

        <section className="container pb-24 md:pb-32">
          <Reveal>
            <div className="relative overflow-hidden bg-[#ff4b19] p-8 text-white sm:p-12 md:p-16">
              <motion.div
                aria-hidden="true"
                animate={reduceMotion ? undefined : { rotate: [0, 8, 0], scale: [1, 1.08, 1] }}
                transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -right-20 -top-32 h-[440px] w-[440px] rounded-full border-[80px] border-white/10"
              />
              <div className="relative grid items-end gap-10 lg:grid-cols-[1.3fr_0.7fr]">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/70">Próxima publicação: agora</p>
                  <h2 className="mt-5 max-w-4xl font-display text-4xl font-bold leading-[0.95] tracking-[-0.055em] sm:text-6xl md:text-7xl">Coloque sua operação de conteúdo em movimento.</h2>
                </div>
                <div className="lg:text-right">
                  <Button size="lg" asChild className="group h-14 rounded-none bg-[#11100f] px-8 text-white hover:bg-white hover:text-black">
                    <Link to="/auth">Começar teste <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-1" /></Link>
                  </Button>
                  <p className="mt-4 text-xs text-white/65">7 dias para testar a plataforma.</p>
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-[#cfc8c1] bg-[#fbf9f6] py-10">
        <div className="container flex flex-col items-center justify-between gap-6 text-center text-xs text-[#625c57] md:flex-row md:text-left">
          <BrandLogo className="h-8 max-w-[210px]" />
          <nav className="flex flex-wrap items-center justify-center gap-5">
            <Link to="/terms" className="hover:text-[#ff4b19]">Termos</Link>
            <Link to="/privacy" className="hover:text-[#ff4b19]">Privacidade</Link>
            <a href="#faq" className="hover:text-[#ff4b19]">Ajuda</a>
            <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer" className="hover:text-[#ff4b19]">Instagram</a>
            <a href={WHATSAPP_CONTACT_URL} target="_blank" rel="noreferrer" className="hover:text-[#ff4b19]">Contato</a>
          </nav>
          <span>© {new Date().getFullYear()} Flux & Feed</span>
        </div>
      </footer>

      <a
        href={WHATSAPP_CONTACT_URL}
        target="_blank"
        rel="noreferrer"
        aria-label="Falar com a equipe no WhatsApp"
        className="group fixed bottom-5 right-5 z-[70] flex items-center gap-3 bg-[#11100f] p-3 text-white shadow-[0_18px_45px_rgba(17,16,15,0.25)] transition hover:-translate-y-1 hover:bg-[#ff4b19] sm:px-5"
      >
        <MessageCircle className="h-5 w-5" />
        <span className="hidden text-xs font-semibold uppercase tracking-[0.1em] sm:block">Fale conosco</span>
      </a>
    </div>
  );
}
