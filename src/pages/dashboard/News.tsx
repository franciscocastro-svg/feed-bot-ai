import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, Image as ImageIcon, Calendar, ExternalLink, Check, X, Search, Trash2, Eye, Wand2, Plus, Upload, FileText } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { PostCanvasEditor } from "@/components/PostCanvasEditor";
import { statusLabelPt } from "@/lib/statusLabels";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  DEFAULT_EDITORIAL_REEL_DURATION_SECONDS,
  normalizeEditorialReelDuration,
} from "@/lib/editorialReelDuration";

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

type CarouselSlide = {
  title?: string;
  body?: string;
};

type CarouselNewsItem = {
  id: string;
  content_format: "carrossel";
  carousel_slides: CarouselSlide[];
  carousel_media_urls?: string[] | null;
  editorial_ready?: boolean;
};

const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
const NEWS_PAGE_SIZE = 150;
const NEWS_LIST_COLUMNS = [
  "id",
  "status",
  "source_name",
  "created_at",
  "updated_at",
  "original_title",
  "original_url",
  "original_image_url",
  "original_content",
  "rewritten_title",
  "rewritten_summary",
  "caption",
  "hashtags",
  "generated_image_url",
  "generated_cover_url",
  "generated_video_url",
  "instagram_account_id",
  "error_message",
  "retry_count",
  "next_retry_at",
  "editorial_ready",
  "editorial_reel_duration_seconds",
  "content_type",
  "content_format",
  "carousel_slides",
  "carousel_media_urls",
].join(",");

function friendlyDatabaseMessage(error: unknown, t: (source: string) => string = value => value) {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const message = typeof record.message === "string" ? record.message : "";
  const text = `${record.code || ""} ${message} ${record.details || ""}`.toLowerCase();
  if (text.includes("duplicate_news_item_url") || text.includes("duplicate_news_item_title") || text.includes("idx_news_items_unique_active_")) {
    return t("Essa notícia já existe para este Instagram. O sistema bloqueou a duplicidade.");
  }
  if (text.includes("idx_scheduled_posts_unique_active_news_per_ig") || text.includes("duplicate key")) {
    return t("Essa publicação já está agendada para este Instagram.");
  }
  return message || t("Não foi possível concluir a ação.");
}

function friendlyProcessingMessage(value: unknown, t: (source: string) => string = text => text) {
  const message = typeof value === "string" ? value : "";
  if (/identidade da conta indisponível|configure o nome ou @/i.test(message)) {
    return t("Configure o nome ou @ da conta do Instagram e tente novamente.");
  }
  if (/expired_api_key|invalid api key|provedor de ia de reserva/i.test(message)) {
    return t("O provedor de IA de reserva está indisponível. Verifique a chave configurada.");
  }
  if (/402|créditos|credits|payment_required/i.test(message)) {
    return t("Sem créditos de IA disponíveis. Regularize o saldo e tente novamente.");
  }
  return message || t("Não foi possível processar a notícia. Tente novamente.");
}

function statusLabel(status: string, language: string) {
  if (language !== "en-US") return statusLabelPt(status);
  return ({ pending: "Pending", processing: "Processing", processed: "Processed", approved: "Approved", scheduled: "Scheduled", posted: "Published", failed: "Failed", rejected: "Rejected" } as Record<string, string>)[status] || status;
}

function feedPreviewUrl(item: any) {
  if (Array.isArray(item?.carousel_media_urls) && item.carousel_media_urls.length) return item.carousel_media_urls[0];
  return item?.generated_image_url || item?.generated_cover_url || "";
}

function isCarouselItem(item: unknown): item is CarouselNewsItem {
  if (!item || typeof item !== "object") return false;
  const candidate = item as { content_format?: unknown; carousel_slides?: unknown };
  return candidate.content_format === "carrossel" && Array.isArray(candidate.carousel_slides);
}

function hasNewsPreview(item: unknown) {
  return Boolean(feedPreviewUrl(item) || (isCarouselItem(item) && item.carousel_slides.length));
}

function nextConfiguredSlot(mediaType: MediaType, existing: any[], userSettings: any, channelSettings: any) {
  const globalMin = Math.max(10, Number(userSettings?.min_post_interval_minutes) || 10);
  const globalMs = globalMin * 60_000;
  const channelMs = globalMs;
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
  const { language, locale, t } = useLanguage();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<any | null>(null);
  const [scheduleFor, setScheduleFor] = useState<any | null>(null);
  const [previewing, setPreviewing] = useState<any | null>(null);
  const [canvasEditing, setCanvasEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [igAccounts, setIgAccounts] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newsLimit, setNewsLimit] = useState(NEWS_PAGE_SIZE);

  const load = async () => {
    const { data } = await supabase
      .from("news_items")
      .select(NEWS_LIST_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(newsLimit);
    setItems(data || []);
    setSelected(new Set());
  };
  useEffect(() => {
    load();
    supabase.from("instagram_accounts").select("id,username,active,niche,custom_hashtags").eq("active", true).then(({ data }) => setIgAccounts(data || []));
  }, [newsLimit]);

  const sources = useMemo(() => Array.from(new Set(items.map(i => i.source_name).filter(Boolean))), [items]);

  const accountName = (accountId?: string | null) => {
    if (!accountId) return t("sem conta definida");
    const account = igAccounts.find((ig) => ig.id === accountId);
    return account ? `@${account.username}` : t("conta não encontrada");
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(i => {
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (sourceFilter !== "all" && i.source_name !== sourceFilter) return false;
      if (accountFilter !== "all") {
        if (accountFilter === "none" && i.instagram_account_id) return false;
        if (accountFilter !== "none" && i.instagram_account_id !== accountFilter) return false;
      }
      if (q) {
        const t = (i.rewritten_title || i.original_title || "").toLowerCase();
        const c = (i.caption || "").toLowerCase();
        if (!t.includes(q) && !c.includes(q)) return false;
      }
      return true;
    });
  }, [items, search, statusFilter, sourceFilter, accountFilter]);

  const setLoad = (id: string, v: boolean) => setLoading(p => ({ ...p, [id]: v }));

  const process = async (item: any, style: "template" | "ai" = "template") => {
    setLoad(item.id, true);
    const { data, error } = await supabase.functions.invoke("process-news", {
      body: { news_item_id: item.id, image_style: style, media_type: item.content_format || "", sync: true },
    });
    if (error) {
      setLoad(item.id, false);
      return toast.error(friendlyProcessingMessage(error.message, t));
    }
    if (data?.already_processing) {
      setLoad(item.id, false);
      await load();
      return toast.info(t("Esta notícia ainda está sendo processada. Aguarde alguns minutos antes de tentar novamente."));
    }
    if (data?.duplicate_ignored) {
      setLoad(item.id, false);
      await load();
      return toast.info(t("Esta notícia já foi concluída ou não pode ser reprocessada neste estado."));
    }
    if (data?.status === "failed") {
      setLoad(item.id, false);
      await load();
      return toast.error(friendlyProcessingMessage(data?.error, t));
    }
    toast.info(data?.status === "processed" ? t("Processamento concluído. Finalizando a prévia...") : t("Processando... aguarde."));
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
            toast.success(t("Processado com template"));
          } catch (e: any) {
            toast.warning(t("Texto pronto, mas falhou ao compor imagem:") + " " + (e.message || ""));
          }
        } else if (row.status === "processed") {
          toast.success(t("Processado"));
        } else if (row.status === "failed") toast.error(t("Falhou no processamento"));
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
    setTimeout(poll, data?.status === "processed" ? 250 : 4000);
  };

  const reject = async (id: string) => {
    const { error } = await supabase.from("news_items").update({ status: "rejected" }).eq("id", id);
    if (error) return toast.error(error.message);
    load();
  };
  const approve = async (item: any, mediaType: MediaType) => {
    if (isCarouselItem(item) && mediaType !== "feed") {
      toast.error(t("Carrosséis são publicados no Feed. Escolha Carrossel/Feed."));
      return;
    }
    // Respeita o IG vinculado à notícia (definido pela fonte/processamento).
    // Só cai no primeiro como último recurso (notícias antigas sem vínculo).
    const acc =
      igAccounts.find(a => a.id === item.instagram_account_id) ||
      igAccounts[0];
    if (!acc) {
      toast.error(t("Conecte uma conta do Instagram em Contas antes de aprovar."));
      return;
    }
    setLoad(item.id, true);
    try {
      item.instagram_account_id = acc.id;
      await supabase.from("news_items").update({ instagram_account_id: acc.id }).eq("id", item.id);

      if (isCarouselItem(item)) {
        item.carousel_media_urls = null;
        item.editorial_ready = false;
        await supabase.from("news_items").update({
          carousel_media_urls: null,
          generated_image_url: null,
          editorial_ready: false,
          error_message: null,
        } as never).eq("id", item.id);
      }

      // Para Story OU Reel, compõe a arte editorial 9:16 (1080×1920) no navegador
      if (mediaType === "story" || mediaType === "reel") {
        toast.info(t("Gerando arte 1080×1920..."));
        const { composeAndUploadStory } = await import("@/lib/composeStoryCanvas");
        const storyUrl = await composeAndUploadStory(item, { withFollowCta: mediaType === "reel" });
        item.generated_cover_url = storyUrl;
        await supabase.from("news_items").update({ editorial_ready: true }).eq("id", item.id);
      }
      // Reels de notícias são gerados e validados exclusivamente pelo FFmpeg
      // do VPS. Isso evita MP4s do MediaRecorder com duração/metadados instáveis.
      if (mediaType === "reel" && item.content_type !== "video_cut") {
        item.generated_video_url = null;
        await supabase.from("news_items")
          .update({ generated_video_url: null, editorial_ready: false, error_message: null })
          .eq("id", item.id);
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
      toast.success(language === "en-US" ? `${label} scheduled for ${new Date(slot).toLocaleString(locale, { timeZone: "America/Sao_Paulo" })}` : `${label} agendado para ${new Date(slot).toLocaleString(locale, { timeZone: "America/Sao_Paulo" })}`);
      load();
    } catch (e: unknown) {
      toast.error(friendlyDatabaseMessage(e, t) || t("Erro ao agendar"));
    } finally {
      setLoad(item.id, false);
    }
  };

  const remove = async (ids: string[]) => {
    if (!confirm(`Excluir ${ids.length} notícia(s)?`)) return;
    const { error } = await supabase.from("news_items").delete().in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(t("Excluídas"));
    load();
  };

  const saveEdit = async () => {
    if (!editing) return;
    const { error } = await supabase.from("news_items").update({
      rewritten_title: editing.rewritten_title,
      caption: editing.caption,
      hashtags: editing.hashtags,
    }).eq("id", editing.id);
    if (error) return toast.error(friendlyDatabaseMessage(error, t));
    toast.success(t("Salvo"));
    setEditing(null);
    load();
  };

  const bulkProcess = async () => {
    const ids = Array.from(selected);
    toast.info(language === "en-US" ? `Processing ${ids.length}...` : `Processando ${ids.length}...`);
    for (const id of ids) {
      const it = items.find(i => i.id === id);
      if (it && it.status === "pending") await process(it, "template");
    }
    toast.success(t("Lote processado"));
    load();
  };
  const bulkReject = async () => {
    const ids = Array.from(selected);
    if (!confirm(language === "en-US" ? `Reject ${ids.length} news item(s)?` : `Rejeitar ${ids.length} notícia(s)?`)) return;
    const { error } = await supabase.from("news_items").update({ status: "rejected" }).in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(t("Rejeitadas"));
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
  const previewImageUrl = feedPreviewUrl(previewing);

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold">{t("Notícias")}</h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">{t("Aprove, edite e publique cada peça.")}</p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-2 h-4 w-4" /> {t("Criar notícia")}
        </Button>
      </div>

      {/* Filtros */}
      <Card className="p-3 md:p-4 flex flex-col md:flex-row md:flex-wrap md:items-center gap-2 md:gap-3">
        <div className="relative flex-1 min-w-0 md:min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder={t("Buscar...")} value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="flex-1 md:w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>{STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s === "all" ? t("Todos os estados") : statusLabel(s, language)}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="flex-1 md:w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("Todas as fontes")}</SelectItem>
              {sources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="flex-1 md:w-[190px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("Todos Instagrams")}</SelectItem>
              <SelectItem value="none">{t("Sem conta definida")}</SelectItem>
              {igAccounts.map(account => <SelectItem key={account.id} value={account.id}>@{account.username}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <span className="text-xs text-muted-foreground">{language === "en-US" ? `${filtered.length} of ${items.length}` : `${filtered.length} de ${items.length}`}</span>
      </Card>

      {/* Ações em massa */}
      {selected.size > 0 && (
        <Card className="p-3 bg-primary/5 border-primary/30 flex items-center gap-3">
          <span className="text-sm font-medium">{language === "en-US" ? `${selected.size} selected` : `${selected.size} selecionada(s)`}</span>
          <Button size="sm" onClick={bulkProcess}><Sparkles className="h-3 w-3 mr-1" /> {t("Processar todas")}</Button>
          <Button size="sm" variant="outline" onClick={bulkReject}><X className="h-3 w-3 mr-1" /> {t("Rejeitar")}</Button>
          <Button size="sm" variant="destructive" onClick={() => remove(Array.from(selected))}><Trash2 className="h-3 w-3 mr-1" /> {t("Excluir")}</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="ml-auto">{t("Limpar")}</Button>
        </Card>
      )}

      {filtered.length > 0 && (
        <div className="flex items-center gap-2 px-1">
          <Checkbox checked={selected.size === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} />
          <span className="text-xs text-muted-foreground">{t("Selecionar todas visíveis")}</span>
        </div>
      )}

      {filtered.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground border-dashed">{t("Nenhuma notícia com esses filtros.")}</Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(n => (
            <Card key={n.id} className="p-4 md:p-5">
              <div className="flex gap-3 md:gap-4">
                <Checkbox checked={selected.has(n.id)} onCheckedChange={() => toggleSel(n.id)} className="mt-1 shrink-0" />
                {feedPreviewUrl(n) ? (
                  <button onClick={() => setPreviewing(n)} className="shrink-0 group relative">
                    <img src={feedPreviewUrl(n)} alt="" loading="lazy" decoding="async" className="w-20 h-20 md:w-24 md:h-24 rounded-lg object-cover" />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 rounded-lg flex items-center justify-center transition"><Eye className="h-5 w-5 text-white" /></div>
                  </button>
                ) : isCarouselItem(n) ? (
                  <button onClick={() => setPreviewing(n)} className="w-20 h-20 md:w-24 md:h-24 rounded-lg border border-primary/30 bg-primary/5 shrink-0 flex flex-col items-center justify-center text-center p-2">
                    <FileText className="h-5 w-5 text-primary mb-1" />
                    <span className="text-[10px]">{n.carousel_slides.length} {t("slides")}</span>
                  </button>
                ) : n.original_image_url ? (
                  <img src={n.original_image_url} alt="" loading="lazy" decoding="async" className="w-20 h-20 md:w-24 md:h-24 rounded-lg object-cover shrink-0 opacity-70" />
                ) : (
                  <div className="w-20 h-20 md:w-24 md:h-24 rounded-lg bg-secondary shrink-0 flex items-center justify-center"><ImageIcon className="h-6 w-6 text-muted-foreground" /></div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="font-medium leading-tight text-sm md:text-base line-clamp-3">{n.rewritten_title || n.original_title}</p>
                    <span className={`shrink-0 text-[10px] md:text-xs px-2 py-1 rounded-full ${STATUS_COLORS[n.status]}`}>{statusLabel(n.status, language)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2 break-words">
                    {n.source_name} · {accountName(n.instagram_account_id)} · {new Date(n.created_at).toLocaleString(locale, { timeZone: "America/Sao_Paulo" })}
                    {!String(n.original_url || "").startsWith("manual://") && (
                      <a href={n.original_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 ml-1 hover:text-primary"><ExternalLink className="h-3 w-3" />{t("original")}</a>
                    )}
                  </p>
                  {n.caption && <p className="text-xs md:text-sm text-muted-foreground line-clamp-2">{n.caption}</p>}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {["pending", "processing", "failed"].includes(n.status) && (
                      <>
                        <Button size="sm" onClick={() => process(n, "template")} disabled={loading[n.id]}>
                          {loading[n.id] ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />} {n.status === "pending" ? t("Processar") : t("Tentar novamente")}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => process(n, "ai")} disabled={loading[n.id]}>
                        <ImageIcon className="h-3 w-3 mr-1" /> {t("Img IA")}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => reject(n.id)}><X className="h-3 w-3" /></Button>
                      </>
                    )}
                    {n.error_message && <p className="basis-full text-xs text-muted-foreground">{n.error_message}</p>}
                    {n.status === "processed" && (
                      <>
                        {hasNewsPreview(n) && <Button size="sm" variant="outline" onClick={() => setPreviewing(n)}><Eye className="h-3 w-3 mr-1" /> {t("Pré-visualizar")}</Button>}
                        {!isCarouselItem(n) && <Button size="sm" variant="outline" onClick={() => setCanvasEditing(n)}><Wand2 className="h-3 w-3 mr-1" /> {t("Editar visual")}</Button>}
                        <Button size="sm" variant="outline" onClick={() => setEditing(n)}>{t("Editar legenda")}</Button>
                        <Button size="sm" onClick={() => approve(n, "feed")} disabled={loading[n.id]}>
                          {loading[n.id] ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}{isCarouselItem(n) ? "📚 Carrossel" : "📷 Feed"}
                        </Button>
                        {!isCarouselItem(n) && <Button size="sm" onClick={() => approve(n, "reel")} disabled={loading[n.id]}>
                          {loading[n.id] ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}🎬 Reel
                        </Button>}
                        {!isCarouselItem(n) && <Button size="sm" onClick={() => approve(n, "story")} disabled={loading[n.id]}>
                          {loading[n.id] ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}⭐ Story
                        </Button>}
                        <Button size="sm" variant="outline" onClick={() => setScheduleFor(n)}><Calendar className="h-3 w-3 mr-1" /> {t("Horário custom")}</Button>
                      </>
                    )}
                    {n.status === "approved" && (
                      <Button size="sm" onClick={() => setScheduleFor(n)}><Calendar className="h-3 w-3 mr-1" /> {t("Agendar publicação")}</Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {items.length >= newsLimit && (
        <Button variant="outline" onClick={() => setNewsLimit((limit) => limit + NEWS_PAGE_SIZE)} className="w-full">
          {t("Carregar mais notícias")}
        </Button>
      )}

      {/* Editor */}
      <Dialog open={!!editing} onOpenChange={v => !v && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{t("Editar conteúdo")}</DialogTitle><DialogDescription>{t("Ajuste o título, legenda e hashtags antes de publicar.")}</DialogDescription></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div><Label>{t("Título")}</Label><Input value={editing.rewritten_title || ""} onChange={e => setEditing({ ...editing, rewritten_title: e.target.value })} /></div>
              <div><Label>{t("Legenda")} <span className="text-xs text-muted-foreground">({(editing.caption || "").length} {t("caracteres")})</span></Label><Textarea rows={8} value={editing.caption || ""} onChange={e => setEditing({ ...editing, caption: e.target.value })} /></div>
              <div><Label>{t("Hashtags (separadas por espaço)")}</Label><Input value={(editing.hashtags || []).join(" ")} onChange={e => setEditing({ ...editing, hashtags: e.target.value.split(/\s+/).filter(Boolean) })} /></div>
              <Button onClick={saveEdit} className="w-full">{t("Salvar")}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Preview da imagem */}
      <Dialog open={!!previewing} onOpenChange={v => !v && setPreviewing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{t("Pré-visualização")}</DialogTitle><DialogDescription>{t("Como o post vai aparecer no Instagram (1080×1080).")}</DialogDescription></DialogHeader>
          {previewing && (
            <div className="space-y-4">
              {Array.isArray(previewing.carousel_media_urls) && previewing.carousel_media_urls.length ? (
                <div className="flex snap-x gap-3 overflow-x-auto pb-3">
                  {previewing.carousel_media_urls.map((url: string, index: number) => (
                    <figure key={url} className="min-w-[85%] snap-center space-y-1 sm:min-w-[60%]">
                      <img src={url} alt={`Slide ${index + 1}`} className="w-full rounded-lg border" />
                      <figcaption className="text-center text-xs text-muted-foreground">{language === "en-US" ? `Slide ${index + 1} of ${previewing.carousel_media_urls.length}` : `Slide ${index + 1} de ${previewing.carousel_media_urls.length}`}</figcaption>
                    </figure>
                  ))}
                </div>
              ) : isCarouselItem(previewing) ? (
                <div className="grid max-h-[60vh] gap-3 overflow-y-auto sm:grid-cols-2">
                  {previewing.carousel_slides.map((slide: CarouselSlide, index: number) => (
                    <article key={`${previewing.id}-${index}`} className="rounded-lg border bg-muted/20 p-4">
                      <p className="mb-2 text-xs font-medium text-primary">{language === "en-US" ? `Slide ${index + 1} of ${previewing.carousel_slides.length}` : `Slide ${index + 1} de ${previewing.carousel_slides.length}`}</p>
                      <h3 className="font-display text-lg font-bold">{slide.title}</h3>
                      {slide.body && <p className="mt-2 text-sm text-muted-foreground">{slide.body}</p>}
                    </article>
                  ))}
                </div>
              ) : previewImageUrl ? <img src={previewImageUrl} alt="" className="w-full rounded-lg border" /> : null}
              {previewing.caption && (
                <div className="text-sm whitespace-pre-wrap p-4 rounded-lg bg-muted/30 border">
                  <p className="font-medium text-xs text-muted-foreground mb-2">{t("Legenda:")}</p>
                  {previewing.caption}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ScheduleDialog item={scheduleFor} onClose={() => { setScheduleFor(null); load(); }} igAccounts={igAccounts} />

      <ManualNewsDialog
        open={creating}
        igAccounts={igAccounts}
        onClose={() => setCreating(false)}
        onCreated={async (item, processNow) => {
          setCreating(false);
          await load();
          if (processNow) await process(item, "template");
        }}
      />

      <PostCanvasEditor item={canvasEditing} onClose={() => setCanvasEditing(null)} onSaved={load} />
    </div>
  );
}

function ManualNewsDialog({ open, igAccounts, onClose, onCreated }: {
  open: boolean;
  igAccounts: any[];
  onClose: () => void;
  onCreated: (item: any, processNow: boolean) => Promise<void>;
}) {
  const { t } = useLanguage();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sourceName, setSourceName] = useState("Conteúdo manual");
  const [mediaType, setMediaType] = useState<MediaType>("feed");
  const [accountId, setAccountId] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) return;
    setTitle("");
    setContent("");
    setSourceName("Conteúdo manual");
    setMediaType("feed");
    setAccountId("");
    setImageFile(null);
    setImageUrl("");
  }, [open]);

  const chooseImage = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error(t("Escolha uma imagem PNG, JPG ou WEBP."));
    if (file.size > 10 * 1024 * 1024) return toast.error(t("A imagem deve ter no máximo 10 MB."));
    setImageFile(file);
    setImageUrl("");
  };

  const submit = async (processNow: boolean) => {
    const cleanTitle = title.trim();
    const cleanContent = content.trim();
    if (cleanTitle.length < 8) return toast.error(t("Digite um título com pelo menos 8 caracteres."));
    if (cleanContent.length < 80) return toast.error(t("A matéria precisa ter pelo menos 80 caracteres."));
    if (imageUrl.trim() && !/^https?:\/\//i.test(imageUrl.trim())) return toast.error(t("O endereço da imagem precisa começar com http:// ou https://."));
    setBusy(true);
    let uploadedPath: string | null = null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t("Sessão expirada. Entre novamente."));
      const id = crypto.randomUUID();
      let originalImageUrl = imageUrl.trim() || null;
      if (imageFile) {
        const extension = (imageFile.name.split(".").pop() || "jpg").toLowerCase();
        uploadedPath = `${user.id}/manual/${id}.${extension}`;
        const { error: uploadError } = await supabase.storage.from("post-images").upload(uploadedPath, imageFile, {
          contentType: imageFile.type,
          upsert: false,
        });
        if (uploadError) throw uploadError;
        const { data: publicData } = supabase.storage.from("post-images").getPublicUrl(uploadedPath);
        originalImageUrl = publicData.publicUrl;
      }
      const row = {
        id,
        user_id: user.id,
        source_id: null,
        source_name: sourceName.trim() || "Conteúdo manual",
        instagram_account_id: accountId || null,
        original_title: cleanTitle,
        original_content: cleanContent,
        original_url: `manual://${user.id}/${id}`,
        original_image_url: originalImageUrl,
        published_at: new Date().toISOString(),
        status: "pending" as const,
        content_type: "manual",
        content_format: mediaType,
        editorial_ready: false,
      };
      const { data, error } = await supabase.from("news_items").insert(row).select(NEWS_LIST_COLUMNS).single();
      if (error) throw error;
      uploadedPath = null;
      toast.success(processNow ? t("Matéria criada. Iniciando processamento...") : t("Matéria salva como pendente."));
      await onCreated(data, processNow);
    } catch (error: unknown) {
      if (uploadedPath) await supabase.storage.from("post-images").remove([uploadedPath]);
      toast.error(friendlyDatabaseMessage(error, t) || t("Não foi possível criar a matéria."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={value => !value && !busy && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" /> {t("Criar notícia manual")}</DialogTitle>
          <DialogDescription>{t("Escreva uma matéria própria e use o mesmo fluxo de templates, processamento e agendamento.")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label>{t("Título da matéria")}</Label>
            <Input value={title} onChange={event => setTitle(event.target.value)} maxLength={200} placeholder={t("Ex.: Empresa anuncia novo projeto para a comunidade")} />
            <p className="text-right text-xs text-muted-foreground">{title.length}/200</p>
          </div>
          <div className="space-y-1.5">
            <Label>{t("Conteúdo completo")}</Label>
            <Textarea value={content} onChange={event => setContent(event.target.value)} rows={10} placeholder={t("Escreva os fatos, contexto, nomes, datas e informações que devem aparecer na publicação...")} />
            <p className="text-right text-xs text-muted-foreground">{content.length} {t("caracteres")}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>{t("Identificação da fonte")}</Label>
              <Input value={sourceName} onChange={event => setSourceName(event.target.value)} maxLength={80} placeholder={t("Conteúdo manual")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("Conta Instagram")}</Label>
              <Select value={accountId || "none"} onValueChange={value => setAccountId(value === "none" ? "" : value)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("Escolher ao publicar")}</SelectItem>
                  {igAccounts.map(account => <SelectItem key={account.id} value={account.id}>@{account.username}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("Formato principal")}</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["feed", "story", "reel"] as MediaType[]).map(format => (
                <button key={format} type="button" onClick={() => setMediaType(format)} className={`rounded-lg border p-3 text-sm font-medium transition ${mediaType === format ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"}`}>
                  {format === "feed" ? "Feed 1:1" : format === "story" ? "Story 9:16" : "Reel 9:16"}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("Imagem principal")} <span className="font-normal text-muted-foreground">{t("(opcional)")}</span></Label>
            <div className="grid gap-3 md:grid-cols-[180px_1fr]">
              <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 p-3 text-center hover:border-primary">
                {imageFile ? (
                  <><ImageIcon className="mb-2 h-6 w-6 text-primary" /><span className="line-clamp-2 text-xs">{imageFile.name}</span></>
                ) : (
                  <><Upload className="mb-2 h-6 w-6 text-muted-foreground" /><span className="text-xs">{t("Enviar imagem")}</span><span className="text-[10px] text-muted-foreground">{t("até 10 MB")}</span></>
                )}
                <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => chooseImage(event.target.files?.[0])} />
              </label>
              <div className="space-y-1.5">
                <Label className="text-xs">{t("Ou cole o endereço de uma imagem")}</Label>
                <Input type="url" value={imageUrl} disabled={!!imageFile} onChange={event => setImageUrl(event.target.value)} placeholder="https://..." />
                {(imageFile || imageUrl) && <Button type="button" size="sm" variant="ghost" onClick={() => { setImageFile(null); setImageUrl(""); }}>{t("Remover imagem")}</Button>}
              </div>
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onClose} disabled={busy}>{t("Cancelar")}</Button>
            <Button variant="secondary" onClick={() => submit(false)} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{t("Salvar como pendente")}</Button>
            <Button onClick={() => submit(true)} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}{t("Criar e processar")}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleDialog({ item, onClose, igAccounts }: { item: any | null; onClose: () => void; igAccounts: any[] }) {
  const { language, t } = useLanguage();
  const [when, setWhen] = useState("");
  const [acc, setAcc] = useState<string>("");
  const [mediaType, setMediaType] = useState<"feed" | "reel" | "story">("reel");
  const [storyAsVideo, setStoryAsVideo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editorialReelDuration, setEditorialReelDuration] = useState(DEFAULT_EDITORIAL_REEL_DURATION_SECONDS);
  const [editorialDurationLoading, setEditorialDurationLoading] = useState(false);
  const [editorialDurationError, setEditorialDurationError] = useState(false);
  const itemId = item?.id;
  const isAiCut = item?.content_type === "video_cut";
  const itemDurationSnapshot = item?.editorial_reel_duration_seconds;

  useEffect(() => {
    if (item?.content_format === "carrossel") setMediaType("feed");
  }, [item?.id, item?.content_format]);

  useEffect(() => {
    let cancelled = false;
    if (!itemId || isAiCut) {
      setEditorialDurationLoading(false);
      setEditorialDurationError(false);
      return;
    }
    if (itemDurationSnapshot !== null && itemDurationSnapshot !== undefined) {
      setEditorialReelDuration(normalizeEditorialReelDuration(itemDurationSnapshot));
      setEditorialDurationLoading(false);
      setEditorialDurationError(false);
      return;
    }
    setEditorialReelDuration(DEFAULT_EDITORIAL_REEL_DURATION_SECONDS);
    setEditorialDurationLoading(true);
    setEditorialDurationError(false);
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error(t("Sessão expirada"));
        const { data, error } = await supabase
          .from("user_settings")
          .select("editorial_reel_duration_seconds")
          .eq("user_id", user.id)
          .maybeSingle();
        if (error) throw error;
        if (!cancelled) {
          setEditorialReelDuration(normalizeEditorialReelDuration(data?.editorial_reel_duration_seconds));
        }
      } catch {
        if (!cancelled) setEditorialDurationError(true);
      } finally {
        if (!cancelled) setEditorialDurationLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [itemId, isAiCut, itemDurationSnapshot]);

  const ensureStoryVideo = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error(t("Sessão expirada"));
    const { composeAndUploadStory } = await import("@/lib/composeStoryCanvas");
    const sourceUrl = await composeAndUploadStory({ ...item, instagram_account_id: acc || item.instagram_account_id });
    const { imageToReelVideo } = await import("@/lib/imageToVideo");
    const blob = await imageToReelVideo(sourceUrl, 6);
    const path = `${user.id}/${item.id}.mp4`;
    const { error } = await supabase.storage.from("post-images").upload(path, blob, { contentType: "video/mp4", upsert: true });
    if (error) throw error;
    const { data: pub } = supabase.storage.from("post-images").getPublicUrl(path);
    await supabase.from("news_items").update({ generated_video_url: pub.publicUrl }).eq("id", item.id);
  };

  const submit = async () => {
    if (!item || !when) return toast.error(t("Defina a data"));
    if (isCarouselItem(item) && mediaType !== "feed") return toast.error(t("Carrosséis só podem ser agendados no Feed."));
    if (mediaType === "reel" && !isAiCut && (editorialDurationLoading || editorialDurationError)) {
      return toast.error(t("Não foi possível confirmar a duração do Reel. Reabra esta janela e tente novamente."));
    }
    setBusy(true);
    try {
      if (mediaType === "reel" && item.content_type !== "video_cut") {
        const { composeAndUploadStory } = await import("@/lib/composeStoryCanvas");
        await composeAndUploadStory({ ...item, instagram_account_id: acc || item.instagram_account_id }, { withFollowCta: true });
        await supabase.from("news_items")
          .update({ generated_video_url: null, editorial_ready: false, error_message: null })
          .eq("id", item.id);
      }
      if (mediaType === "story" && storyAsVideo) await ensureStoryVideo();
      if (isCarouselItem(item)) {
        await supabase.from("news_items").update({
          carousel_media_urls: null,
          generated_image_url: null,
          editorial_ready: false,
          error_message: null,
        } as never).eq("id", item.id);
      }
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
      toast.success(language === "en-US" ? `Scheduled as ${label}` : `Agendado como ${label}`);
      onClose();
    } catch (e: unknown) {
      toast.error(friendlyDatabaseMessage(e, t) || t("Erro ao agendar"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={!!item} onOpenChange={v => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("Agendar publicação")}</DialogTitle><DialogDescription>{t("Escolha quando, em qual conta e o tipo de post.")}</DialogDescription></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>{t("Tipo de publicação")}</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              <button type="button" onClick={() => setMediaType("feed")}
                className={`p-3 rounded-lg border text-sm font-medium transition ${mediaType === "feed" ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"}`}>
                📷 Feed<div className="text-xs text-muted-foreground font-normal">{t("Imagem 1:1")}</div>
              </button>
              <button type="button" disabled={isCarouselItem(item)} onClick={() => setMediaType("reel")}
                className={`p-3 rounded-lg border text-sm font-medium transition ${mediaType === "reel" ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"}`}>
                🎬 Reel<div className="text-xs text-muted-foreground font-normal">
                  {isAiCut
                    ? t("Duração otimizada pela IA")
                    : editorialDurationLoading
                      ? t("Carregando duração…")
                      : editorialDurationError
                        ? t("Duração indisponível")
                        : language === "en-US" ? `Dynamic 9:16 video, ${editorialReelDuration}s` : `Vídeo dinâmico 9:16, ${editorialReelDuration}s`}
                </div>
              </button>
              <button type="button" disabled={isCarouselItem(item)} onClick={() => setMediaType("story")}
                className={`p-3 rounded-lg border text-sm font-medium transition ${mediaType === "story" ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"}`}>
                ⭐ Story<div className="text-xs text-muted-foreground font-normal">9:16, 24h</div>
              </button>
            </div>
            {isCarouselItem(item) && <p className="mt-2 text-xs text-muted-foreground">{language === "en-US" ? `This content will be published as a native ${item.carousel_slides.length}-slide carousel in Feed.` : `Este conteúdo será publicado como carrossel nativo de ${item.carousel_slides.length} slides no Feed.`}</p>}
            {mediaType === "reel" && (
              <p className="text-xs text-muted-foreground mt-2">
                {isAiCut
                  ? t("Este Corte IA preserva a duração flexível escolhida pela IA para o melhor desempenho.")
                  : editorialDurationError
                    ? t("Não foi possível carregar a duração configurada. O agendamento foi bloqueado para evitar divergências.")
                    : editorialDurationLoading
                      ? t("Carregando a duração configurada para este Reel editorial…")
                      : language === "en-US" ? `This static-image editorial Reel will be generated at 1080×1920 with continuous motion for ${editorialReelDuration} seconds.` : `Este Reel editorial de imagem estática será gerado em 1080×1920 com movimento contínuo durante ${editorialReelDuration} segundos.`}
              </p>
            )}
            {mediaType === "story" && (
              <div className="mt-2 space-y-2">
                <div className="flex gap-2">
                  <button type="button" onClick={() => setStoryAsVideo(false)}
                    className={`flex-1 p-2 rounded-lg border text-xs transition ${!storyAsVideo ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"}`}>
                    {t("Imagem 9:16")}
                  </button>
                  <button type="button" onClick={() => setStoryAsVideo(true)}
                    className={`flex-1 p-2 rounded-lg border text-xs transition ${storyAsVideo ? "border-primary bg-primary/10" : "border-border hover:bg-muted/50"}`}>
                    {t("Vídeo 9:16 (6s)")}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">{t("Stories desaparecem em 24h. Sem legenda visível.")}</p>
              </div>
            )}
          </div>
          <div><Label>{t("Data e hora")}</Label><Input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} /></div>
          <div>
            <Label>{t("Conta Instagram")}</Label>
            <Select value={acc} onValueChange={setAcc}>
              <SelectTrigger><SelectValue placeholder={(() => { const def = igAccounts.find(a => a.id === item?.instagram_account_id) || igAccounts[0]; return def ? `@${def.username} ${t("(padrão)")}` : t("Padrão"); })()} /></SelectTrigger>
              <SelectContent>{igAccounts.map(a => <SelectItem key={a.id} value={a.id}>@{a.username}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <Button
            onClick={submit}
            className="w-full"
            disabled={busy || (mediaType === "reel" && !isAiCut && (editorialDurationLoading || editorialDurationError))}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {busy ? t("Processando...") : t("Agendar")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
