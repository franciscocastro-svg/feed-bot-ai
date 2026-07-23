import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Info } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

type ContextHelpProps = {
  label: string;
  title?: string;
  children: ReactNode;
  className?: string;
};

export function ContextHelp({ label, title, children, className }: ContextHelpProps) {
  const { language } = useLanguage();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={language === "en-US" ? `Help: ${label}` : `Ajuda: ${label}`}
          className={cn(
            "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:border-primary/60 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            className,
          )}
        >
          <Info aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        aria-label={language === "en-US" ? `Information about ${label}` : `Informações sobre ${label}`}
        className="w-[min(20rem,calc(100vw-2rem))] space-y-1.5 p-3"
      >
        {title ? <p className="text-sm font-semibold leading-snug">{title}</p> : null}
        <div className="text-xs leading-relaxed text-muted-foreground">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

type FieldLabelProps = ComponentPropsWithoutRef<typeof Label> & {
  help: ReactNode;
  helpLabel: string;
};

export function FieldLabel({ children, help, helpLabel, className, ...props }: FieldLabelProps) {
  return (
    <div className="mb-1.5 flex items-center gap-1.5">
      <Label className={className} {...props}>{children}</Label>
      <ContextHelp label={helpLabel}>{help}</ContextHelp>
    </div>
  );
}
