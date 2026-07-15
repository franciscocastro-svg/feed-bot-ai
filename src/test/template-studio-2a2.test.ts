import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PROFESSIONAL_TEMPLATE_NICHES,
  PROFESSIONAL_TEMPLATE_PRESETS,
  buildProfessionalTemplateConfig,
  filterProfessionalTemplates,
} from "@/lib/professionalTemplateCatalog";

const templatesPage = readFileSync(join(process.cwd(), "src/pages/dashboard/Templates.tsx"), "utf8");
const formats = ["feed", "stories", "reels"] as const;

describe("Template Studio 2A.2 professional library", () => {
  it("ships 32 stable models across eight niches and 96 format variants", () => {
    expect(PROFESSIONAL_TEMPLATE_NICHES).toHaveLength(8);
    expect(PROFESSIONAL_TEMPLATE_PRESETS).toHaveLength(32);
    expect(new Set(PROFESSIONAL_TEMPLATE_PRESETS.map(item => item.key)).size).toBe(32);
    expect(PROFESSIONAL_TEMPLATE_PRESETS.length * formats.length).toBe(96);
    for (const niche of PROFESSIONAL_TEMPLATE_NICHES) {
      expect(PROFESSIONAL_TEMPLATE_PRESETS.filter(item => item.niche === niche.key)).toHaveLength(4);
    }
  });

  it("uses an explicit, valid composition for every model and format", () => {
    for (const preset of PROFESSIONAL_TEMPLATE_PRESETS) {
      for (const format of formats) {
        const config = buildProfessionalTemplateConfig(preset, format);
        const height = format === "feed" ? 1080 : 1920;
        expect(preset.layoutByFormat[format]).toBeGreaterThanOrEqual(0);
        expect(preset.layoutByFormat[format]).toBeLessThan(5);
        expect(config.titleX).toBeGreaterThanOrEqual(0);
        expect(config.titleX + config.titleW).toBeLessThanOrEqual(1080);
        expect(config.titleY).toBeGreaterThan(0);
        expect(config.titleY).toBeLessThan(height);
        expect(config.photoX + config.photoW).toBeLessThanOrEqual(1080);
        expect(config.photoY + config.photoH).toBeLessThanOrEqual(height);
        expect(config.titleMaxLines).toBeGreaterThanOrEqual(1);
        expect(config.titleMaxChars).toBeGreaterThanOrEqual(12);
        expect(config.professionalCatalogVersion).toBe(1);
      }
    }
  });

  it("finds models by Portuguese name, tag and style", () => {
    expect(filterProfessionalTemplates({ query: "inteligência artificial" }).map(item => item.key)).toContain("tec_ai");
    expect(filterProfessionalTemplates({ query: "jurisprudência" }).map(item => item.key)).toContain("law_premium");
    expect(filterProfessionalTemplates({ niche: "futebol", style: "premium" })).toHaveLength(1);
    expect(filterProfessionalTemplates({ niche: "medicos", style: "all" })).toHaveLength(4);
  });

  it("previews before copying and never changes the active template automatically", () => {
    expect(templatesPage).toContain("setCatalogPreview({ preset: p, format: fmt.key })");
    expect(templatesPage).toContain("O modelo ativo não será alterado");
    const addPresetBody = templatesPage.slice(
      templatesPage.indexOf("async function addPreset"),
      templatesPage.indexOf("const uploadFormatRef"),
    );
    expect(addPresetBody).not.toContain("setDefault(");
    expect(addPresetBody).not.toContain("publish_account_template_draft");
    expect(addPresetBody).toContain("setEditing(data as Template)");
  });

  it("keeps discovery responsive and accessible on mobile", () => {
    expect(templatesPage).toContain("overflow-x-auto");
    expect(templatesPage).toContain("grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4");
    expect(templatesPage).toContain("max-h-[95vh]");
    expect(templatesPage).toContain("aria-label=\"Buscar modelos profissionais\"");
    expect(templatesPage).toContain("focus-visible:ring-2");
  });
});
