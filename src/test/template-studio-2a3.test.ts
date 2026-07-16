import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyBrandKitToTemplateConfig,
  brandFontStack,
  contrastRatio,
  normalizeBrandKit,
  readableTextColor,
} from "../../supabase/functions/_shared/brand-kit.js";
import { recommendProfessionalTemplates } from "@/lib/templateRecommendations";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const page = read("src/pages/dashboard/Templates.tsx");
const migration = read("supabase/migrations/20260716013000_template_studio_2a3_brand_kits.sql");
const worker = read("worker/index.js");
const browserPost = read("src/lib/composePostCanvas.ts");
const browserStory = read("src/lib/composeStoryCanvas.ts");

describe("Template Studio 2A.3 brand kit", () => {
  it("normalizes colors, fonts and account identity safely", () => {
    const kit = normalizeBrandKit({
      brandName: "  Minha Marca  ",
      brandHandle: "@minhamarca",
      primaryColor: "#123abc",
      headingFont: "Poppins",
      bodyFont: "Lora",
      visualStyle: "premium",
    });
    expect(kit.brandName).toBe("Minha Marca");
    expect(kit.brandHandle).toBe("minhamarca");
    expect(kit.primaryColor).toBe("#123ABC");
    expect(kit.headingFont).toBe("Poppins");
    expect(kit.bodyFont).toBe("Lora");
    expect(kit.visualStyle).toBe("premium");
  });

  it("applies a readable, versioned snapshot without mutating the source", () => {
    const source = { titleX: 60, handleX: 60, handleY: 90, handleSize: 22 };
    const config = applyBrandKitToTemplateConfig(source, {
      primaryColor: "#FFFFFF",
      secondaryColor: "#EEEEEE",
      accentColor: "#FACC15",
      backgroundColor: "#000000",
      textColor: "#FFFFFF",
      headingFont: "Montserrat",
      bodyFont: "Poppins",
      logoDarkUrl: "https://example.com/logo-dark.png",
      version: 4,
    });
    expect(source).toEqual({ titleX: 60, handleX: 60, handleY: 90, handleSize: 22 });
    expect(config.titleColor).toBe("#000000");
    expect(config.titleFontFamily).toBe("Montserrat");
    expect(config.subtitleFontFamily).toBe("Poppins");
    expect(config.brandLogoUrl).toBe("https://example.com/logo-dark.png");
    expect(config.brandKitVersion).toBe(4);
    expect(contrastRatio("#FFFFFF", readableTextColor("#FFFFFF", "#FFFFFF"))).toBeGreaterThanOrEqual(4.5);
    expect(brandFontStack("Montserrat", true)).toContain("MontserratBold");
  });

  it("recommends deterministically by account niche, goal and visual style", () => {
    const input = {
      format: "feed" as const,
      niche: "futebol",
      goal: "urgencia" as const,
      kit: { visualStyle: "impacto", primaryColor: "#052E16", textColor: "#FFFFFF" },
    };
    const first = recommendProfessionalTemplates(input);
    const second = recommendProfessionalTemplates(input);
    expect(first).toHaveLength(3);
    expect(first.map(item => item.preset.key)).toEqual(second.map(item => item.preset.key));
    expect(first[0].preset.niche).toBe("futebol");
    expect(first[0].reasons.join(" ")).toContain("nicho desta conta");
    expect(first[0].config.brandKitVersion).toBe(1);
  });

  it("keeps kits isolated and browser mutations behind owner-checked RPCs", () => {
    expect(migration).toContain("UNIQUE (instagram_account_id)");
    expect(migration).toContain("WHERE id = _account_id AND user_id = owner_id");
    expect(migration).toContain("auth.uid() = user_id");
    expect(migration).toContain("REVOKE ALL ON public.account_brand_kits FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = public, pg_catalog");
    expect(page).toContain("Never\n      // inherit another account's global identity implicitly");
    expect(page).toContain("O modelo ativo não será alterado");
  });

  it("uses the same font and logo snapshot in previews, browser canvas and VPS worker", () => {
    for (const source of [page, browserPost, browserStory, worker]) {
      expect(source).toContain("brandLogoUrl");
      expect(source).toContain("titleFontFamily");
      expect(source).toContain("subtitleFontFamily");
    }
    expect(worker).toContain("Fontes do Kit de Marca carregadas no worker");
    expect(worker).toContain("claim_editorial_render_jobs");
  });
});
