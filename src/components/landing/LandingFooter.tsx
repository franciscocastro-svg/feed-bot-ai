import { Instagram, MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { BrandLogo } from "@/components/BrandLogo";

type LandingFooterProps = {
  whatsappUrl: string;
  instagramUrl: string;
};

export function LandingFooter({ whatsappUrl, instagramUrl }: LandingFooterProps) {
  return (
    <>
      <footer className="border-t border-white/10 py-10">
        <div className="container grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <BrandLogo className="h-8 max-w-[210px]" />
            <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">
              Fontes, IA, criação, aprovação, agenda e publicação para operações de conteúdo no Instagram.
            </p>
          </div>
          <nav aria-label="Links institucionais" className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <Link to="/terms" className="inline-flex min-h-11 items-center px-1 transition-colors hover:text-foreground">Termos</Link>
            <Link to="/privacy" className="inline-flex min-h-11 items-center px-1 transition-colors hover:text-foreground">Privacidade</Link>
            <a href="#faq" className="inline-flex min-h-11 items-center px-1 transition-colors hover:text-foreground">Ajuda</a>
            <a href={whatsappUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center px-1 transition-colors hover:text-foreground">
              Contato
            </a>

            <a
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Abrir Instagram do Flux & Feed"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 transition hover:border-primary/30 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Instagram className="h-5 w-5" aria-hidden="true" />
            </a>
          </nav>
          <div className="border-t border-white/10 pt-5 text-xs text-muted-foreground md:col-span-2 md:flex md:items-center md:justify-between">
            <span>© {new Date().getFullYear()} Flux &amp; Feed. Todos os direitos reservados.</span>
            <span className="mt-2 block md:mt-0">Publicação via API oficial da Meta.</span>
          </div>
        </div>
      </footer>

      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Falar com a equipe do Flux & Feed pelo WhatsApp"
        title="Falar com a equipe pelo WhatsApp"
        className="landing-whatsapp-fab group fixed bottom-4 right-4 z-[70] inline-flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-full border border-emerald-400/30 bg-[#0d1712]/95 p-2 shadow-[0_16px_45px_rgba(0,0,0,0.45),0_0_28px_rgba(37,211,102,0.16)] backdrop-blur-xl transition duration-300 hover:-translate-y-1 hover:border-emerald-300/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:bottom-6 sm:right-6 sm:pr-5"
      >
        <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg shadow-emerald-950/40">
          <MessageCircle className="h-6 w-6" strokeWidth={2.4} aria-hidden="true" />
          <span className="absolute right-0 top-0 h-3 w-3 rounded-full border-2 border-[#0d1712] bg-emerald-200" />
        </span>
        <span className="hidden min-w-0 flex-col text-left sm:flex">
          <span className="whitespace-nowrap text-sm font-semibold text-white">Fale com a equipe</span>
          <span className="whitespace-nowrap text-[11px] text-emerald-200/80">Atendimento pelo WhatsApp</span>
        </span>
      </a>
    </>
  );
}
