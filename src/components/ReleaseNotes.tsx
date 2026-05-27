import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Sparkles, CheckCheck } from "lucide-react";
import { formatBR } from "@/lib/utils";

type Release = {
  id: string;
  version: string | null;
  title: string;
  content: string;
  highlight: boolean;
  published_at: string | null;
  created_at: string;
};

export function ReleaseNotesBell() {
  const [unseen, setUnseen] = useState<Release[]>([]);
  const [history, setHistory] = useState<Release[]>([]);
  const [popupOpen, setPopupOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [current, setCurrent] = useState(0);

  const loadHistory = async () => {
    const { data } = await supabase
      .from("release_notes")
      .select("*")
      .eq("published", true)
      .order("published_at", { ascending: false, nullsFirst: false })
      .limit(30);
    setHistory((data as any) || []);
  };

  const loadUnseen = async () => {
    const { data } = await supabase.rpc("get_unseen_releases");
    const list = (data as any) || [];
    setUnseen(list);
    if (list.length > 0) {
      setCurrent(0);
      setPopupOpen(true);
    }
  };

  useEffect(() => {
    loadHistory();
    loadUnseen();
  }, []);

  const markSeen = async (ids: string[]) => {
    const { data: u } = await supabase.auth.getUser();
    const uid = u.user?.id;
    if (!uid) return;
    await supabase.from("user_release_views").insert(ids.map((id) => ({ user_id: uid, release_id: id })));
  };

  const dismissAll = async () => {
    await markSeen(unseen.map((r) => r.id));
    setUnseen([]);
    setPopupOpen(false);
  };

  const next = async () => {
    const r = unseen[current];
    if (r) await markSeen([r.id]);
    if (current + 1 < unseen.length) {
      setCurrent(current + 1);
    } else {
      setUnseen([]);
      setPopupOpen(false);
    }
  };

  const release = unseen[current];

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="relative" aria-label="Novidades">
            <Bell className="h-4 w-4" />
            {unseen.length > 0 && (
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="font-medium text-sm">Novidades</span>
            </div>
            {unseen.length > 0 && (
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={dismissAll}>
                <CheckCheck className="h-3 w-3 mr-1" /> Marcar todas
              </Button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {history.length === 0 ? (
              <p className="p-6 text-center text-sm text-muted-foreground">Nenhuma novidade ainda.</p>
            ) : (
              history.map((r) => {
                const isUnseen = unseen.some((u) => u.id === r.id);
                return (
                  <div key={r.id} className={`p-3 border-b border-border/50 last:border-0 ${isUnseen ? "bg-secondary/40" : ""}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm">{r.title}</p>
                      {isUnseen && <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {r.version && <Badge variant="outline" className="text-[10px] h-4 px-1">v{r.version}</Badge>}
                      <span className="text-[10px] text-muted-foreground">
                        {formatBR(r.published_at || r.created_at)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap line-clamp-3">{r.content}</p>
                  </div>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={popupOpen} onOpenChange={(o) => { if (!o) dismissAll(); }}>
        <DialogContent>
          {release && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    {release.highlight ? "Destaque" : "Novidade"}
                    {release.version && ` · v${release.version}`}
                  </Badge>
                  {unseen.length > 1 && (
                    <span className="text-xs text-muted-foreground ml-auto">{current + 1} de {unseen.length}</span>
                  )}
                </div>
                <DialogTitle>{release.title}</DialogTitle>
                <DialogDescription className="text-xs">
                  {formatBR(release.published_at || release.created_at)}
                </DialogDescription>
              </DialogHeader>
              <div className="text-sm whitespace-pre-wrap max-h-[50vh] overflow-y-auto">
                {release.content}
              </div>
              <DialogFooter>
                {unseen.length > 1 && current + 1 < unseen.length ? (
                  <>
                    <Button variant="outline" onClick={dismissAll}>Pular tudo</Button>
                    <Button onClick={next}>Próxima</Button>
                  </>
                ) : (
                  <Button onClick={next}>Entendi 🎉</Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
