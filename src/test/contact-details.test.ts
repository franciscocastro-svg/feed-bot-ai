import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildSupportWhatsAppUrl,
  SUPPORT_WHATSAPP_DISPLAY,
  SUPPORT_WHATSAPP_NUMBER,
} from "@/lib/contact";

function textFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return textFiles(path);
    return /\.(?:html|txt|ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("contato oficial por WhatsApp", () => {
  it("usa o número solicitado nos links e na apresentação", () => {
    expect(SUPPORT_WHATSAPP_NUMBER).toBe("5561999052691");
    expect(SUPPORT_WHATSAPP_DISPLAY).toBe("(61) 99905-2691");
    expect(buildSupportWhatsAppUrl()).toBe("https://wa.me/5561999052691");
    expect(buildSupportWhatsAppUrl("Olá!")).toBe("https://wa.me/5561999052691?text=Ol%C3%A1!");
  });

  it("não mantém outro número em links wa.me do frontend público", () => {
    const files = [...textFiles(join(process.cwd(), "src")), ...textFiles(join(process.cwd(), "public"))];
    const linkedNumbers = files.flatMap((file) =>
      Array.from(readFileSync(file, "utf8").matchAll(/https:\/\/wa\.me\/(\d+)/g), (match) => match[1]),
    );

    expect(linkedNumbers.length).toBeGreaterThan(0);
    expect(new Set(linkedNumbers)).toEqual(new Set([SUPPORT_WHATSAPP_NUMBER]));
  });
});
