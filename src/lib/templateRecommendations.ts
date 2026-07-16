import {
  PROFESSIONAL_TEMPLATE_PRESETS,
  buildProfessionalTemplateConfig,
  type ProfessionalTemplatePreset,
} from "@/lib/professionalTemplateCatalog";
import type { TemplateFormat } from "@/lib/templateDefaults";
import {
  applyBrandKitToTemplateConfig,
  contrastRatio,
  normalizeBrandKit,
  type BrandKit,
} from "../../supabase/functions/_shared/brand-kit.js";

export type TemplateGoal = "noticia" | "urgencia" | "autoridade" | "educativo" | "oferta";

export type TemplateRecommendation = {
  preset: ProfessionalTemplatePreset;
  score: number;
  reasons: string[];
  config: Record<string, unknown>;
};

const GOAL_STYLES: Record<TemplateGoal, string[]> = {
  noticia: ["editorial", "minimalista"],
  urgencia: ["impacto", "tipografico"],
  autoridade: ["premium", "editorial"],
  educativo: ["minimalista", "editorial"],
  oferta: ["impacto", "premium"],
};

const GOAL_TAGS: Record<TemplateGoal, string[]> = {
  noticia: ["notícia", "jornal", "portal", "destaque"],
  urgencia: ["urgente", "alerta", "bomba", "plantão"],
  autoridade: ["autoridade", "premium", "institucional", "estudo"],
  educativo: ["limpo", "estudo", "editorial", "minimalista"],
  oferta: ["produto", "lançamento", "empresa", "destaque"],
};

function normalized(value?: string | null) {
  return String(value || "").trim().toLocaleLowerCase("pt-BR");
}

function scorePreset(
  preset: ProfessionalTemplatePreset,
  format: TemplateFormat,
  kit: BrandKit,
  niche: string,
  goal: TemplateGoal,
): TemplateRecommendation {
  let score = 0;
  const reasons: string[] = [];
  const normalizedNiche = normalized(niche);
  const exactNiche = normalized(preset.niche) === normalizedNiche;

  if (exactNiche) {
    score += 45;
    reasons.push("Combina com o nicho desta conta");
  }
  if (preset.style === kit.visualStyle) {
    score += 28;
    reasons.push(`Segue o estilo ${kit.visualStyle} do Kit de Marca`);
  }
  if (GOAL_STYLES[goal].includes(preset.style)) {
    score += 18;
    reasons.push(`Boa composição para conteúdo de ${goal}`);
  }
  if (preset.tags.some(tag => GOAL_TAGS[goal].includes(normalized(tag)))) score += 10;
  if (preset.popular) {
    score += 5;
    reasons.push("Modelo popular da biblioteca profissional");
  }

  const baseConfig = buildProfessionalTemplateConfig(preset, format);
  const config = applyBrandKitToTemplateConfig(baseConfig, kit);
  const contrast = contrastRatio(
    String(config.backgroundGradient && typeof config.backgroundGradient === "object"
      ? (config.backgroundGradient as { stops?: { color?: string }[] }).stops?.[0]?.color
      : kit.primaryColor) || kit.primaryColor,
    String(config.titleColor || kit.textColor),
  );
  if (contrast >= 4.5) {
    score += 8;
    reasons.push("Mantém contraste forte com a paleta da marca");
  }

  // Every preset has a specific layout per format. Keep the score explicit so
  // future catalog entries without a supported layout naturally rank lower.
  if (Number.isInteger(preset.layoutByFormat[format])) score += 4;

  return { preset, score, reasons: reasons.slice(0, 3), config };
}

export function recommendProfessionalTemplates({
  format,
  kit: rawKit,
  niche,
  goal = "noticia",
  limit = 3,
}: {
  format: TemplateFormat;
  kit: Partial<BrandKit> | Record<string, unknown>;
  niche?: string | null;
  goal?: TemplateGoal;
  limit?: number;
}): TemplateRecommendation[] {
  const kit = normalizeBrandKit(rawKit as Record<string, unknown>);
  return PROFESSIONAL_TEMPLATE_PRESETS
    .map(preset => scorePreset(preset, format, kit, niche || "", goal))
    .sort((first, second) => second.score - first.score || first.preset.key.localeCompare(second.preset.key))
    .slice(0, Math.max(1, Math.min(limit, 6)));
}
