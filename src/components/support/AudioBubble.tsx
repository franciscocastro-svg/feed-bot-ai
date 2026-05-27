import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export function AudioBubble({ path, durationSec }: { path: string; durationSec?: number | null }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.storage.from("support-audio").createSignedUrl(path, 3600).then(({ data }) => {
      if (alive) setUrl(data?.signedUrl ?? null);
    });
    return () => { alive = false; };
  }, [path]);

  if (!url) return <div className="flex items-center gap-2 text-xs opacity-70"><Loader2 className="h-3 w-3 animate-spin" /> carregando áudio…</div>;
  return (
    <div className="space-y-1">
      <audio src={url} controls className="h-9 max-w-full" preload="metadata" />
      {durationSec ? <div className="text-[10px] opacity-70">{Math.floor(durationSec/60)}:{String(Math.round(durationSec%60)).padStart(2,"0")}</div> : null}
    </div>
  );
}
