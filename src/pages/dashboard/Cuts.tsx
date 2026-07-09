import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Calendar, CheckCircle2, Clock, ExternalLink, Loader2, PlayCircle, RefreshCw, Scissors, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePlanUsage, isUnlimited } from "@/hooks/usePlanUsage";
import { formatCutTime, isSupportedYoutubeUrl, splitHashtags, videoCutRequestBounds } from "@/lib/videoCuts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type VideoCutClip = {
  id: string;
  job_id: string;
  instagram_account_id: string;
  clip_index: number;
  status: string;
  title?: string | null;
  hook?: string | null;
  caption?: string | null;
  hashtags?: string[] | string | null;
  hashtagsText?: string;
  reason?: string | null;
  start_seconds?: number | null;
  end_seconds?: number | null;
  video_url?: string | null;
  thumbnail_url?: string | null;
  news_item_id?: string | null;
};

type VideoCutJob = {
  id: string;
  user_id: string;
  instagram_account_id: string;
  youtube_url: string;
  source_kind?: string | null;
  source_title?: string | null;
  source_video_url?: string | null;
  source_file_name?: string | null;
  status: string;
  progress?: number | null;
  created_at: string;
  error_message?: string | null;
  fallback_required?: boolean | null;
  instagram_accounts?: { username?: string | null } | null;
  video_cut_clips?: VideoCutClip[];
};

type InstagramAccount = {
  id: string;
  username: string;
  active: boolean;
};

type SupabaseError = { message?: string } | null;
type SupabaseResult<T = unknown> = { data?: T; error?: SupabaseError };
type SupabaseQuery<T = unknown> = PromiseLike<SupabaseResult<T>> & {
  select: (columns?: string) => SupabaseQuery<T>;
  eq: (column: string, value: unknown) => SupabaseQuery<T>;
  order: (column: string, options?: { ascending?: boolean }) => SupabaseQuery<T>;
  limit: (count: number) => SupabaseQuery<T>;
  insert: (values: Record<string, unknown>) => SupabaseQuery<T>;
  update: (values: Record<string, unknown>) => SupabaseQuery<T>;
  delete: () => SupabaseQuery<T>;
  upsert: (values: Record<string, unknown>, options?: Record<string, unknown>) => SupabaseQuery<T>;
  single: () => SupabaseQuery<T>;
  maybeSingle: () => SupabaseQuery<T>;
};

type SupabaseFlex = {
  from: <T = unknown>(table: string) => SupabaseQuery<T>;
  rpc: <T = unknown>(fn: string, args?: Record<string, unknown>) => Promise<SupabaseResult<T>>;
};

const db = supabase as unknown as SupabaseFlex;
const JOB_REFRESH_MS = 15000;
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;
type BadgeVariant = "default" | "secondary" | "destructive" | "outline";
type InputMode = "youtube" | "upload";

function nextLocalDateTime(minutes = 30) {
  const date = new Date(Date.now() + minutes * 60 * 1000);
  date.setSeconds(0, 0);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    queued: "Na fila",
    analyzing: "Analisando",
    processing: "Gerando cortes",
    ready: "Pronto para revisão",
    failed: "Falhou",
    cancelled: "Cancelado",
    rendering: "Renderizando",
    draft: "Rascunho",
    approved: "Aprovado",
    scheduled: "Agendado",
    discarded: "Descartado",
  };
  return map[status] || status;
}

function statusVariant(status: string): BadgeVariant {
  if (["ready", "approved", "scheduled"].includes(status)) return "default";
  if (["failed", "cancelled", "discarded"].includes(status)) return "destructive";
  return "secondary";
}

function hashtagsToText(value?: string[] | string | null) {
  return splitHashtags(value).join(" ");
}

function humanVideoCutError(message?: string | null) {
  const text = String(message || "").trim();
  if (!text) return "";
  if (/sign in to confirm|not a bot|precondition check failed|yt-dlp|youtube said|unable to download api page/i.test(text)) {
    return "O YouTube bloqueou o acesso automático a esse vídeo. Envie o MP4 autorizado para gerar os cortes sem depender do YouTube.";
  }
  return text.length > 320 ? `${text.slice(0, 320)}...` : text;
}

function canDeleteJob(job: VideoCutJob) {
  return ["failed", "cancelled"].includes(job.status);
}

export default function Cuts() {
  const { user } = useAuth();
  const { usage, refetch: refetchUsage } = usePlanUsage();
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
  const [jobs, setJobs] = useState<VideoCutJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [inputMode, setInputMode] = useState<InputMode>("youtube");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [accountId, setAccountId] = useState("");
  const [requestedClips, setRequestedClips] = useState(1);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [format, setFormat] = useState<"reels" | "feed_square" | "feed_portrait">("reels");
  const [subtitleStyle, setSubtitleStyle] = useState<"none" | "classic" | "neon" | "karaoke">("classic");
  const [autoPublish, setAutoPublish] = useState(false);
  const [removeSilences, setRemoveSilences] = useState(true);
  const [zoomEffect, setZoomEffect] = useState(false);
  const [editingClip, setEditingClip] = useState<VideoCutClip | null>(null);
  const [scheduleClip, setScheduleClip] = useState<VideoCutClip | null>(null);
  const [scheduleWhen, setScheduleWhen] = useState(nextLocalDateTime());

  const bounds = useMemo(() => videoCutRequestBounds({
    used: usage?.cuts_used_today,
    reserved: usage?.cuts_reserved_today,
    limit: usage?.cuts_limit,
    maxPerJob: usage?.max_cuts_per_job,
  }), [usage]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: accountRows }, { data: jobRows, error }] = await Promise.all([
      supabase.from("instagram_accounts").select("id, username, active").eq("active", true).order("username"),
      db
        .from("video_cut_jobs")
        .select("*, instagram_accounts(username), video_cut_clips(*)")
        .order("created_at", { ascending: false })
        .limit(40),
    ]);
    setAccounts(accountRows || []);
    if (!accountId && accountRows?.[0]?.id) setAccountId(accountRows[0].id);
    if (error) toast.error(error.message || "Não foi possível carregar os cortes.");
    setJobs(((jobRows as VideoCutJob[] | undefined) || []).map((job) => ({
      ...job,
      video_cut_clips: (job.video_cut_clips || []).slice().sort((a, b) => a.clip_index - b.clip_index),
    })));
    setLoading(false);
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, JOB_REFRESH_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (requestedClips > bounds.maxRequest) setRequestedClips(Math.max(1, bounds.maxRequest || 1));
  }, [bounds.maxRequest, requestedClips]);

  const uploadVideoFile = async () => {
    if (!user) throw new Error("Sessão expirada.");
    if (!videoFile) throw new Error("Escolha um arquivo MP4.");
    const isMp4 = videoFile.type === "video/mp4" || /\.mp4$/i.test(videoFile.name);
    if (!isMp4) throw new Error("Envie um arquivo MP4.");
    if (videoFile.size > MAX_UPLOAD_BYTES) throw new Error("O arquivo precisa ter até 1 GB para este beta.");

    const safeName = videoFile.name.replace(/[^a-z0-9._-]+/gi, "-").slice(-120);
    const path = `${user.id}/cuts/uploads/${Date.now()}-${safeName || "video.mp4"}`;
    const { error: uploadError } = await supabase.storage.from("post-images").upload(path, videoFile, {
      contentType: "video/mp4",
      upsert: false,
    });
    if (uploadError) throw new Error(uploadError.message || "Não foi possível enviar o vídeo.");
    const { data } = supabase.storage.from("post-images").getPublicUrl(path);
    return data.publicUrl;
  };

  const createJob = async () => {
    if (inputMode === "youtube" && !isSupportedYoutubeUrl(youtubeUrl)) return toast.error("Cole um link público válido do YouTube.");
    if (inputMode === "upload" && !videoFile) return toast.error("Escolha um arquivo MP4 autorizado.");
    if (!accountId) return toast.error("Escolha uma conta do Instagram.");
    if (!rightsConfirmed) return toast.error("Confirme que você tem direito/autorização sobre o vídeo.");
    if (bounds.maxRequest <= 0) return toast.error("Seu limite de Cortes IA para hoje acabou.");

    setCreating(true);
    try {
      const requestClips = Math.min(requestedClips, bounds.maxRequest);
      if (inputMode === "upload") {
        const videoUrl = await uploadVideoFile();
        const { error } = await db.rpc("create_video_cut_upload_job", {
          _instagram_account_id: accountId,
          _video_url: videoUrl,
          _requested_clips: requestClips,
          _rights_confirmed: rightsConfirmed,
          _source_title: videoFile?.name || "Vídeo enviado",
          _format: format,
          _subtitle_style: subtitleStyle,
          _auto_publish: autoPublish,
          _remove_silences: removeSilences,
          _zoom_effect: zoomEffect,
        });
        if (error) throw new Error(error.message || "Não foi possível criar o job.");
      } else {
        const { error } = await db.rpc("create_video_cut_job", {
          _instagram_account_id: accountId,
          _youtube_url: youtubeUrl.trim(),
          _requested_clips: requestClips,
          _rights_confirmed: rightsConfirmed,
          _format: format,
          _subtitle_style: subtitleStyle,
          _auto_publish: autoPublish,
          _remove_silences: removeSilences,
          _zoom_effect: zoomEffect,
        });
        if (error) throw new Error(error.message || "Não foi possível criar o job.");
      }
      toast.success("Corte enviado para análise. Ele aparecerá como rascunho para revisão.");
      setYoutubeUrl("");
      setVideoFile(null);
      setRightsConfirmed(false);
      await Promise.all([load(), refetchUsage()]);
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Não foi possível criar o job.");
    } finally {
      setCreating(false);
    }
  };

  const ensureNewsItemForClip = async (clip: VideoCutClip, job: VideoCutJob) => {
    if (!user) throw new Error("Sessão expirada.");
    if (!clip.video_url) throw new Error("Este corte ainda não tem vídeo pronto.");
    const title = clip.title || "Corte IA";
    const caption = clip.caption || clip.hook || title;
    const hashtags = Array.isArray(clip.hashtags) ? clip.hashtags : splitHashtags(clip.hashtags);
    const newsId = clip.news_item_id || clip.id;
    const payload = {
      id: newsId,
      user_id: user.id,
      instagram_account_id: clip.instagram_account_id || job.instagram_account_id,
      source_name: "Cortes IA",
      original_title: title,
      original_content: clip.reason || clip.hook || caption,
      original_url: `${job.youtube_url}#cut-${clip.clip_index}-${clip.id}`,
      original_image_url: clip.thumbnail_url,
      published_at: new Date().toISOString(),
      niche: "video",
      status: "processed",
      rewritten_title: title,
      rewritten_summary: clip.hook || clip.reason || title,
      caption,
      reel_caption: caption,
      hashtags,
      generated_image_url: clip.thumbnail_url,
      generated_cover_url: clip.thumbnail_url,
      generated_video_url: clip.video_url,
      content_type: "video_cut",
      content_format: "reel",
      editorial_ready: true,
      error_message: null,
    };
    const { error } = await db.from("news_items").upsert(payload, { onConflict: "id" });
    if (error) throw error;
    await db.from("video_cut_clips").update({ news_item_id: newsId, status: "approved" }).eq("id", clip.id);
    return newsId;
  };

  const approveClip = async (clip: VideoCutClip, job: VideoCutJob) => {
    try {
      await ensureNewsItemForClip(clip, job);
      toast.success("Corte aprovado. Agora ele pode ser agendado como Reel.");
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Não foi possível aprovar.");
    }
  };

  const discardClip = async (clip: VideoCutClip) => {
    const { error } = await db.from("video_cut_clips").update({ status: "discarded" }).eq("id", clip.id);
    if (error) return toast.error(error.message);
    toast.success("Corte descartado.");
    await load();
  };

  const deleteJobDirectly = async (job: VideoCutJob) => {
    const { data, error } = await db
      .from<{ id: string }>("video_cut_jobs")
      .delete()
      .eq("id", job.id)
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message || "Não foi possível excluir o trabalho.");
    return Boolean(data?.id);
  };

  const deleteJob = async (job: VideoCutJob) => {
    if (!canDeleteJob(job)) return toast.error("Só é possível excluir trabalhos que falharam ou foram cancelados.");
    const confirmed = window.confirm("Excluir este trabalho com erro? Essa ação não apaga os outros trabalhos.");
    if (!confirmed) return;

    try {
      const { data, error } = await db.rpc<boolean>("delete_video_cut_job", { _job_id: job.id });
      const missingRpc = /delete_video_cut_job|schema cache|could not find the function/i.test(error?.message || "");
      const deleted = error && missingRpc ? await deleteJobDirectly(job) : data === true;

      if (error && !missingRpc) throw new Error(error.message || "Não foi possível excluir o trabalho.");
      if (!deleted) return toast.error("Não consegui confirmar a exclusão. Atualize a página e tente novamente.");

      toast.success("Trabalho excluído.");
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir o trabalho.");
    }
  };

  const saveClipEdit = async () => {
    if (!editingClip) return;
    const hashtags = splitHashtags(editingClip.hashtagsText);
    const payload = {
      title: editingClip.title,
      caption: editingClip.caption,
      hook: editingClip.hook,
      hashtags,
    };
    const { error } = await db.from("video_cut_clips").update(payload).eq("id", editingClip.id);
    if (error) return toast.error(error.message);
    if (editingClip.news_item_id) {
      await db.from("news_items").update({
        rewritten_title: payload.title,
        caption: payload.caption,
        reel_caption: payload.caption,
        hashtags,
      }).eq("id", editingClip.news_item_id);
    }
    setEditingClip(null);
    toast.success("Legenda atualizada.");
    await load();
  };

  const openSchedule = (clip: VideoCutClip) => {
    setScheduleClip(clip);
    setScheduleWhen(nextLocalDateTime());
  };

  const scheduleSelectedClip = async () => {
    if (!scheduleClip || !scheduleWhen) return;
    const job = jobs.find((row) => row.id === scheduleClip.job_id);
    if (!job) return toast.error("Job não encontrado.");
    try {
      const newsItemId = await ensureNewsItemForClip(scheduleClip, job);
      const { data, error } = await db.from<{ id: string }>("scheduled_posts").insert({
        user_id: user?.id,
        news_item_id: newsItemId,
        instagram_account_id: scheduleClip.instagram_account_id || job.instagram_account_id,
        scheduled_for: new Date(scheduleWhen).toISOString(),
        status: "scheduled",
        media_type: "reel",
      }).select("id").single();
      if (error) throw error;
      if (!data?.id) throw new Error("Agendamento não retornou confirmação.");
      await db.from("video_cut_clips").update({ status: "scheduled", scheduled_post_id: data.id }).eq("id", scheduleClip.id);
      await db.from("news_items").update({ status: "scheduled" }).eq("id", newsItemId);
      setScheduleClip(null);
      toast.success("Corte agendado como Reel.");
      await load();
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : "Não foi possível agendar.");
    }
  };

  const limitText = isUnlimited(bounds.limit)
    ? `${bounds.total}/∞ usados ou reservados hoje`
    : `${bounds.total}/${bounds.limit} usados ou reservados hoje`;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-primary mb-2">
            <Scissors className="h-5 w-5" />
            <span className="text-sm font-medium">Beta interno</span>
          </div>
          <h1 className="text-4xl font-bold">Cortes IA</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Cole um link autorizado do YouTube ou envie um MP4, gere até 5 cortes por vídeo e revise tudo antes de agendar no Instagram.
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Atualizar
        </Button>
      </div>

      <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-4">
        <Card className="p-5 space-y-4">
          <div>
            <h2 className="font-semibold text-lg">Criar novo corte</h2>
            <p className="text-sm text-muted-foreground">O resultado entra como rascunho, sem publicação automática.</p>
          </div>
          <div className="grid grid-cols-2 rounded-xl border border-border bg-muted/20 p-1">
            <button
              type="button"
              onClick={() => setInputMode("youtube")}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${inputMode === "youtube" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Link do YouTube
            </button>
            <button
              type="button"
              onClick={() => setInputMode("upload")}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${inputMode === "upload" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              Enviar MP4
            </button>
          </div>
          <div className="grid md:grid-cols-[1fr_220px] gap-3">
            <div className="space-y-2">
              {inputMode === "youtube" ? (
                <>
                  <Label>Link do YouTube</Label>
                  <Input value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
                </>
              ) : (
                <>
                  <Label>Arquivo MP4 autorizado</Label>
                  <Input
                    type="file"
                    accept="video/mp4,.mp4"
                    onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Use quando o YouTube bloquear o link. Limite beta: até 1 GB.
                  </p>
                </>
              )}
            </div>
            <div className="space-y-2">
              <Label>Conta Instagram</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger><SelectValue placeholder="Escolha a conta" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => <SelectItem key={account.id} value={account.id}>@{account.username}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid md:grid-cols-[180px_220px_1fr] gap-3 items-end">
            <div className="space-y-2">
              <Label>Quantidade</Label>
              <Input
                type="number"
                min={1}
                max={Math.max(1, bounds.maxRequest || 1)}
                value={requestedClips}
                onChange={(e) => setRequestedClips(Math.max(1, Math.min(Number(e.target.value) || 1, Math.max(1, bounds.maxRequest || 1))))}
              />
            </div>
            <div className="space-y-2">
              <Label>Formato</Label>
              <Select value={format} onValueChange={(v) => setFormat(v as typeof format)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="reels">Reels / Stories · 9:16</SelectItem>
                  <SelectItem value="feed_square">Feed quadrado · 1:1</SelectItem>
                  <SelectItem value="feed_portrait">Feed vertical · 4:5</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Estilo da legenda</Label>
              <Select value={subtitleStyle} onValueChange={(v) => setSubtitleStyle(v as typeof subtitleStyle)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="classic">Clássica · branco/preto</SelectItem>
                  <SelectItem value="neon">Neon · amarelo destacando</SelectItem>
                  <SelectItem value="karaoke">Karaokê · verde progressivo</SelectItem>
                  <SelectItem value="none">Sem legenda</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-xl border border-border p-3 text-sm text-muted-foreground">
              <p><span className="text-foreground font-medium">{limitText}</span></p>
              <p>Máximo por vídeo: {bounds.maxPerJob || 0}. Duração máxima por link: {usage?.max_cut_video_minutes || 60} minutos.</p>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm cursor-pointer">
              <Checkbox checked={removeSilences} onCheckedChange={(c) => setRemoveSilences(c === true)} />
              <span>
                <span className="font-medium text-foreground">Aperto de ritmo</span>
                <span className="block text-xs text-muted-foreground">Remove pausas mortas maiores que 0,7s.</span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm cursor-pointer">
              <Checkbox checked={zoomEffect} onCheckedChange={(c) => setZoomEffect(c === true)} />
              <span>
                <span className="font-medium text-foreground">Zoom sutil</span>
                <span className="block text-xs text-muted-foreground">Efeito Ken Burns (+5% ao longo do corte).</span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm cursor-pointer">
              <Checkbox checked={autoPublish} onCheckedChange={(c) => setAutoPublish(c === true)} />
              <span>
                <span className="font-medium text-foreground">Auto-publicar no Instagram</span>
                <span className="block text-xs text-muted-foreground">Agenda para +10min sem revisão manual.</span>
              </span>
            </label>
          </div>
          <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm">
            <Checkbox checked={rightsConfirmed} onCheckedChange={(checked) => setRightsConfirmed(checked === true)} />
            <span>Confirmo que tenho direito/autorização para usar este vídeo e gerar cortes para publicação.</span>
          </label>
          <Button onClick={createJob} disabled={creating || bounds.maxRequest <= 0} className="w-full md:w-auto">
            {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : inputMode === "upload" ? <Upload className="h-4 w-4 mr-2" /> : <Scissors className="h-4 w-4 mr-2" />}
            Gerar cortes para revisão
          </Button>
        </Card>

        <Card className="p-5 space-y-4">
          <h2 className="font-semibold text-lg">Como funciona</h2>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p><span className="text-foreground font-medium">1.</span> A IA encontra trechos com gancho, contexto e potencial.</p>
            <p><span className="text-foreground font-medium">2.</span> Se o YouTube bloquear, envie o MP4 autorizado e o worker processa pelo arquivo.</p>
            <p><span className="text-foreground font-medium">3.</span> Você revisa, edita legenda e agenda. Nada é publicado sozinho.</p>
          </div>
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold">Trabalhos recentes</h2>
          <span className="text-sm text-muted-foreground">{jobs.length} job(s)</span>
        </div>
        {loading ? (
          <Card className="p-8 text-center text-muted-foreground">Carregando cortes...</Card>
        ) : jobs.length === 0 ? (
          <Card className="p-10 text-center text-muted-foreground">
            <PlayCircle className="h-10 w-10 mx-auto mb-3 opacity-60" />
            Nenhum corte criado ainda.
          </Card>
        ) : jobs.map((job) => (
          <Card key={job.id} className="p-5 space-y-4">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={statusVariant(job.status)}>{statusLabel(job.status)}</Badge>
                  <span className="text-sm text-muted-foreground">@{job.instagram_accounts?.username || "conta"}</span>
                  <a className="text-sm text-primary inline-flex items-center gap-1" href={job.source_video_url || job.youtube_url} target="_blank" rel="noreferrer">
                    {job.source_kind === "upload" ? "MP4 enviado" : "YouTube"} <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <p className="text-sm text-muted-foreground mt-2 truncate">
                  {job.source_title || job.source_file_name || job.source_video_url || job.youtube_url}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 md:justify-end">
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  {new Date(job.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                </div>
                {canDeleteJob(job) && (
                  <Button size="sm" variant="outline" onClick={() => deleteJob(job)}>
                    <Trash2 className="h-4 w-4 mr-1" /> Excluir
                  </Button>
                )}
              </div>
            </div>
            <Progress value={job.progress || 0} />
            {job.error_message && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {humanVideoCutError(job.error_message)}
                {job.fallback_required && <p className="mt-1 text-muted-foreground">Crie um novo corte usando a opção Enviar MP4.</p>}
              </div>
            )}

            {(job.video_cut_clips?.length ?? 0) > 0 && (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {job.video_cut_clips!.map((clip) => (
                  <Card key={clip.id} className="overflow-hidden border-border/80">
                    <div className="aspect-[9/16] bg-black">
                      {clip.video_url ? (
                        <video className="h-full w-full object-contain" src={clip.video_url} poster={clip.thumbnail_url || undefined} controls playsInline />
                      ) : (
                        <div className="h-full grid place-items-center text-sm text-muted-foreground">Vídeo em geração</div>
                      )}
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant={statusVariant(clip.status)}>{statusLabel(clip.status)}</Badge>
                        <span className="text-xs text-muted-foreground">{formatCutTime(clip.start_seconds)} - {formatCutTime(clip.end_seconds)}</span>
                      </div>
                      <div>
                        <h3 className="font-semibold line-clamp-2">{clip.title || `Corte ${clip.clip_index}`}</h3>
                        <p className="text-sm text-muted-foreground line-clamp-3 mt-1">{clip.hook || clip.reason || clip.caption}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => setEditingClip({ ...clip, hashtagsText: hashtagsToText(clip.hashtags) })}>
                          Editar legenda
                        </Button>
                        <Button size="sm" onClick={() => approveClip(clip, job)} disabled={!clip.video_url || clip.status === "scheduled"}>
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Aprovar
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => openSchedule(clip)} disabled={!clip.video_url || clip.status === "discarded"}>
                          <Calendar className="h-4 w-4 mr-1" /> Agendar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => discardClip(clip)} disabled={clip.status === "scheduled"}>
                          <Trash2 className="h-4 w-4 mr-1" /> Descartar
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>

      <Dialog open={!!editingClip} onOpenChange={(open) => !open && setEditingClip(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar legenda do corte</DialogTitle>
            <DialogDescription>Essas informações serão usadas quando o corte virar Reel agendado.</DialogDescription>
          </DialogHeader>
          {editingClip && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Título</Label>
                <Input value={editingClip.title || ""} onChange={(e) => setEditingClip({ ...editingClip, title: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Gancho</Label>
                <Input value={editingClip.hook || ""} onChange={(e) => setEditingClip({ ...editingClip, hook: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Legenda</Label>
                <Textarea rows={7} value={editingClip.caption || ""} onChange={(e) => setEditingClip({ ...editingClip, caption: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Hashtags</Label>
                <Input value={editingClip.hashtagsText || ""} onChange={(e) => setEditingClip({ ...editingClip, hashtagsText: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingClip(null)}>Cancelar</Button>
            <Button onClick={saveClipEdit}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!scheduleClip} onOpenChange={(open) => !open && setScheduleClip(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agendar corte como Reel</DialogTitle>
            <DialogDescription>O corte aprovado entra na fila normal de publicação.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Data e horário</Label>
            <Input type="datetime-local" value={scheduleWhen} onChange={(e) => setScheduleWhen(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScheduleClip(null)}>Cancelar</Button>
            <Button onClick={scheduleSelectedClip}>Agendar Reel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
