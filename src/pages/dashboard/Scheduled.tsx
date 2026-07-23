import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Calendar, Send, Trash2, Pencil, RefreshCw, AlertTriangle, Zap, Clock, Eye, Film, Image as ImageIcon, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";

const ACTIVE_POST_LIMIT = 150;
const POSTED_POST_LIMIT = 30;
const SCHEDULE_REFRESH_MS = 30000;

function isManagedReelVideoUrl(url?: string | null, userId?: string | null, itemId?: string | null, contentType?: string | null) {
  if (contentType === "video_cut") return Boolean(url);
  if (!url || !userId || !itemId) return false;
  const clean = String(url).split("?")[0];
  let decoded = clean;
  try { decoded = decodeURIComponent(clean); } catch { /* keep raw url */ }
  const expectedPath = `${userId}/${itemId}.mp4`;
  return decoded.includes(`/post-images/${expectedPath}`) || decoded.endsWith(`/${expectedPath}`);
}

export default function Scheduled() {
  const { language, locale, t } = useLanguage();
  const fmtBR = (d: string | Date) =>
    new Date(d).toLocaleString(locale, { timeZone: "America/Sao_Paulo" }) + ` (${language === "en-US" ? "Brasilia" : "Brasília"})`;
  const [posts, setPosts] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [running, setRunning] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState<any | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [editAccount, setEditAccount] = useState<string>("");
  const [editWhen, setEditWhen] = useState<string>("");

  const load = async () => {
    const sel = "*, news_items(rewritten_title, generated_image_url, generated_cover_url, generated_video_url, editorial_ready, caption, reel_caption, content_type), instagram_accounts(username)";
    const [{ data: pending }, { data: postedRows }, { data: a }] = await Promise.all([
      supabase.from("scheduled_posts").select(sel).in("status", ["scheduled", "posting", "awaiting_container", "failed"]).order("scheduled_for", { ascending: true }).limit(ACTIVE_POST_LIMIT),
      supabase.from("scheduled_posts").select(sel).eq("status", "posted").order("posted_at", { ascending: false }).limit(POSTED_POST_LIMIT),
      supabase.from("instagram_accounts").select("id, username, active").eq("active", true),
    ]);
    const p = [...(pending || []), ...(postedRows || [])];
    const rank = (s: string) => {
      if (s === "scheduled") return 0;
      if (s === "posting") return 1;
      if (s === "awaiting_container") return 2;
      if (s === "failed") return 3;
      return 4;
    };
    const sorted = p.slice().sort((a: any, b: any) => {
      const r = rank(a.status) - rank(b.status);
      if (r !== 0) return r;
      if (a.status === "posted" && b.status === "posted") {
        return new Date(b.posted_at || b.scheduled_for).getTime() - new Date(a.posted_at || a.scheduled_for).getTime();
      }
      return new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime();
    });
    setPosts(sorted);
    setAccounts(a || []);
  };
  useEffect(() => {
    load();
    const i = setInterval(load, SCHEDULE_REFRESH_MS);
    return () => clearInterval(i);
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
    toast.success(t("Lista atualizada"));
  };

  const runNow = async () => {
    setRunning(true);
    const { data, error } = await supabase.functions.invoke("publish-scheduler");
    setRunning(false);
    if (error) return toast.error(error.message);
    toast.success(language === "en-US" ? `${data?.processed || 0} posts processed` : `${data?.processed || 0} posts processados`);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm(t("Apagar este agendamento?"))) return;
    const { error } = await supabase.from("scheduled_posts").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(t("Removido"));
    load();
  };

  const openEdit = (p: any) => {
    setEditing(p);
    setEditAccount(p.instagram_account_id || (accounts[0]?.id ?? ""));
    const d = new Date(p.scheduled_for);
    const pad = (n: number) => String(n).padStart(2, "0");
    setEditWhen(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
  };

  const saveEdit = async () => {
    if (!editing) return;
    const { error } = await supabase.from("scheduled_posts").update({
      instagram_account_id: editAccount || null,
      scheduled_for: new Date(editWhen).toISOString(),
      status: "scheduled",
      error_message: null,
      retry_count: 0,
    }).eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success(t("Atualizado"));
    setEditing(null);
    load();
  };

  const retry = async (id: string) => {
    const { error } = await supabase.from("scheduled_posts").update({
      status: "scheduled",
      error_message: null,
      retry_count: 0,
      scheduled_for: new Date().toISOString(),
    }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(t("Reenfileirado"));
    load();
  };

  const regenerateArtwork = async (post: any) => {
    if (!post.news_item_id || !post.instagram_account_id) {
      toast.error(t("Este agendamento não possui notícia ou conta vinculada."));
      return;
    }
    setRegeneratingId(post.id);
    try {
      const { data: item, error } = await supabase.from("news_items").select("*").eq("id", post.news_item_id).maybeSingle();
      if (error || !item) throw new Error(error?.message || t("Notícia não encontrada"));

      item.instagram_account_id = post.instagram_account_id;
      const { error: accountError } = await supabase.from("news_items")
        .update({ instagram_account_id: post.instagram_account_id })
        .eq("id", item.id);
      if (accountError) throw accountError;

      if (post.media_type === "feed" || !post.media_type) {
        const { composeAndUploadPost } = await import("@/lib/composePostCanvas");
        await composeAndUploadPost(item);
      } else {
        const { composeAndUploadStory } = await import("@/lib/composeStoryCanvas");
        await composeAndUploadStory(item, { withFollowCta: post.media_type === "reel" });
        if (post.media_type === "reel" && item.content_type !== "video_cut") {
          toast.info(t("Reenfileirando o vídeo para validação no VPS..."));
          const { error: resetError } = await supabase.from("news_items")
            .update({ generated_video_url: null, editorial_ready: false, error_message: null })
            .eq("id", item.id);
          if (resetError) throw resetError;
          await supabase.from("reel_render_jobs").delete().eq("scheduled_post_id", post.id);
          const { error: enqueueError } = await supabase.rpc("enqueue_reel_render_job_for_post", { _scheduled_post_id: post.id });
          if (enqueueError) throw enqueueError;
        }
      }

      toast.success(language === "en-US" ? `Artwork regenerated with @${post.instagram_accounts?.username || "account"}'s current template` : `Arte regenerada com o template atual de @${post.instagram_accounts?.username || "conta"}`);
      await load();
    } catch (error) {
      toast.error(`${t("Não foi possível regenerar a arte")}: ${error instanceof Error ? error.message : t("erro desconhecido")}`);
    } finally {
      setRegeneratingId(null);
    }
  };

  const publishNow = async (id: string) => {
    if (!confirm(t("Publicar este post AGORA no Instagram?"))) return;
    setPublishingId(id);
    try {
      const { error: updErr } = await supabase.from("scheduled_posts").update({
        scheduled_for: new Date(Date.now() - 1000).toISOString(),
        status: "scheduled",
        error_message: null,
      }).eq("id", id);
      if (updErr) throw updErr;
      const { data, error } = await supabase.functions.invoke("publish-scheduler", {
        body: { scheduled_post_id: id },
      });
      if (error) throw error;
      toast.success(language === "en-US" ? `Publication sent (${data?.processed || 0} processed)` : `Publicação enviada (${data?.processed || 0} processado(s))`);
      load();
    } catch (e: any) {
      toast.error(e.message || t("Erro ao publicar"));
    } finally {
      setPublishingId(null);
    }
  };

  const checkContainerNow = async (id: string) => {
    setPublishingId(id);
    try {
      const { data, error } = await supabase.functions.invoke("publish-scheduler", {
        body: { scheduled_post_id: id },
      });
      if (error) throw error;
      toast.success(language === "en-US" ? `Meta verified (${data?.processed || 0} published)` : `Meta verificada (${data?.processed || 0} publicado(s))`);
      load();
    } catch (e: any) {
      toast.error(e.message || t("Erro ao verificar Meta"));
    } finally {
      setPublishingId(null);
    }
  };

  const statusLabel = (status: string) => {
    if (status === "scheduled") return t("agendado");
    if (status === "posting") return t("enviando");
    if (status === "awaiting_container") return t("aguardando IG");
    if (status === "posted") return t("publicado");
    if (status === "failed") return t("falhou");
    return status;
  };

  const getFriendlyError = (message?: string | null) => {
    if (!message) return null;
    if (/token do instagram expirou|session has expired|validating access token|oauth/i.test(message)) {
      return t("Token do Instagram expirou. Atualize em Contas Instagram antes de tentar novamente.");
    }
    return message;
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-5xl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold">{t("Agendados")}</h1>
          <p className="text-muted-foreground mt-1">{t("Fila de publicações no Instagram.")}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button variant="outline" onClick={refresh} disabled={refreshing} className="min-w-0">
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} /> {t("Atualizar")}
          </Button>
          <Button onClick={runNow} disabled={running} className="min-w-0">
            {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />} {t("Executar agora")}
          </Button>
        </div>
      </div>
      {posts.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground border-dashed">
          <Calendar className="h-10 w-10 mx-auto mb-3 opacity-50" />
          {t("Nada agendado ainda.")}
        </Card>
      ) : (
        <div className="space-y-3">
          {posts.map(p => {
            const missingAccount = !p.instagram_account_id;
            const failed = p.status === "failed";
            const awaitingContainer = p.status === "awaiting_container";
            const posting = p.status === "posting";
            const news = p.news_items || {};
            const managedReelVideo = p.media_type === "reel"
              ? isManagedReelVideoUrl(news.generated_video_url, p.user_id, p.news_item_id, news.content_type)
              : false;
            const finalMediaReady = p.media_type === "reel"
              ? !!(managedReelVideo && news.editorial_ready)
              : p.media_type === "story"
                ? !!((news.generated_video_url || news.generated_cover_url || news.generated_image_url) && news.editorial_ready)
                : !!((news.generated_image_url || news.generated_cover_url) && news.editorial_ready);
            const staleGenerationNotice = /Aguardando geração da arte\/vídeo com template/i.test(p.error_message || "") && finalMediaReady;
            const friendlyError = staleGenerationNotice ? null : getFriendlyError(p.error_message);
            const scheduledAt = new Date(p.scheduled_for);
            const minutesUntilPost = Math.round((scheduledAt.getTime() - Date.now()) / 60000);
            const isDelayed = p.status === "scheduled" && minutesUntilPost >= 60;
            const thumbnailUrl = p.media_type === "feed"
              ? p.news_items?.generated_image_url || p.news_items?.generated_cover_url
              : p.news_items?.generated_cover_url || p.news_items?.generated_image_url;
            return (
              <Card key={p.id} className="p-3 md:p-5">
                <div className="flex gap-3 md:gap-4 items-start">
                  {thumbnailUrl && (
                    <img src={thumbnailUrl} loading="lazy" decoding="async" className="w-16 h-16 md:w-20 md:h-20 rounded-lg object-cover shrink-0" alt="" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
                      <p className="font-medium text-sm md:text-base line-clamp-2 flex-1 min-w-0">{p.news_items?.rewritten_title}</p>
                      <span className="w-fit max-w-full truncate text-[10px] md:text-xs px-2 py-0.5 rounded-full bg-secondary border border-border shrink-0">{statusLabel(p.status)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      @{p.instagram_accounts?.username || <span className="text-destructive">{t("conta faltando")}</span>}
                      {" · "}
                      <span title={t("Horário de publicação agendado")}>
                        {p.status === "posted" && p.posted_at
                          ? `${t("publicado em")} ${fmtBR(p.posted_at)}`
                          : awaitingContainer
                          ? `${t("aguardando Instagram desde")} ${fmtBR(p.container_created_at || p.updated_at || p.scheduled_for)}`
                          : posting
                          ? `${t("enviando desde")} ${fmtBR(p.updated_at || p.scheduled_for)}`
                          : `${t("agendado para")} ${fmtBR(p.scheduled_for)}`}
                      </span>
                    </p>
                    <p className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">
                      {t("gerado em")} {fmtBR(p.created_at)}
                    </p>
                    {isDelayed && (
                      <p className="text-xs text-amber-500 mt-1 flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {language === "en-US" ? "Publishes in" : "Publica em"} ~{minutesUntilPost >= 60 ? `${Math.floor(minutesUntilPost/60)}h${minutesUntilPost%60 ? ` ${minutesUntilPost%60}min` : ""}` : `${minutesUntilPost} min`} {t("(fila espaçada a cada 10 min)")}
                      </p>
                    )}
                    {p.media_type === "reel" && p.status !== "posted" && (
                      awaitingContainer ? (
                        <p className="text-xs text-amber-500 mt-1 line-clamp-2">⏳ Reel · {t("Instagram/Meta processando o vídeo")}</p>
                      ) : managedReelVideo && p.news_items?.editorial_ready ? (
                        <p className="text-xs text-emerald-500 mt-1">🎬 {news.content_type === "video_cut" ? t("Corte IA · vídeo completo pronto") : t("Reel · vídeo pronto")}</p>
                      ) : p.news_items?.generated_video_url ? (
                        <p className="text-xs text-amber-500 mt-1 line-clamp-2">⏳ Reel · {t("regenerando vídeo com template…")}</p>
                      ) : (
                        <p className="text-xs text-amber-500 mt-1 line-clamp-2">⏳ Reel · {t("vídeo gerando…")}</p>
                      )
                    )}
                    {p.media_type === "story" && p.status !== "posted" && (
                      <p className="text-xs text-purple-400 mt-1 line-clamp-2">⭐ Story · {p.news_items?.generated_video_url ? t("vídeo 9:16") : t("imagem 9:16")}</p>
                    )}
                    {p.media_type === "feed" && p.status !== "posted" && (
                      <p className="text-xs text-blue-400 mt-1">📷 Feed · {t("imagem 1:1")}</p>
                    )}
                    {friendlyError && (
                      <p className="text-xs text-destructive mt-1 flex items-start gap-1">
                        <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{friendlyError}</span>
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-border/50">
                  {awaitingContainer && p.instagram_account_id && (
                    <Button size="sm" variant="outline" onClick={() => checkContainerNow(p.id)} disabled={publishingId === p.id} title={t("Verificar processamento na Meta")} className="min-w-[9rem] flex-1 md:flex-none">
                      {publishingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RefreshCw className="h-4 w-4 mr-1" /> {t("Verificar Meta")}</>}
                    </Button>
                  )}
                  {p.status !== "posted" && !awaitingContainer && p.instagram_account_id && (
                    <Button size="sm" onClick={() => publishNow(p.id)} disabled={publishingId === p.id} title={t("Publicar agora")} className="min-w-[9rem] flex-1 md:flex-none">
                      {publishingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Zap className="h-4 w-4 mr-1" /> {t("Publicar agora")}</>}
                    </Button>
                  )}
                  {(missingAccount || failed) && (
                    <Button size="sm" variant="outline" onClick={() => retry(p.id)} title={t("Tentar novamente")}>
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setPreviewing(p)} title={t("Ver como será publicado")} className="min-w-[7rem]">
                    <Eye className="h-4 w-4 mr-1" /> {t("Prévia")}
                  </Button>
                  {p.status !== "posted" && !awaitingContainer && !posting && p.instagram_account_id && (
                    <Button size="sm" variant="outline" onClick={() => regenerateArtwork(p)} disabled={regeneratingId === p.id} title={t("Gerar novamente usando o template atual desta conta")}>
                      {regeneratingId === p.id ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Wand2 className="h-4 w-4 mr-1" />}
                      {t("Regenerar arte")}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => openEdit(p)} title={t("Editar")}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => remove(p.id)} title={t("Apagar")}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <PublicationPreviewDialog post={previewing} onClose={() => setPreviewing(null)} />

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Editar agendamento")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("Conta do Instagram")}</Label>
              <Select value={editAccount} onValueChange={setEditAccount}>
                <SelectTrigger><SelectValue placeholder={t("Selecione uma conta")} /></SelectTrigger>
                <SelectContent>
                  {accounts.map(a => <SelectItem key={a.id} value={a.id}>@{a.username}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("Data e hora")}</Label>
              <Input type="datetime-local" value={editWhen} onChange={(e) => setEditWhen(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>{t("Cancelar")}</Button>
            <Button onClick={saveEdit}>{t("Salvar")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PublicationPreviewDialog({ post, onClose }: { post: any | null; onClose: () => void }) {
  const { t } = useLanguage();
  if (!post) return null;

  const news = post.news_items || {};
  const mediaType = post.media_type === "reel" ? "reel" : post.media_type === "story" ? "story" : "feed";
  const managedReelVideo = mediaType === "reel"
    ? isManagedReelVideoUrl(news.generated_video_url, post.user_id, post.news_item_id, news.content_type)
    : false;
  const isVideo = (mediaType === "reel" && managedReelVideo) || (mediaType === "story" && !!news.generated_video_url);
  const mediaUrl = mediaType === "feed"
    ? news.generated_image_url || news.generated_cover_url
    : isVideo
      ? news.generated_video_url
      : news.generated_cover_url || news.generated_image_url;
  const caption = mediaType === "reel"
    ? news.reel_caption || news.caption || ""
    : news.caption || "";
  const formatLabel = mediaType === "reel" ? "Reel" : mediaType === "story" ? "Story" : "Feed";

  return (
    <Dialog open={!!post} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("Prévia da publicação")}</DialogTitle>
          <DialogDescription>
            {t("Mídia e texto que serão enviados para")} @{post.instagram_accounts?.username || t("conta não definida")}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
          <div className="rounded-xl border bg-black/95 p-2 flex items-center justify-center min-h-64">
            {mediaUrl ? (
              isVideo ? (
                <video src={mediaUrl} poster={news.generated_cover_url || news.generated_image_url || undefined} controls playsInline className="max-h-[68vh] w-auto max-w-full rounded-lg bg-black" />
              ) : (
                <img
                  src={mediaUrl}
                  alt={`${t("Prévia")} ${formatLabel}`}
                  className={`w-full rounded-lg object-contain ${mediaType === "feed" ? "aspect-square max-h-[68vh]" : "aspect-[9/16] max-h-[68vh]"}`}
                />
              )
            ) : (
              <div className="py-16 text-center text-sm text-white/70">
                {isVideo ? <Film className="h-10 w-10 mx-auto mb-3" /> : <ImageIcon className="h-10 w-10 mx-auto mb-3" />}
                {isVideo ? t("O vídeo ainda está sendo preparado.") : t("A arte ainda está sendo preparada.")}
              </div>
            )}
          </div>

          <div className="min-w-0 space-y-4">
            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold truncate">@{post.instagram_accounts?.username || t("conta não definida")}</p>
                  <p className="text-xs text-muted-foreground">{formatLabel} · {statusPreviewLabel(post.status, t)}</p>
                </div>
                <span className="rounded-full border px-2.5 py-1 text-xs font-medium">{formatLabel}</span>
              </div>
              <p className="mt-4 text-sm font-medium leading-snug">{news.rewritten_title || t("Sem título")}</p>
            </div>

            <div className="rounded-xl border bg-muted/20 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {mediaType === "story" ? t("Legenda no Story") : `${t("Legenda do")} ${formatLabel}`}
              </p>
              {mediaType === "story" ? (
                <p className="text-sm text-muted-foreground">{t("Stories não exibem legenda. Toda a informação visível precisa estar na própria arte.")}</p>
              ) : caption ? (
                <div className="max-h-[42vh] overflow-y-auto whitespace-pre-wrap pr-2 text-sm leading-relaxed">{caption}</div>
              ) : (
                <p className="text-sm text-amber-500">{t("Nenhuma legenda preparada para esta publicação.")}</p>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              {t("Esta prévia usa os arquivos finais armazenados. Alterações posteriores na arte ou legenda aparecerão ao atualizar a fila.")}
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function statusPreviewLabel(status: string, t: (source: string) => string) {
  if (status === "posted") return t("já publicado");
  if (status === "awaiting_container") return t("processando no Instagram");
  if (status === "posting") return t("em publicação");
  if (status === "failed") return t("falhou");
  return t("agendado");
}
