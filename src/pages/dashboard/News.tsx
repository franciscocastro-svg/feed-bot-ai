import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Image as ImageIcon, Calendar, ExternalLink, Check, X, Search, Trash2, Eye, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { PostCanvasEditor } from "@/components/PostCanvasEditor";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-muted text-muted-foreground",
  processing: "bg-warning/20 text-warning",
  processed: "bg-accent/20 text-accent",
  approved: "bg-primary/20 text-primary",
  scheduled: "bg-primary/20 text-primary",
  posted: "bg-success/20 text-success",
  failed: "bg-destructive/20 text-destructive",
  rejected: "bg-muted text-muted-foreground",
};

const STATUS_OPTIONS = ["all", "pending", "processed", "approved", "scheduled", "posted", "failed", "rejected"];
type MediaType = "feed" | "reel" | "story";

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

function nextConfiguredSlot(mediaType: MediaType, existing: any[], userSettings: any, channelSettings: any) {
  const globalMin = Math.max(10, Number(userSettings?.min_post_interval_minutes) || 10);
  const channelMin = Math.max(globalMin, Number(channelSettings?.min_interval_minutes) || globalMin);
  const globalMs = globalMin * 60_000;
  const channelMs = channelMin * 60_000;
  const allowedHours = Array.isArray(channelSettings?.allowed_hours) && channelSettings.allowed_hours.length
    ? channelSettings.allowed_hours.map(Number).filter((h: number) => h >= 0 && h <= 23)
    : Array.isArray(userSettings?.preferred_post_hours)
      ? userSettings.preferred_post_hours.map(Number).filter((h: number) => h >= 0 && h <= 23)
      : [];
  const allTimes = (existing || []).map((s: any) => new Date(s.scheduled_for).getTime()).filter(Number.isFinite).sort((a: number, b: number) => a - b);
  const channelTimes = (existing || [])
    .filter((s: any) => (s.media_type === mediaType) || (!s.media_type && mediaType === "feed"))
    .map((s: any) => new Date(s.scheduled_for).getTime())
    .filter(Number.isFinite)
    .sort((a: number, b: number) => a - b);

  let slot = Date.now() + 60_000;
  const lastAny = allTimes.length ? allTimes[allTimes.length - 1] : 0;
  if (lastAny && slot < lastAny + globalMs) slot = lastAny + globalMs;

  const toBRT = (d: Date) => new Date(d.getTime() - BRT_OFFSET_MS);
  const fromBRT = (d: Date) => new Date(d.getTime() + BRT_OFFSET_MS);
  for (let guard = 0; guard < 800; guard++) {
    const candBRT = toBRT(new Date(slot));
    const hour = candBRT.getUTCHours();
    if (allowedHours.length && !allowedHours.includes(hour)) {
      const sortedHours = [...allowedHours].sort((a, b) => a - b);
      const nextHour = sortedHours.find((h) => h > hour) ?? sortedHours[0];
      const nextBRT = new Date(candBRT);
      if (nextHour > hour) nextBRT.setUTCHours(nextHour, 0, 0, 0);
      else { nextBRT.setUTCDate(nextBRT.getUTCDate() + 1); nextBRT.setUTCHours(nextHour, 0, 0, 0); }
      slot = fromBRT(nextBRT).getTime();
      continue;
    }
    const conflictsAll = allTimes.some((t: number) => Math.abs(slot - t) < globalMs);
    const conflictsChannel = channelTimes.some((t: number) => Math.abs(slot - t) < channelMs);
    if (!conflictsAll && !conflictsChannel) return slot;
    slot += Math.max(60_000, globalMs, Math.ceil(channelMs / 4));
  }
  return slot;
}

export default function News() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<any | null>(null);
  const [scheduleFor, setScheduleFor] = useState<any | null>(null);
  const [previewing, setPreviewing] = useState<any | null>(null);
  const [canvasEditing, setCanvasEditing] = useState<any | null>(null);
  const [igAccounts, setIgAccounts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = async () => {
    const { data } = await supabase.from("news_items").select("*").order("created_at", { ascending: false }).limit(300);
    setItems(data || []);
    setSelected(new Set());
  };
  useEffect(() => {
    load();
    supabase.from("instagram_accounts").select("*").eq("active", true).then(({ data }) => setIgAccounts(data || []));
  }, []);

  const sources = useMemo(() => Array.from(new Set(items.map(i => i.source_name).filter(Boolean))), [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(i => {
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (sourceFilter !== "all" && i.source_name !== sourceFilter) return false;
      if (q) {
        const t = (i.rewritten_title || i.original_title || "").toLowerCase();
        const c = (i.caption || "").toLowerCase();
        if (!t.includes(q) && !c.includes(q)) return false;
      }
      return true;
    });
  }, [items, search, statusFilter, sourceFilter]);

  const setLoad = (id: string, v: boolean) => setLoading(p => ({ ...p, [id]: v }));

  const process = async (item: any, style: "template" | "ai" = "template") => {
    setLoad(item.id, true);
    const { error } = await supabase.functions.invoke("process-news", { body: { news_item_id: item.id, image_style: style } });
    if (error) {
      setLoad(item.id, false);
      const msg = error.message.includes("402") || error.message.includes("credits")
        ? "Sem créditos de IA. Adicione saldo em Cloud & AI balance ou tente novamente para usar o modo gratuito."
        : error.message;
      return toast.error(msg);
    }
    toast.info("Processando em segundo plano... aguarde ~15s");
    // Polling: recarrega até ficar processed/failed (max 60s)
    const start = Date.now();
    const poll = async () => {
      const { data: row } = await supabase.from("news_items").select("*").eq("id", item.id).maybeSingle();
      if (row && (row.status === "processed" || row.status === "failed" || row.status === "rejected")) {
        if (row.status === "processed" && style === "template") {
          // Compõe o template no navegador (alta qualidade, sem CPU limit do servidor)
          try {
            const { composeAndUploadPost } = await import("@/lib/composePostCanvas");
            await composeAndUploadPost(row);
            await supabase.from("news_items").update({ editorial_ready: true }).eq("id", row.id);
            toast.success("Processado com template");
          } catch (e: any) {
            toast.warning("Texto pronto, mas falhou ao compor imagem: " + (e.message || ""));
          }
        } else if (row.status === "processed") {
          toast.success("Processado");
        } else if (row.status === "failed") toast.error("Falhou no processamento");
        setLoad(item.id, false);
        load();
        return;
      }
      if (Date.now() - start > 60000) {
        setLoad(item.id, false);
        load();
        return;
      }
      setTimeout(poll, 3000);
    };
    setTimeout(poll, 4000);
  };

  const reject = async (id: string) => {
    await supabase.from("news_items").update({ status: "rejected" }).eq("id", id);
    load();
  };
  const approve = async (item: any, mediaType: MediaType) => {
    // Respeita o IG vinculado à notícia (definido pela fonte/processamento).
    // Só cai no primeiro como último recurso (notícias antigas sem vínculo).
    const acc =
      igAccounts.find(a => a.id === item.instagram_account_id) ||
      igAccounts[0];
    if (!acc) {
      toast.error("Conecte uma conta do Instagram em Contas antes de aprovar.");
      return;
    }
    setLoad(item.id, true);
    try {
      // Para Story OU Reel, compõe a arte editorial 9:16 (1080×1920) no navegador
      if (mediaType === "story" || mediaType === "reel") {
        toast.info("Gerando arte 1080×1920...");
        const { composeAndUploadStory } = await import("@/lib/composeStoryCanvas");
        const storyUrl = await composeAndUploadStory(item, { withFollowCta: mediaType === "reel" });
        item.generated_cover_url = storyUrl;
        await supabase.from("news_items").update({ editorial_ready: true }).eq("id", item.id);
      }
      // Para Reel ou Story em vídeo, gera o MP4 9:16 antes de agendar
      if (mediaType === "reel" || mediaType === "story") {
        if (mediaType === "reel" && !item.generated_video_url) {
          const sourceUrl = item.generated_cover_url || item.generated_image_url;
          if (!sourceUrl) throw new Error("Imagem não gerada ainda");
          toast.info("Gerando vídeo 9:16 (~20s)...");
          const { imageToReelVideo } = await import("@/lib/imageToVideo");
          // busca a trilha sonora padrão configurada
          const { data: { user: u0 } } = await supabase.auth.getUser();
          const { data: settings } = await supabase.from("user_settings").select("reel_audio_url").eq("user_id", u0!.id).maybeSingle();
          const blob = await imageToReelVideo(sourceUrl, 6, settings?.reel_audio_url);
          const isMp4 = (blob.type || "").includes("mp4");
          if (!isMp4) throw new Error("Seu navegador não consegue gerar MP4. Use o Chrome desktop para aprovar Reels.");
          const { data: { user } } = await supabase.auth.getUser();
          const path = `${user!.id}/${item.id}.mp4`;
          const { error: upErr } = await supabase.storage.from("post-images").upload(path, blob, { contentType: "video/mp4", upsert: true });
          if (upErr) throw upErr;
          const { data: pub } = supabase.storage.from("post-images").getPublicUrl(path);
          await supabase.from("news_items").update({ generated_video_url: pub.publicUrl }).eq("id", item.id);
        }
      }

      // Próximo slot livre — respeita Automação + configuração específica do canal
      const { data: { user } } = await supabase.auth.getUser();
      const [{ data: us }, { data: ch }, { data: existing }] = await Promise.all([
        supabase.from("user_settings").select("min_post_interval_minutes, preferred_post_hours").eq("user_id", user!.id).maybeSingle(),
        supabase.from("channel_settings").select("min_interval_minutes, allowed_hours").eq("user_id", user!.id).eq("channel", mediaType).maybeSingle(),
        supabase.from("scheduled_posts").select("scheduled_for, media_type").in("status", ["scheduled", "posting", "awaiting_container"]),
      ]);
      const slot = nextConfiguredSlot(mediaType, existing || [], us, ch);

      const { error: schedErr } = await supabase.from("scheduled_posts").insert({
        news_item_id: item.id,
        instagram_account_id: acc.id,
        scheduled_for: new Date(slot).toISOString(),
        status: "scheduled",
        media_type: mediaType,
        user_id: user!.id,
      });
      if (schedErr) throw schedErr;
      await supabase.from("news_items").update({ status: "scheduled" }).eq("id", item.id);
      const label = mediaType === "reel" ? "Reel" : mediaType === "story" ? "Story" : "Feed";
      toast.success(`${label} agendado para ${new Date(slot).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`);
      load();
    } catch (e: any) {
      toast.error(e.message || "Erro ao agendar");
    } finally {
      setLoad(item.id, false);
    }
  };

  const remove = async (ids: string[]) => {
    if (!confirm(`Excluir ${ids.length} notícia(s)?`)) return;
    await supabase.from("news_items").delete().in("id", ids);
    toast.success("Excluídas");
    load();
  };

  const saveEdit = async () => {
    if (!editing) return;
    await supabase.from("news_items").update({
      rewritten_title: editing.rewritten_title,
      caption: editing.caption,
      hashtags: editing.hashtags,
    }).eq("id", editing.id);
    toast.success("Salvo");
    setEditing(null);
    load();
  };

  const bulkProcess = async () => {
    const ids = Array.from(selected);
    toast.info(`Processando ${ids.length}...`);
    for (const id of ids) {
      const it = items.find(i => i.id === id);
      if (it && it.status === "pending") await process(it, "template");
    }
    toast.success("Lote processado");
    load();
  };
  const bulkReject = async () => {
    const ids = Array.from(selected);
    if (!confirm(`Rejeitar ${ids.length} notícia(s)?`)) return;
    await supabase.from("news_items").update({ status: "rejected" }).in("id", ids);
    toast.success("Rejeitadas");
    load();
  };

  const toggleSel = (id: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };
  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(i => i.id)));
  };
  const previewImageUrl = previewing?.generated_cover_url || previewing?.generated_image_url;

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl">
      <div>
        <h1 className="font-display text-2xl md:text-3xl font-bold">Notícias</h1>
        <p className="text-sm md:text-base text-muted-foreground mt-1">Aprove, edite e publique cada peça.</p>
      </div>

      {/* Filtros */}
      <Card className="p-3 md:p-4 flex flex-col md:flex-row md:flex-wrap md:items-center gap-2 md:gap-3">
        <div className="relative flex-1 min-w-0 md:min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="flex-1 md:w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>{STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s === "all" ? "Todos status" : s}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="flex-1 md:w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as fontes</SelectItem>
              {sources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <span className="text-xs text-muted-foreground">{filtered.length} de {items.length}</span>
      </Card>

      {/* Ações em massa */}
      {selected.size > 0 && (
        <Card className="p-3 bg-primary/5 border-primary/30 flex items-center gap-3">
          <span className="text-sm font-medium">{selected.size} selecionada(s)</span>
          <Button size="sm" onClick={bulkProcess}><Sparkles className="h-3 w-3 mr-1" /> Processar todas</Button>
          <Button size="sm" variant="outline" onClick={bulkReject}><X className="h-3 w-3 mr-1" /> Rejeitar</Button>
          <Button size="sm" variant="destructive" onClick={() => remove(Array.from(selected))}><Trash2 className="h-3 w-3 mr-1" /> Excluir</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="ml-auto">Limpar</Button>
        </Card>
      )}

      {filtered.length > 0 && (
        <div className="flex items-center gap-2 px-1">
          <Checkbox checked={selected.size === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} />
          <span className="text-xs text-muted-foreground">Selecionar todas visíveis</span>
        </div>
      )}

      {filtered.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground border-dashed">Nenhuma notícia com esses filtros.</Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(n => (
            <Card key={n.id} className="p-4 md:p-5">
              <div className="flex gap-3 md:gap-4">
                <Checkbox checked={selected.has(n.id)} onCheckedChange={() => toggleSel(n.id)} className="mt-1 shrink-0" />
                {n.generated_image_url ? (
                  <button onClick={() => setPreviewing(n)} className="shrink-0 group relative">
                    <img src={n.generated_image_url} alt="" className="w-20 h-20 md:w-24 md:h-24 rounded-lg object-cover" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 rounded-lg flex items-center justify-center transition"><Eye className="h-5 w-5 text-white" /></div>
                  </button>
                ) : n.original_image_url ? (
                  <img src={n.original_image_url} alt="" className="w-20 h-20 md:w-24 md:h-24 rounded-lg object-cover shrink-0 opacity-70" />
                ) : (
                  <div className="w-20 h-20 md:w-24 md:h-24 rounded-lg bg-secondary shrink-0 flex items-center justify-center"><ImageIcon className="h-6 w-6 text-muted-foreground" /></div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-medium leading-tight text-sm md:text-base line-clamp-3">{n.rewritten_title || n.original_title}</p>
                    <span className={`shrink-0 text-[10px] md:text-xs px-2 py-1 rounded-full ${STATUS_COLORS[n.status]}`}>{n.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2 break-words">{n.source_name} · {new Date(n.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} <a href={n.original_url} target="_blank" className="inline-flex items-center gap-1 ml-1 hover:text-primary"><ExternalLink className="h-3 w-3" />original</a></p>
                  {n.caption && <p className="text-xs md:text-sm text-muted-foreground line-clamp-2">{n.caption}</p>}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {["pending", "processing", "failed"].includes(n.status) && (
                      <>
                        <Button size="sm" onClick={() => process(n, "template")} disabled={loading[n.id]}>
                          {loading[n.id] ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />} {n.status === "pending" ? "Processar" : "Tentar novamente"}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => process(n, "ai")} disabled={loading[n.id]}>
                          <ImageIcon className="h-3 w-3 mr-1" /> Img IA
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => reject(n.id)}><X className="h-3 w-3" /></Button>
                      </>
                    )}
                    {n.error_message && <p className="basis-full text-xs text-muted-foreground">{n.error_message}</p>}
                    {n.status === "processed" && (
                      <>
                        {n.generated_image_url && <Button size="sm" variant="outline" onClick={() => setPreviewing(n)}><Eye className="h-3 w-3 mr-1" /> Pré-visualizar</Button>}
                        <Button size="sm" variant="outline" onClick={() => setCanvasEditing(n)}><Wand2 className="h-3 w-3 mr-1" /> Editar visual</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditing(n)}>Editar legenda</Button>
                        <Button size="sm" onClick={() => approve(n, "feed")} disabled={loading[n.id]}>
                          {loading[n.id] ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}📷 Feed
                        </Button>
                        <Button size="sm" onClick={() => approve(n, "reel")} disabled={loading[n.id]}>
                          {loading[n.id] ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}🎬 Reel
                        </Button>
                        <Button size="sm" onClick={() => approve(n, "story")} disabled={loading[n.id]}>
                          {loading[n.id] ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}⭐ Story
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setScheduleFor(n)}><Calendar className="h-3 w-3 mr-1" /> Horário custom</Button>
                      </>
                    )}
                    {n.status === "approved" && (
                      <Button size="sm" onClick={() => setScheduleFor(n)}><Calendar className="h-3 w-3 mr-1" /> Agendar publicação</Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Editor */}
      <Dialog open={!!editing} onOpenChange={v => !v && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Editar conteúdo</DialogTitle><DialogDescription>Ajuste o título, legenda e hashtags antes de publicar.</DialogDescription></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div><Label>Título</Label><Input value={editing.rewritten_title || ""} onChange={e => setEditing({ ...editing, rewritten_title: e.target.value })} /></div>
              <div><Label>Legenda <span className="text-xs text-muted-foreground">({(editing.caption || "").length} caracteres)</span></Label><Textarea rows={8} value={editing.caption || ""} onChange={e => setEditing({ ...editing, caption: e.target.value })} /></div>
              <div><Label>Hashtags (separadas por espaço)</Label><Input value={(editing.hashtags || []).join(" ")} onChange={e => setEditing({ ...editing, hashtags: e.target.value.split(/\s+/).filter(Boolean) })} /></div>
              <Button onClick={saveEdit} className="w-full">Salvar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Preview da imagem */}
      <Dialog open={!!previewing} onOpenChange={v => !v && setPreviewing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Pré-visualização</DialogTitle><DialogDescription>Como o post vai aparecer no Instagram (1080×1080).</DialogDescription></DialogHeader>
          {previewImageUrl && (
            <div className="space-y-4">
              <img src={previewImageUrl} alt="" className="w-full rounded-lg border" />
              {previewing.caption && (
                <div className="text-sm whitespace-pre-wrap p-4 rounded-lg bg-muted/30 border">
                  <p className="font-medium text-xs text-muted-foreground mb-2">Legenda:</p>
                  {previewing.caption}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ScheduleDialog item={scheduleFor} onClose={() => { setScheduleFor(null); load(); }} igAccounts={igAccounts} />

      <PostCanvasEditor item={canvasEditing} onClose={() => setCanvasEditing(null)} onSaved={load} />
    </div>
  );
}

function ScheduleDialog({ item, onClose, igAccounts }: { item: any | null; onClose: () => void; igAccounts: any[] }) {
  const [when, setWhen] = useState("");
  const [acc, setAcc] = useState<string>("");
  const [mediaType, setMediaType] = useState<"feed" | "reel" | "story">("reel");
  const [storyAsVideo, setStoryAsVideo] = useState(false);
  const [busy, setBusy] = useState(false);

  const ensureReelVideo = async (): Promise<string> => {
    if (item.generated_video_url) return item.generated_video_url;
    const sourceUrl = item.generated_cover_url || item.generated_image_url;
    if (!sourceUrl) throw new Error("Imagem não gerada ainda");
    toast.info("Gerando vídeo 9:16 (pode levar ~20s)...");
    const { imageToReelVideo } = await import("@/lib/imageToVideo");
    const { data: { user } } = await supabase.auth.getUser();
    const { data: settings } = await supabase.from("user_settings").select("reel_audio_url").eq("user_id", user!.id).maybeSingle();
    const blob = await imageToReelVideo(sourceUrl, 6, settings?.reel_audio_url);
    const path = `${user!.id}/${item.id}.mp4`;
    const { error } = await supabase.storage.from("post-images").upload(path, blob, { contentType: "video/mp4", upsert: true });
    if (error) throw error;
    const { data: pub } = supabase.storage.from("post-images").getPublicUrl(path);
    await supabase.from("news_items").update({ generated_video_url: pub.publicUrl }).eq("id", item.id);
    return pub.publicUrl;
  };

  const submit = async () => {
    if (!item || !when) return toast.error("Defina a data");
    setBusy(true);
    try {
      if (mediaType === "reel" || (mediaType === "story" && storyAsVideo)) await ensureReelVideo();
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("scheduled_posts").insert({
        user_id: user!.id,
        news_item_id: item.id,
        instagram_account_id: acc || item.instagram_account_id || igAccounts[0]?.id || null,
        scheduled_for: new Date(when).toISOString(),
        media_type: mediaType,
      });
      if (error) throw error;
      await supabase.from("news_items").update({ status: "scheduled" }).eq("id", item.id);
      const label = mediaType === "reel" ? "Reel" : mediaType === "story" ? "Story" : "Feed";
      toast.success(`Agendado como ${label}`);
      onClose();
    } catch (e: any) {
      toast.error(e.message || "Erro ao agendar");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={!!item} onOpenChange={v => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Agendar publicação</DialogTitle><DialogDescription>Escolha quando, em qual conta e o tipo de post.</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Tipo de publicação</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              <button type="button" onClick={() => setMediaType("feed")}
                className={`p-3 rounded-lg border text-sm font-medium transition ${mediaType === "feed" ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"}`}>
                📷 Feed<div className="text-xs text-muted-foreground font-normal">Imagem 1:1</div>
              </button>
              <button type="button" onClick={() => setMediaType("reel")}
                className={`p-3 rounded-lg border text-sm font-medium transition ${mediaType === "reel" ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"}`}>
                🎬 Reel<div className="text-xs text-muted-foreground font-normal">Vídeo 9:16, 6s</div>
              </button>
              <button type="button" onClick={() => setMediaType("story")}
                className={`p-3 rounded-lg border text-sm font-medium transition ${mediaType === "story" ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"}`}>
                ⭐ Story<div className="text-xs text-muted-foreground font-normal">9:16, 24h</div>
              </button>
            </div>
            {mediaType === "reel" && <p className="text-xs text-muted-foreground mt-2">O vídeo é gerado a partir da imagem (estático, 6s, 1080×1920) ao agendar.</p>}
            {mediaType === "story" && (
              <div className="mt-2 space-y-2">
                <div className="flex gap-2">
                  <button type="button" onClick={() => setStoryAsVideo(false)}
                    className={`flex-1 p-2 rounded-lg border text-xs transition ${!storyAsVideo ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"}`}>
                    Imagem 9:16
                  </button>
                  <button type="button" onClick={() => setStoryAsVideo(true)}
                    className={`flex-1 p-2 rounded-lg border text-xs transition ${storyAsVideo ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"}`}>
                    Vídeo 9:16 (6s)
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">Stories desaparecem em 24h. Sem legenda visível.</p>
              </div>
            )}
          </div>
          <div><Label>Data e hora</Label><Input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} /></div>
          <div>
            <Label>Conta Instagram</Label>
            <Select value={acc} onValueChange={setAcc}>
              <SelectTrigger><SelectValue placeholder={(() => { const def = igAccounts.find(a => a.id === item?.instagram_account_id) || igAccounts[0]; return def ? `@${def.username} (padrão)` : "Padrão"; })()} /></SelectTrigger>
              <SelectContent>{igAccounts.map(a => <SelectItem key={a.id} value={a.id}>@{a.username}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button onClick={submit} className="w-full" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {busy ? "Processando..." : "Agendar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
