export const SUPPORT_WHATSAPP_NUMBER = "5561999052691";
export const SUPPORT_WHATSAPP_DISPLAY = "(61) 99905-2691";

export function buildSupportWhatsAppUrl(message?: string): string {
  const baseUrl = `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}`;
  return message ? `${baseUrl}?text=${encodeURIComponent(message)}` : baseUrl;
}
