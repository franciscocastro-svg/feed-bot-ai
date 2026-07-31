import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveAccountRenderSettings } from "../../worker/accountIdentity.js";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("template identity per Instagram account", () => {
  it("uses the destination username instead of leaking the global identity", () => {
    const settings = resolveAccountRenderSettings({
      effectiveSettings: {
        brand_handle: "fuxico_fala",
        brand_name: "Fuxico Fala",
        brand_logo_url: "https://example.com/fuxico.png",
        default_reel_template_id: "shared-template",
      },
      accountSettings: null,
      accountUsername: "franc1sco_de_castro",
      accountScoped: true,
    });

    expect(settings).toMatchObject({
      brand_handle: "franc1sco_de_castro",
      brand_name: "franc1sco_de_castro",
      brand_logo_url: null,
      default_reel_template_id: "shared-template",
    });
  });

  it("keeps an explicit identity configured for the destination account", () => {
    const settings = resolveAccountRenderSettings({
      effectiveSettings: {
        brand_handle: "global_account",
        default_feed_template_id: "shared-template",
      },
      accountSettings: {
        brand_handle: "@minha_marca",
        brand_name: "Minha Marca",
        brand_logo_url: "https://example.com/minha-marca.png",
      },
      accountUsername: "conta_destino",
      accountScoped: true,
    });

    expect(settings).toMatchObject({
      brand_handle: "minha_marca",
      brand_name: "Minha Marca",
      brand_logo_url: "https://example.com/minha-marca.png",
      default_feed_template_id: "shared-template",
    });
  });

  it("resolves different accounts independently with the same global template", () => {
    const base = {
      brand_handle: "fuxico_fala",
      default_reel_template_id: "shared-template",
    };

    const first = resolveAccountRenderSettings({
      effectiveSettings: base,
      accountUsername: "franc1sco_de_castro",
      accountScoped: true,
    });
    const second = resolveAccountRenderSettings({
      effectiveSettings: base,
      accountUsername: "showdeesportes",
      accountScoped: true,
    });

    expect(first.brand_handle).toBe("franc1sco_de_castro");
    expect(second.brand_handle).toBe("showdeesportes");
    expect(base.brand_handle).toBe("fuxico_fala");
  });

  it("preserves the global identity only for legacy renders without a destination account", () => {
    expect(resolveAccountRenderSettings({
      effectiveSettings: {
        brand_handle: "fuxico_fala",
        brand_logo_url: "https://example.com/fuxico.png",
      },
      accountScoped: false,
    })).toMatchObject({
      brand_handle: "fuxico_fala",
      brand_logo_url: "https://example.com/fuxico.png",
    });
  });

  it("wires queued Reel rerenders through the account-aware settings loader", () => {
    const worker = read("worker/index.js");
    const start = worker.indexOf("async function generateReelVideoFromJob(job)");
    const end = worker.indexOf("function shellQuote", start);
    const queuedReelPath = worker.slice(start, end);

    expect(queuedReelPath).toContain('.from("scheduled_posts")');
    expect(queuedReelPath).toContain("scheduledPost?.instagram_account_id || instagramAccountId");
    expect(queuedReelPath).toContain("loadEffectivePostSettings({");
    expect(queuedReelPath).not.toContain('.from("user_settings")');
  });
});
