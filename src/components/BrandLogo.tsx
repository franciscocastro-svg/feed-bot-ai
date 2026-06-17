import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  priority?: boolean;
};

export function BrandLogo({ className, priority = false }: BrandLogoProps) {
  return (
    <img
      src="/flux-feed-logo.svg"
      alt="Flux & Feed"
      width={358}
      height={48}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      className={cn("block h-auto w-auto object-contain", className)}
    />
  );
}
