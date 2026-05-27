import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export function ImageBubble({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.storage.from("support-images").createSignedUrl(path, 3600).then(({ data }) => {
      if (alive) setUrl(data?.signedUrl ?? null);
    });
    return () => { alive = false; };
  }, [path]);

  if (!url) return <div className="flex items-center gap-2 text-xs opacity-70"><Loader2 className="h-3 w-3 animate-spin" /> carregando imagem…</div>;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block mt-1">
        <img src={url} alt="anexo" className="max-h-64 rounded-lg border border-border object-cover hover:opacity-90 transition" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl p-2 bg-background">
          <img src={url} alt="anexo" className="w-full h-auto rounded" />
        </DialogContent>
      </Dialog>
    </>
  );
}
