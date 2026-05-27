// Utilitários de timezone compartilhados entre funções Edge.
// BRT = UTC-3 (Brasil, sem horário de verão desde 2019).
// Centralizado aqui para evitar duplicação entre autopilot e publish-scheduler.

export const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Converte uma data UTC para "vista em BRT" (getUTCHours retorna hora BRT) */
export const toBRT = (d: Date) => new Date(d.getTime() - BRT_OFFSET_MS);

/** Converte uma data "vista em BRT" de volta para UTC real */
export const fromBRT = (d: Date) => new Date(d.getTime() + BRT_OFFSET_MS);

/** Verifica se uma hora UTC está dentro das horas permitidas (em BRT) */
export function isAllowedHourBRT(date: Date, allowedHours: number[]): boolean {
  if (!allowedHours.length) return true;
  return allowedHours.includes(toBRT(date).getUTCHours());
}
