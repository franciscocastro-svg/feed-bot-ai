import {
  getDefaultTemplateConfig,
  getTemplateLayoutOptions,
  normalizeTemplateConfig,
} from "../../supabase/functions/_shared/template-layouts.js";
import { resolveTemplateGradient } from "../../supabase/functions/_shared/template-gradients.js";
import type { TemplateFormat } from "@/lib/templateDefaults";

export type ProfessionalTemplateStyle = "editorial" | "impacto" | "minimalista" | "premium" | "tipografico";

export type ProfessionalTemplateConfig = Record<string, unknown> & {
  titleX: number;
  titleY: number;
  titleW: number;
  titleSize: number;
  titleColor: string;
  titleAlign: "left" | "center" | "right";
  titleMaxChars: number;
  titleMaxLines: number;
  photoX: number;
  photoY: number;
  photoW: number;
  photoH: number;
  badgeX: number;
  badgeY: number;
  badgeW: number;
  badgeBg: string;
  badgeColor: string;
  badgeText: string;
  professionalCatalogVersion: number;
  professionalStyle: ProfessionalTemplateStyle;
};

export type ProfessionalTemplatePreset = {
  key: string;
  name: string;
  description: string;
  niche: string;
  style: ProfessionalTemplateStyle;
  tags: string[];
  popular?: boolean;
  config: Record<string, unknown>;
  layoutByFormat: Record<TemplateFormat, number>;
};

export type ProfessionalTemplateNiche = {
  key: string;
  label: string;
  accent: string;
};

export const PROFESSIONAL_TEMPLATE_NICHES: ProfessionalTemplateNiche[] = [
  { key: "noticias", label: "Notícias", accent: "#DC2626" },
  { key: "economia", label: "Economia", accent: "#047857" },
  { key: "futebol", label: "Futebol e esportes", accent: "#16A34A" },
  { key: "fofoca", label: "Fofoca e celebridades", accent: "#EC4899" },
  { key: "advogados", label: "Direito e advocacia", accent: "#1E3A8A" },
  { key: "medicos", label: "Saúde e medicina", accent: "#0891B2" },
  { key: "tecnologia", label: "Tecnologia", accent: "#8B5CF6" },
  { key: "religiao", label: "Religião e fé", accent: "#7C2D12" },
];

const layouts = (feed: number, stories: number, reels: number): Record<TemplateFormat, number> => ({ feed, stories, reels });
const preset = (
  niche: string,
  key: string,
  name: string,
  description: string,
  style: ProfessionalTemplateStyle,
  layoutByFormat: Record<TemplateFormat, number>,
  config: Record<string, unknown>,
  tags: string[],
  popular = false,
): ProfessionalTemplatePreset => ({ niche, key, name, description, style, layoutByFormat, config, tags, popular });

export const PROFESSIONAL_TEMPLATE_PRESETS: ProfessionalTemplatePreset[] = [
  preset("noticias", "news_minimal", "Minimal Editorial", "Header branco, foto embaixo e leitura muito limpa.", "editorial", layouts(0, 2, 0), { titleColor: "#0A0A0A", subtitleColor: "#52525B", badgeBg: "#FFD400", badgeColor: "#000000", badgeText: "LEIA A LEGENDA →", overlayOpacity: 0 }, ["jornal", "limpo", "portal"], true),
  preset("noticias", "news_breaking", "Breaking News", "Manchete urgente com alto contraste e fundo escuro.", "impacto", layouts(1, 1, 1), { titleColor: "#FFFFFF", subtitleColor: "#FCA5A5", badgeBg: "#DC2626", badgeColor: "#FFFFFF", badgeText: "URGENTE", overlayOpacity: 0.55 }, ["urgente", "plantão", "notícia"], true),
  preset("noticias", "news_classic", "Jornal Clássico", "Visual sóbrio inspirado em jornais e revistas.", "premium", layouts(3, 2, 2), { titleColor: "#1F2937", subtitleColor: "#6B7280", badgeBg: "#1F2937", badgeColor: "#F5F1E8", badgeText: "EDIÇÃO DE HOJE", overlayOpacity: 0.3 }, ["clássico", "autoridade", "revista"]),
  preset("noticias", "news_yellow", "Bold Stripe", "Faixa amarela e tipografia forte para destaques.", "tipografico", layouts(4, 4, 4), { titleColor: "#000000", subtitleColor: "#27272A", badgeBg: "#000000", badgeColor: "#FFD400", badgeText: "DESTAQUE", overlayOpacity: 0 }, ["amarelo", "forte", "destaque"]),

  preset("economia", "econ_bull", "Mercado em Alta", "Verde financeiro para resultados positivos.", "impacto", layouts(1, 3, 3), { titleColor: "#FFFFFF", subtitleColor: "#A7F3D0", badgeBg: "#10B981", badgeColor: "#022C22", badgeText: "↑ ALTA", overlayOpacity: 0.4 }, ["bolsa", "investimentos", "alta"], true),
  preset("economia", "econ_bear", "Mercado em Baixa", "Vermelho e preto para quedas e alertas.", "impacto", layouts(1, 1, 1), { titleColor: "#FFFFFF", subtitleColor: "#FCA5A5", badgeBg: "#DC2626", badgeColor: "#FFFFFF", badgeText: "↓ QUEDA", overlayOpacity: 0.5 }, ["bolsa", "queda", "alerta"]),
  preset("economia", "econ_corp", "Corporativo Premium", "Azul-marinho e dourado para análises de autoridade.", "premium", layouts(3, 2, 2), { titleColor: "#FFFFFF", subtitleColor: "#BFDBFE", badgeBg: "#FBBF24", badgeColor: "#0F172A", badgeText: "MERCADO", overlayOpacity: 0.35 }, ["empresa", "negócios", "premium"]),
  preset("economia", "econ_fintech", "Fintech Minimal", "Branco e verde menta para conteúdo financeiro moderno.", "minimalista", layouts(0, 2, 0), { titleColor: "#0F172A", subtitleColor: "#475569", badgeBg: "#0F172A", badgeColor: "#10B981", badgeText: "ECONOMIA", overlayOpacity: 0 }, ["fintech", "moderno", "limpo"]),

  preset("futebol", "soc_stadium", "Estádio Noturno", "Clima de jogo com preto e verde gramado.", "impacto", layouts(1, 3, 3), { titleColor: "#FFFFFF", subtitleColor: "#86EFAC", badgeBg: "#16A34A", badgeColor: "#000000", badgeText: "GOL!", overlayOpacity: 0.5 }, ["futebol", "jogo", "estádio"], true),
  preset("futebol", "soc_brasil", "Verde-Amarelo BR", "Cores brasileiras para seleção e competições nacionais.", "editorial", layouts(0, 2, 0), { titleColor: "#0F172A", subtitleColor: "#1F2937", badgeBg: "#15803D", badgeColor: "#FACC15", badgeText: "SELEÇÃO", overlayOpacity: 0.2 }, ["brasil", "seleção", "campeonato"]),
  preset("futebol", "soc_derby", "Clássico", "Vermelho e preto para rivalidades e grandes jogos.", "impacto", layouts(2, 1, 1), { titleColor: "#FFFFFF", subtitleColor: "#FCA5A5", badgeBg: "#FFFFFF", badgeColor: "#DC2626", badgeText: "CLÁSSICO", overlayOpacity: 0.45 }, ["rivalidade", "clássico", "derby"]),
  preset("futebol", "soc_champ", "Champions Premium", "Azul profundo e dourado para decisões e títulos.", "premium", layouts(3, 3, 3), { titleColor: "#FFFFFF", subtitleColor: "#C7D2FE", badgeBg: "#FBBF24", badgeColor: "#1E1B4B", badgeText: "★ FINAL", overlayOpacity: 0.4 }, ["final", "campeão", "premium"]),

  preset("fofoca", "gos_pink", "Rosa Glamour", "Rosa vibrante para celebridades e entretenimento.", "editorial", layouts(0, 2, 0), { titleColor: "#FFFFFF", subtitleColor: "#FCE7F3", badgeBg: "#FBBF24", badgeColor: "#831843", badgeText: "🔥 EXCLUSIVO", overlayOpacity: 0.35 }, ["celebridades", "glamour", "exclusivo"], true),
  preset("fofoca", "gos_tab", "Tabloide Sensação", "Amarelo neon e manchete grande para assuntos quentes.", "impacto", layouts(1, 1, 1), { titleColor: "#FFFFFF", subtitleColor: "#FDE68A", badgeBg: "#DC2626", badgeColor: "#FFFFFF", badgeText: "BOMBA!", overlayOpacity: 0.5 }, ["bomba", "urgente", "tabloide"], true),
  preset("fofoca", "gos_carpet", "Tapete Vermelho", "Vermelho e dourado para premiações e luxo.", "premium", layouts(3, 3, 3), { titleColor: "#FFFFFF", subtitleColor: "#FEF3C7", badgeBg: "#FBBF24", badgeColor: "#7F1D1D", badgeText: "★ CELEB", overlayOpacity: 0.4 }, ["premiação", "luxo", "famosos"]),
  preset("fofoca", "gos_pastel", "Pastel Casual", "Lilás e rosa para entretenimento leve.", "minimalista", layouts(2, 2, 2), { titleColor: "#5B21B6", subtitleColor: "#9333EA", badgeBg: "#5B21B6", badgeColor: "#FBCFE8", badgeText: "DEU O QUE FALAR", overlayOpacity: 0 }, ["leve", "rosa", "tendência"]),

  preset("advogados", "law_classic", "Sóbrio Institucional", "Azul-marinho e dourado para comunicação jurídica.", "premium", layouts(3, 2, 2), { titleColor: "#FFFFFF", subtitleColor: "#BFDBFE", badgeBg: "#FBBF24", badgeColor: "#0F172A", badgeText: "DIREITO", overlayOpacity: 0.4 }, ["direito", "institucional", "escritório"], true),
  preset("advogados", "law_serif", "Serifa Editorial", "Bege e preto com aparência de publicação jurídica.", "editorial", layouts(0, 2, 0), { titleColor: "#1F2937", subtitleColor: "#4B5563", badgeBg: "#1F2937", badgeColor: "#F5F1E8", badgeText: "§ ENTENDA", overlayOpacity: 0.3 }, ["lei", "editorial", "autoridade"]),
  preset("advogados", "law_premium", "Vinho e Marfim", "Composição sofisticada para conteúdo premium.", "premium", layouts(4, 4, 4), { titleColor: "#FEF3C7", subtitleColor: "#FCA5A5", badgeBg: "#FEF3C7", badgeColor: "#7F1D1D", badgeText: "JURISPRUDÊNCIA", overlayOpacity: 0.4 }, ["jurisprudência", "premium", "vinho"]),
  preset("advogados", "law_modern", "Moderno Minimal", "Grafite e branco para conteúdo jurídico direto.", "minimalista", layouts(2, 1, 1), { titleColor: "#FFFFFF", subtitleColor: "#D1D5DB", badgeBg: "#1E3A8A", badgeColor: "#FFFFFF", badgeText: "ART. LEI", overlayOpacity: 0.3 }, ["moderno", "artigo", "minimalista"]),

  preset("medicos", "med_clean", "Clínico Limpo", "Branco e azul para confiança e clareza.", "minimalista", layouts(0, 2, 0), { titleColor: "#0F172A", subtitleColor: "#475569", badgeBg: "#0891B2", badgeColor: "#FFFFFF", badgeText: "+ SAÚDE", overlayOpacity: 0 }, ["clínica", "saúde", "limpo"], true),
  preset("medicos", "med_alert", "Alerta Saúde", "Laranja e branco para avisos importantes.", "impacto", layouts(1, 1, 1), { titleColor: "#9A3412", subtitleColor: "#C2410C", badgeBg: "#DC2626", badgeColor: "#FFFFFF", badgeText: "ALERTA", overlayOpacity: 0 }, ["alerta", "prevenção", "atenção"]),
  preset("medicos", "med_research", "Pesquisa Científica", "Azul escuro para estudos e evidências.", "editorial", layouts(3, 3, 3), { titleColor: "#FFFFFF", subtitleColor: "#BAE6FD", badgeBg: "#FFFFFF", badgeColor: "#082F49", badgeText: "ESTUDO", overlayOpacity: 0.4 }, ["pesquisa", "estudo", "ciência"]),
  preset("medicos", "med_wellness", "Bem-estar Verde", "Verde sálvia e creme para saúde e qualidade de vida.", "minimalista", layouts(2, 2, 2), { titleColor: "#14532D", subtitleColor: "#166534", badgeBg: "#14532D", badgeColor: "#F0FDF4", badgeText: "BEM-ESTAR", overlayOpacity: 0.2 }, ["bem-estar", "vida saudável", "verde"]),

  preset("tecnologia", "tec_dark", "Dark Mode", "Preto e roxo neon para tecnologia e inovação.", "impacto", layouts(1, 3, 3), { titleColor: "#FFFFFF", subtitleColor: "#C4B5FD", badgeBg: "#A78BFA", badgeColor: "#0A0A0A", badgeText: "TECH", overlayOpacity: 0.4 }, ["tecnologia", "dark", "neon"], true),
  preset("tecnologia", "tec_ai", "AI Gradient", "Gradiente roxo e azul para inteligência artificial.", "premium", layouts(3, 3, 3), { titleColor: "#FFFFFF", subtitleColor: "#E0E7FF", badgeBg: "#FFFFFF", badgeColor: "#6366F1", badgeText: "★ IA", overlayOpacity: 0.3 }, ["ia", "inteligência artificial", "gradiente"], true),
  preset("tecnologia", "tec_startup", "Startup Branco", "Base clara e ciano para produtos e lançamentos.", "minimalista", layouts(0, 2, 0), { titleColor: "#0F172A", subtitleColor: "#475569", badgeBg: "#06B6D4", badgeColor: "#FFFFFF", badgeText: "LANÇAMENTO", overlayOpacity: 0 }, ["startup", "produto", "lançamento"]),
  preset("tecnologia", "tec_cyber", "Cyberpunk", "Magenta e ciano para conteúdo futurista.", "tipografico", layouts(4, 4, 4), { titleColor: "#FFFFFF", subtitleColor: "#FBCFE8", badgeBg: "#FACC15", badgeColor: "#831843", badgeText: "FUTURO", overlayOpacity: 0.45 }, ["cyber", "futuro", "neon"]),

  preset("religiao", "rel_golden", "Dourado Sagrado", "Marrom e dourado para conteúdo solene.", "premium", layouts(3, 3, 3), { titleColor: "#FFFFFF", subtitleColor: "#FEF3C7", badgeBg: "#FBBF24", badgeColor: "#451A03", badgeText: "✝ PALAVRA", overlayOpacity: 0.45 }, ["fé", "palavra", "dourado"], true),
  preset("religiao", "rel_peace", "Azul Celeste", "Azul e branco para mensagens de paz.", "minimalista", layouts(0, 2, 0), { titleColor: "#FFFFFF", subtitleColor: "#BFDBFE", badgeBg: "#FFFFFF", badgeColor: "#1E40AF", badgeText: "FÉ", overlayOpacity: 0.3 }, ["paz", "fé", "céu"]),
  preset("religiao", "rel_minimal", "Salmo Minimal", "Creme e composição limpa para versículos.", "editorial", layouts(4, 4, 4), { titleColor: "#1F2937", subtitleColor: "#6B7280", badgeBg: "#7C2D12", badgeColor: "#FAF7F0", badgeText: "VERSÍCULO", overlayOpacity: 0.1 }, ["salmo", "versículo", "minimalista"]),
  preset("religiao", "rel_revival", "Avivamento", "Roxo e amarelo para mensagens de grande impacto.", "impacto", layouts(1, 1, 1), { titleColor: "#FFFFFF", subtitleColor: "#DDD6FE", badgeBg: "#FBBF24", badgeColor: "#4C1D95", badgeText: "🔥 AVIVA", overlayOpacity: 0.35 }, ["avivamento", "impacto", "igreja"]),
];

export const PROFESSIONAL_TEMPLATE_STYLES: { key: "all" | ProfessionalTemplateStyle; label: string }[] = [
  { key: "all", label: "Todos os estilos" },
  { key: "editorial", label: "Editorial" },
  { key: "impacto", label: "Impacto" },
  { key: "minimalista", label: "Minimalista" },
  { key: "premium", label: "Premium" },
  { key: "tipografico", label: "Tipográfico" },
];

export function buildProfessionalTemplateConfig(presetValue: ProfessionalTemplatePreset, format: TemplateFormat): ProfessionalTemplateConfig {
  const layoutOptions = getTemplateLayoutOptions(format);
  const layoutIndex = presetValue.layoutByFormat[format];
  const layout = layoutOptions[layoutIndex]?.values || layoutOptions[0]?.values || {};
  const config = normalizeTemplateConfig({
    ...getDefaultTemplateConfig(format),
    ...layout,
    ...presetValue.config,
  }, format) as Record<string, unknown>;
  return {
    ...config,
    backgroundGradient: resolveTemplateGradient(presetValue.key, presetValue.config),
    professionalCatalogVersion: 1,
    professionalStyle: presetValue.style,
  } as unknown as ProfessionalTemplateConfig;
}

export function filterProfessionalTemplates({
  niche,
  style = "all",
  query = "",
}: {
  niche?: string;
  style?: "all" | ProfessionalTemplateStyle;
  query?: string;
}) {
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  return PROFESSIONAL_TEMPLATE_PRESETS.filter(item => {
    if (niche && item.niche !== niche) return false;
    if (style !== "all" && item.style !== style) return false;
    if (!normalizedQuery) return true;
    return [item.name, item.description, item.niche, item.style, ...item.tags]
      .join(" ")
      .toLocaleLowerCase("pt-BR")
      .includes(normalizedQuery);
  });
}
