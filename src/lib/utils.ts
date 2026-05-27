import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Sempre exibe data/hora no fuso de Brasília (America/Sao_Paulo), independente do fuso do navegador.
export const BR_TZ = "America/Sao_Paulo";

export function formatBR(input: string | number | Date | null | undefined, opts: Intl.DateTimeFormatOptions = {}): string {
  if (input == null) return "—";
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    timeZone: BR_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...opts,
  });
}

