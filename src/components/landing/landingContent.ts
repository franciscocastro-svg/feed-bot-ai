import {
  BarChart3,
  Bot,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  FileCheck2,
  ImageIcon,
  Instagram,
  LayoutDashboard,
  Newspaper,
  Palette,
  Rss,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  type LucideIcon,
  WandSparkles,
  Zap,
} from "lucide-react";

export type IconContent = {
  icon: LucideIcon;
  title: string;
  text: string;
};

export type WorkflowStep = IconContent & {
  shortLabel: string;
};

export type ComparisonRow = {
  category: string;
  manual: string;
  flux: string;
};

export type FAQItem = {
  q: string;
  a: string;
};

export type LandingPlan = {
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

export const navLinks = [
  { label: "Como funciona", href: "#como-funciona" },
  { label: "Recursos", href: "#recursos" },
  { label: "Resultados", href: "#resultados" },
  { label: "Planos", href: "#planos" },
  { label: "Dúvidas", href: "#faq" },
];

export const problemCards: IconContent[] = [
  {
    icon: Clock3,
    title: "Horas em tarefas repetitivas",
    text: "Buscar pautas, adaptar textos, montar artes e organizar horários consome o tempo que deveria ir para a estratégia.",
  },
  {
    icon: FileCheck2,
    title: "Processos espalhados",
    text: "Fontes, aprovações, arquivos e agenda ficam em ferramentas diferentes — e a operação perde contexto.",
  },
  {
    icon: Target,
    title: "Consistência difícil de manter",
    text: "Sem um fluxo previsível, a frequência cai, a identidade varia e boas pautas ficam pelo caminho.",
  },
];

export const solutionBenefits: IconContent[] = [
  {
    icon: Rss,
    title: "Descoberta centralizada",
    text: "Reúna RSS, sites, temas, URLs e pautas próprias em uma única entrada editorial.",
  },
  {
    icon: WandSparkles,
    title: "Produção assistida por IA",
    text: "Transforme uma pauta em texto, legenda, carrossel, Feed, Story ou Reel, sempre com opção de revisão.",
  },
  {
    icon: CalendarCheck2,
    title: "Agenda sob controle",
    text: "Defina horários, limites e intervalos por conta para organizar a publicação com previsibilidade.",
  },
  {
    icon: Instagram,
    title: "Publicação oficial",
    text: "Envie o conteúdo pela API oficial da Meta sem depender de navegador aberto ou rotinas improvisadas.",
  },
];

export const workflowSteps: WorkflowStep[] = [
  {
    icon: Newspaper,
    shortLabel: "Fonte",
    title: "A pauta entra",
    text: "Notícia, RSS, tema, URL ou ideia própria.",
  },
  {
    icon: Bot,
    shortLabel: "IA",
    title: "A IA organiza",
    text: "Título, estrutura, legenda e formato são preparados.",
  },
  {
    icon: Palette,
    shortLabel: "Design",
    title: "A identidade é aplicada",
    text: "Templates mantêm padrão visual por conta.",
  },
  {
    icon: CalendarCheck2,
    shortLabel: "Agenda",
    title: "A fila encontra o horário",
    text: "Limites e intervalos orientam cada publicação.",
  },
  {
    icon: Send,
    shortLabel: "Publicação",
    title: "O conteúdo é enviado",
    text: "A API oficial da Meta conclui o fluxo.",
  },
];

export const timelineSteps: IconContent[] = [
  {
    icon: Rss,
    title: "Conecte suas fontes",
    text: "Cadastre sites, feeds RSS, temas e contas do Instagram que fazem parte da sua operação.",
  },
  {
    icon: Sparkles,
    title: "Defina como sua marca fala",
    text: "Configure perfil de criador, identidade, templates, filtros e formatos disponíveis.",
  },
  {
    icon: CheckCircle2,
    title: "Escolha o nível de controle",
    text: "Revise cada conteúdo manualmente ou aprove fluxos automáticos dentro das regras definidas.",
  },
  {
    icon: BarChart3,
    title: "Acompanhe tudo no painel",
    text: "Veja o que está preparando, agendado, publicado ou precisa de atenção.",
  },
];

export const featureCards: IconContent[] = [
  {
    icon: Newspaper,
    title: "Pautas e notícias",
    text: "Capture assuntos relevantes e transforme fontes recorrentes em uma fila editorial organizada.",
  },
  {
    icon: Bot,
    title: "Texto com IA",
    text: "Crie títulos, resumos, legendas e carrosséis alinhados ao perfil de cada conta.",
  },
  {
    icon: ImageIcon,
    title: "Feed, Stories e Reels",
    text: "Produza diferentes formatos com templates e identidade visual consistente.",
  },
  {
    icon: LayoutDashboard,
    title: "Painel unificado",
    text: "Aprove, edite, visualize, agende e acompanhe a operação sem trocar de ferramenta.",
  },
  {
    icon: CalendarCheck2,
    title: "Fila inteligente",
    text: "Organize horários, limite diário, intervalo mínimo e próximas tentativas por conta.",
  },
  {
    icon: ShieldCheck,
    title: "Regras de segurança",
    text: "Mantenha ritmo e revisão compatíveis com sua operação e com as políticas do Instagram.",
  },
];

export const aiPrinciples: IconContent[] = [
  {
    icon: Sparkles,
    title: "IA para acelerar",
    text: "A IA parte da sua pauta e do seu perfil editorial para reduzir o trabalho de primeira versão.",
  },
  {
    icon: FileCheck2,
    title: "Você mantém a palavra final",
    text: "Edite textos, troque imagens, revise a arte ou aprove o conteúdo antes de seguir.",
  },
  {
    icon: ShieldCheck,
    title: "Regras antes da automação",
    text: "Conta, formato, frequência, horários e filtros orientam o que pode avançar.",
  },
];

export const comparisonRows: ComparisonRow[] = [
  {
    category: "Descoberta",
    manual: "Abrir sites, copiar links e montar uma lista de pautas.",
    flux: "Fontes e temas chegam organizados no mesmo painel.",
  },
  {
    category: "Criação",
    manual: "Alternar entre texto, design, arquivos e ferramentas de IA.",
    flux: "Texto, mídia e formato fazem parte do mesmo fluxo.",
  },
  {
    category: "Aprovação",
    manual: "Revisões dispersas em mensagens, pastas e planilhas.",
    flux: "Prévia, edição e aprovação ficam associadas ao conteúdo.",
  },
  {
    category: "Agendamento",
    manual: "Controlar horários e contas em calendários separados.",
    flux: "Fila, limites e intervalos são configurados por conta.",
  },
  {
    category: "Acompanhamento",
    manual: "Descobrir tarde demais o que falhou ou ficou pendente.",
    flux: "Status e próximos passos aparecem em tempo real no painel.",
  },
];

export const benefitCards: IconContent[] = [
  {
    icon: Zap,
    title: "Mais velocidade",
    text: "Menos etapas manuais entre uma boa pauta e um conteúdo pronto para seguir.",
  },
  {
    icon: Palette,
    title: "Mais consistência",
    text: "Templates e perfis editoriais ajudam cada conta a manter voz e identidade.",
  },
  {
    icon: CheckCircle2,
    title: "Mais controle",
    text: "Aprovação, agenda, status e falhas visíveis para você decidir com contexto.",
  },
  {
    icon: BarChart3,
    title: "Mais capacidade",
    text: "Uma estrutura preparada para crescer de uma conta para uma operação maior.",
  },
];

export const resultStats = [
  { value: "10,6 mi", label: "visualizações em 30 dias", detail: "Painel profissional da Meta" },
  { value: "86 mil", label: "interações registradas", detail: "No mesmo ciclo documentado" },
  { value: "8.208", label: "seguidores confirmados", detail: "Perfil verificado no Instagram" },
  { value: "33,78×", label: "evolução da base", detail: "De 243 para 8.208 seguidores" },
];

export const faqItems: FAQItem[] = [
  {
    q: "Como funciona o teste de 7 dias?",
    a: "Você escolhe um plano, cadastra o cartão com segurança pela Stripe e testa a plataforma por 7 dias. A cobrança começa somente após o período de teste, e você pode cancelar antes disso.",
  },
  {
    q: "Vocês usam a API oficial do Instagram?",
    a: "Sim. A publicação usa a integração oficial da Meta para o Instagram, dentro das permissões concedidas pela conta.",
  },
  {
    q: "O Instagram pode bloquear a conta?",
    a: "Qualquer operação pode sofrer limites se houver excesso de ações. Por isso o Flux & Feed permite configurar intervalo mínimo, limite diário, horários e fila por conta. Você também pode revisar manualmente antes de publicar.",
  },
  {
    q: "Preciso deixar meu computador ligado?",
    a: "Não. A geração de mídia e a fila rodam na infraestrutura do sistema, então o painel pode ficar fechado.",
  },
  {
    q: "Funciona com Reels, Feed, Stories e carrosséis?",
    a: "Sim. Os formatos disponíveis incluem artes para Feed, Stories, Reels e carrosséis, respeitando os recursos e limites do plano.",
  },
  {
    q: "Posso conectar mais de uma conta?",
    a: "Sim. A quantidade de contas depende do plano contratado. Cada conta mantém agenda, identidade e regras independentes.",
  },
  {
    q: "A IA pode publicar sem revisão?",
    a: "Você escolhe. É possível trabalhar com aprovação manual ou usar um fluxo automático seguindo filtros, horários e regras configurados.",
  },
  {
    q: "Posso cancelar quando quiser?",
    a: "Sim. A cobrança é mensal e sem fidelidade. O cancelamento pode ser feito pelo painel, mantendo o acesso até o fim do período pago.",
  },
  {
    q: "Quais fontes de notícias posso usar?",
    a: "Você pode cadastrar feeds RSS públicos, sites, URLs, temas e pautas próprias dentro do limite do seu plano.",
  },
  {
    q: "Como é feita a cobrança?",
    a: "A cobrança mensal por cartão é processada com segurança pela Stripe. As condições exibidas no checkout são as condições vigentes do plano.",
  },
  {
    q: "Tem suporte humano?",
    a: "Sim. Os canais e o nível de prioridade variam conforme o plano. Você também pode falar com a equipe pelo WhatsApp.",
  },
];
