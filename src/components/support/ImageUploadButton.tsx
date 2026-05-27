import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Image as ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Props = {
  onPick: (file: File) => Promise<void>;
  disabled?: boolean;
};

export function ImageUploadButton({ onPick, disabled }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handle = async (f: File | null | undefined) => {
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error("Selecione uma imagem"); return; }
    if (f.size > 8 * 1024 * 1024) { toast.error("Imagem muito grande (máx. 8MB)"); return; }
    setBusy(true);
    try { await onPick(f); } finally { setBusy(false); if (ref.current) ref.current.value = ""; }
  };

  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handle(e.target.files?.[0])}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        title="Anexar imagem / print"
        disabled={disabled || busy}
        onClick={() => ref.current?.click()}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
      </Button>
    </>
  );
}
