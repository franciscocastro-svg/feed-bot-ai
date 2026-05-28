import { Link } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { useEffect, useRef, useState } from "react";
import { motion, useTransform, useMotionValue, useSpring } from "framer-motion";
import { Button } from "@/components/ui/button";
import {
  Sparkles, Newspaper, Bot, Image as ImageIcon, Instagram, Calendar, Shield,
  ArrowRight, Check, MessageCircle, Zap, Rocket, TrendingUp, Star, Play, HelpCircle
} from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import whatsappBot from "@/assets/whatsapp-bot.png";
import logoImg from "@/assets/logo.png";

const PLAN_SUBTITLES: Record<string, string> = {
  free: "Trial 7 dias",
  starter: "Para quem está escalando",
  pro: "Profissionais e agências",
  business: "Operação em escala",
};
const PLAN_CTA: Record<string, { label: string; to?: string; whatsapp?: boolean }> = {
  free: { label: "Começar grátis", to: "/auth" },
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
  { icon: Newspaper, title: "Captação de notícias", text: "Conecte feeds RSS de qualquer fonte (G1, UOL, NewsAPI). Atualização automática a cada X minutos.", color: "from-pink-500 to-rose-500" },
  { icon: Bot, title: "Reescrita com IA", text: "Resumo, título viral e legenda otimizada com hashtags — sem plágio, em segundos.", color: "from-purple-500 to-pink-500" },
  { icon: ImageIcon, title: "Imagem 1080x1080", text: "Templates dinâmicos ou geração visual com IA. Fonte discreta e layout profissional.", color: "from-orange-500 to-pink-500" },
  { icon: Instagram, title: "Publicação automática", text: "Integração com a Meta Graph API. Postar agora ou agendar para o melhor horário.", color: "from-fuchsia-500 to-purple-500" },
  { icon: Calendar, title: "Painel administrativo", text: "Aprovação manual opcional, status de cada notícia, frequência por nicho.", color: "from-pink-500 to-orange-400" },
  { icon: Shield, title: "Regras e segurança", text: "Limite diário, anti-spam, log completo de atividade.", color: "from-purple-500 to-fuchsia-500" },
];

const stats = [
  { value: "10k+", label: "Posts gerados" },
  { value: "98%", label: "Aprovação IA" },
  { value: "24/7", label: "Automação" },
  { value: "<3s", label: "Por publicação" },
];

const steps = [
  { n: "01", title: "Conecte suas fontes", text: "Adicione feeds RSS, contas Instagram e templates em minutos." },
  { n: "02", title: "IA reescreve tudo", text: "Título viral, legenda otimizada e imagem profissional automaticamente." },
  { n: "03", title: "Publique no piloto", text: "Agende ou publique na hora. Você só revisa o que importa." },
];

function FloatingBlobs() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <motion.div
        className="blob absolute -top-40 -left-40 w-[500px] h-[500px] bg-primary/40"
        animate={{ x: [0, 100, 0], y: [0, 60, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="blob absolute top-1/3 -right-40 w-[600px] h-[600px] bg-accent/30"
        animate={{ x: [0, -120, 0], y: [0, -80, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="blob absolute bottom-0 left-1/3 w-[450px] h-[450px]"
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

  return (
    <div className="min-h-screen overflow-x-hidden">
      <SEO
        title="NewsFlow — Automação Instagram com IA"
        description="Capture notícias por RSS, reescreva com IA e publique no Instagram automaticamente. Teste grátis 7 dias, planos a partir de R$ 29/mês."
        path="/"
      />
      <CursorGlow />
      {/* Header */}
      <motion.header
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className={`fixed top-0 inset-x-0 z-50 transition-all duration-500 ${scrolled ? "glass border-b border-border/40" : ""}`}
      >
        <div className="container flex items-center justify-between py-4">
          <Link to="/" className="flex items-center gap-2 group">
            <motion.img
              src={logoImg}
              alt="NewsFlow logo"
              whileHover={{ scale: 1.1 }}
              transition={{ duration: 0.3 }}
              className="h-14 w-14 md:h-16 md:w-16 rounded-xl object-contain shadow-glow"
            />
            <span className="font-display font-bold text-2xl">NewsFlow</span>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Features</a>
            <a href="#como-funciona" className="hover:text-foreground transition-colors">Como funciona</a>
            <a href="#planos" className="hover:text-foreground transition-colors">Planos</a>
          </nav>
          <div className="flex items-center gap-2">
            {user ? (
              <Button asChild className="bg-gradient-brand text-primary-foreground shadow-glow hover:opacity-90">
                <Link to="/dashboard">Abrir painel <ArrowRight className="h-4 w-4 ml-1" /></Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" asChild><Link to="/auth">Entrar</Link></Button>
                <Button asChild className="bg-gradient-brand text-primary-foreground shadow-glow hover:opacity-90">
                  <Link to="/auth">Começar grátis</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </motion.header>

      {/* HERO */}
      <section ref={heroRef} className="relative pt-40 pb-32 md:pt-48 md:pb-40 overflow-hidden">
        <div className="absolute inset-0 bg-grid" />
        <div className="absolute inset-0 spotlight opacity-60" />
        <FloatingBlobs />

        <div className="container relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-medium mb-8"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
            Automação de conteúdo com IA
          </motion.div>

          <h1
            className="font-display text-5xl md:text-7xl lg:text-8xl font-bold leading-[1.02] tracking-tight max-w-5xl mx-auto"
          >
            Transforme notícias em{" "}
            <span className="relative inline-block">
              <span className="text-gradient glow-text">posts virais</span>
              <motion.span
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 1, delay: 0.8, ease: "easeOut" }}
                className="absolute -bottom-2 left-0 right-0 h-1 bg-gradient-brand origin-left rounded-full"
              />
            </span>
            <br />no piloto automático.
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-8 text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto"
          >
            Capte feeds, reescreva com IA, gere imagens 1080×1080 e publique no Instagram —
            tudo em um único painel.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.45 }}
            className="mt-10 flex flex-wrap items-center justify-center gap-3"
          >
            <Button size="lg" asChild className="bg-gradient-brand text-primary-foreground shadow-glow hover:opacity-90 group h-12 px-7">
              <Link to="/auth">
                Começar agora
                <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="glass h-12 px-7 group">
              <Link to="/auth"><Play className="h-4 w-4 mr-2 group-hover:scale-125 transition-transform" /> Ver demo</Link>
            </Button>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.7 }}
            className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto"
          >
            {stats.map((s) => (
              <motion.div
                key={s.label}
                whileHover={{ y: -4 }}
                className="glass rounded-2xl p-5"
              >
                <div className="font-display text-3xl md:text-4xl font-bold text-gradient">{s.value}</div>
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
              <span className="flex items-center gap-2"><Zap className="h-4 w-4 text-primary" /> Powered by GPT-5 & Gemini 2.5</span>
              <span>•</span>
              <span className="flex items-center gap-2"><Instagram className="h-4 w-4 text-primary" /> Meta Graph API oficial</span>
              <span>•</span>
              <span className="flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /> Anti-spam integrado</span>
              <span>•</span>
              <span className="flex items-center gap-2"><Rocket className="h-4 w-4 text-primary" /> Auto-publicação 24/7</span>
              <span>•</span>
              <span className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Insights avançados</span>
              <span>•</span>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="container py-32 relative">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <div className="inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-medium mb-4">
            <Sparkles className="h-3 w-3 text-primary" /> Tudo que você precisa
          </div>
          <h2 className="font-display text-4xl md:text-6xl font-bold tracking-tight">
            Uma plataforma. <span className="text-gradient">Zero esforço.</span>
          </h2>
          <p className="mt-4 text-muted-foreground text-lg">
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

      {/* COMO FUNCIONA */}
      <section id="como-funciona" className="container py-32 relative">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <div className="inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-medium mb-4">
            <Rocket className="h-3 w-3 text-primary" /> Como funciona
          </div>
          <h2 className="font-display text-4xl md:text-6xl font-bold tracking-tight">
            Do feed ao feed em <span className="text-gradient">3 passos</span>
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6 relative">
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
              <h3 className="font-display font-semibold text-2xl mb-2">{s.title}</h3>
              <p className="text-muted-foreground">{s.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* PLANOS */}
      <section id="planos" className="container py-32 relative">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <div className="inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-medium mb-4">
            <Star className="h-3 w-3 text-primary" /> Planos
          </div>
          <h2 className="font-display text-4xl md:text-6xl font-bold tracking-tight">
            Escolha seu <span className="text-gradient">volume</span>
          </h2>
          <p className="mt-4 text-muted-foreground text-lg">
            Cobrança mensal recorrente. Cancele quando quiser. Sem fidelidade.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 max-w-7xl mx-auto">
          {(livePlans ?? []).map((row, i) => {
            const cta = PLAN_CTA[row.plan] || { label: "Saiba mais", to: "/pricing" };
            const p = {
              name: row.display_name?.split(" (")[0] || row.plan,
              price: fmtBRL(row.price_brl, row.is_negotiable),
              suffix: row.plan === "free" ? (row.trial_days ? `/${row.trial_days} dias` : "") : (row.is_negotiable ? "" : "/mês"),
              subtitle: PLAN_SUBTITLES[row.plan] || "",
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
      </section>

      {/* FAQ */}
      <section id="faq" className="container py-32">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center max-w-2xl mx-auto mb-12"
        >
          <div className="inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-medium mb-4">
            <HelpCircle className="h-3 w-3 text-primary" /> Perguntas frequentes
          </div>
          <h2 className="font-display text-4xl md:text-6xl font-bold tracking-tight">
            Ainda tem <span className="text-gradient">dúvidas?</span>
          </h2>
        </motion.div>
        <div className="max-w-3xl mx-auto">
          <Accordion type="single" collapsible className="space-y-3">
            {[
              { q: "Como funciona o trial gratuito?", a: "Você tem 7 dias para testar todos os recursos do plano Free sem precisar de cartão. Pode cancelar a qualquer momento." },
              { q: "Vocês usam a API oficial do Instagram?", a: "Sim, usamos integração oficial e segura com o Instagram." },
              { q: "Posso conectar mais de uma conta?", a: "Sim. O plano Pro permite até 3 contas e o Business 10+. Cada conta tem agenda e regras independentes." },
              { q: "A IA pode publicar sem revisão?", a: "Você escolhe. Tem o modo de aprovação manual (você revisa cada post) e o modo piloto automático (publica direto seguindo seus filtros e horários)." },
              { q: "Posso cancelar quando quiser?", a: "Sim. Cobrança mensal recorrente sem fidelidade. Cancele em um clique pelo painel — o acesso fica até o fim do período pago." },
              { q: "Quais fontes de notícias posso usar?", a: "Qualquer feed RSS público: G1, UOL, ESPN, blogs de nicho, NewsAPI etc. Você cadastra quantos quiser dentro do limite do seu plano." },
              { q: "Como é cobrado?", a: "Cobrança mensal via cartão de crédito processada pela Stripe. Emissão de nota fiscal sob demanda." },
              { q: "Tem suporte humano?", a: "Sim. Suporte por email em todos os planos e por WhatsApp nos planos Pro e Business." },
            ].map((item, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="glass rounded-xl border-border/40 px-5">
                <AccordionTrigger className="text-left font-medium hover:no-underline">{item.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">{item.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>


      <section className="container py-32">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="relative overflow-hidden rounded-3xl glass p-12 md:p-20 text-center"
        >
          <div className="absolute inset-0 spotlight opacity-50" />
          <div className="absolute inset-0 bg-grid opacity-50" />
          <div className="relative">
            <h2 className="font-display text-4xl md:text-6xl font-bold tracking-tight max-w-3xl mx-auto">
              Pronto para colocar seu Instagram no <span className="text-gradient">piloto automático?</span>
            </h2>
            <p className="mt-6 text-muted-foreground text-lg max-w-xl mx-auto">
              Comece grátis. Sem cartão. Cancele quando quiser.
            </p>
            <Button size="lg" asChild className="mt-10 bg-gradient-brand text-primary-foreground shadow-glow hover:opacity-90 h-14 px-10 text-base group">
              <Link to="/auth">
                Começar agora <ArrowRight className="h-5 w-5 ml-2 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/40 py-10">
        <div className="container flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <img src={logoImg} alt="NewsFlow logo" className="h-10 w-10 rounded-lg object-contain" />
            <span className="font-display font-bold text-foreground">NewsFlow</span>
          </div>
          <nav className="flex items-center gap-6">
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
        className="fixed bottom-6 right-6 z-50 h-16 w-16 rounded-full overflow-hidden shadow-glow hover:scale-110 transition-transform"
      >
        <img src={whatsappBot} alt="Falar no WhatsApp" className="h-full w-full object-cover" />
      </a>
    </div>
  );
}
