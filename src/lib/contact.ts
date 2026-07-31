export const SUPPORT_WHATSAPP_NUMBER = "5561999052691";
export const SUPPORT_WHATSAPP_DISPLAY = "(61) 99905-2691";
export const AGENCY_CONTACT_EMAIL = "contato@fluxifeed.com";

export function buildSupportWhatsAppUrl(message?: string): string {
  const baseUrl = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}`;
  return message ? `${baseUrl}?text=${encodeURIComponent(message)}` : baseUrl;
}

export function buildAgencyContactEmailUrl(
  subject = "Plano Agência — Flux & Feed",
  body = "Olá! Quero conhecer o plano Agência do Flux & Feed e negociar uma configuração para minha operação.",
): string {
  return `mailto:${AGENCY_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
