import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, Loader2, PlayCircle, RefreshCw, Scissors, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePlanUsage, isUnlimited } from "@/hooks/usePlanUsage";
import { formatCutTime, isSupportedYoutubeUrl, splitHashtags, videoCutRequestBounds, viralBadgeTone, viralBadgeLabel, CUT_FORMAT_OPTIONS } from "@/lib/videoCuts";
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

type CutFormat = "reels" | "feed_square" | "feed_portrait";

type VideoCutClip = {
  id: string;
  job_id: string;
  instagram_account_id: string;
  clip_index: number;
  status: string;
  title?: string | null;
  hook?: string | null;
  hook_text?: string | null;
  caption?: string | null;
  hashtags?: string[] | string | null;
  hashtagsText?: string;
  reason?: string | null;
  start_seconds?: number | null;
  end_seconds?: number | null;
  video_url?: string | null;
  thumbnail_url?: string | null;
  news_item_id?: string | null;
  format?: CutFormat | string | null;
  viral_score?: number | null;
  hook_score?: number | null;
  emotion_score?: number | null;
  clarity_score?: number | null;
  subtitle_error?: boolean | null;
};

type VideoCutJob = {
  id: string;
  user_id: string;
  instagram_account_id: string;
  youtube_url: string;
  source_kind?: string | null;
  source_title?: string | null;
  source_video_url?: string | null;
  source_storage_bucket?: string | null;
  source_storage_path?: string | null;
  source_file_name?: string | null;
  analysis_mode?: string | null;
  analysis_warning?: string | null;
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

type WorkerHealth = {
  queue_mode: string;
  last_seen_at: string;
  healthy: boolean;
  version?: string | null;
};

type SupabaseError = { message?: string } | null;
type SupabaseResult<T = unknown> = { data?: T; error?: SupabaseError };
type SupabaseQuery<T = unknown> = PromiseLike<SupabaseResult<T>> & {
  select: (columns?: string) => SupabaseQuery<T>;
  eq: (column: string, value: unknown) => SupabaseQuery<T>;
  in: (column: string, values: unknown[]) => SupabaseQuery<T>;
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
const VIDEO_WATCH_GRACE_MS = 5 * 60 * 1000;
type BadgeVariant = "default" | "secondary" | "destructive" | "outline";
type InputMode = "youtube" | "upload";

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

function databaseErrorMessage(error: unknown, fallback: string) {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const message = typeof record.message === "string" ? record.message : "";
  const details = typeof record.details === "string" ? record.details : "";
  const text = `${record.code || ""} ${message} ${details}`.toLowerCase();
  if (text.includes("idx_scheduled_posts_unique_active_news_per_ig") || text.includes("duplicate key")) {
    return "Este corte já possui um agendamento ativo para esta conta.";
  }
  if (text.includes("row-level security") || text.includes("permission denied")) {
    return "Sua sessão não tem permissão para agendar nesta conta. Atualize a página e entre novamente.";
  }
  return message || fallback;
}

function canDeleteJob(job: VideoCutJob) {
  return ["failed", "cancelled", "ready", "discarded"].includes(job.status);
}

function isJobActive(job: VideoCutJob) {
  return !["failed", "cancelled", "ready", "discarded"].includes(job.status);
}

function hasRecentVideoActivity() {
  const now = Date.now();
  return Array.from(document.querySelectorAll("video")).some((video) => {
    const lastActivity = Number(video.dataset.lastActivity || 0);
    const userTouchedVideoRecently = now - lastActivity < VIDEO_WATCH_GRACE_MS;
    const videoIsInUse = !video.ended && (userTouchedVideoRecently || !video.paused || video.currentTime > 0);
    return videoIsInUse;
  });
}

export default function Cuts() {
  const { user } = useAuth();
  const { usage, refetch: refetchUsage } = usePlanUsage();
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
  const [jobs, setJobs] = useState<VideoCutJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [workerHealth, setWorkerHealth] = useState<WorkerHealth[]>([]);
  const [inputMode, setInputMode] = useState<InputMode>("youtube");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [accountId, setAccountId] = useState("");
  const [requestedClips, setRequestedClips] = useState(1);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [formats, setFormats] = useState<CutFormat[]>(["reels"]);
  const [subtitleStyle, setSubtitleStyle] = useState<"none" | "classic" | "neon" | "karaoke">("classic");
  const [hookEnabled, setHookEnabled] = useState(true);
  const [autoPublish, setAutoPublish] = useState(false);
  const [removeSilences, setRemoveSilences] = useState(true);
  const [zoomEffect, setZoomEffect] = useState(false);
  const [editingClip, setEditingClip] = useState<VideoCutClip | null>(null);

  const toggleFormat = (value: CutFormat, checked: boolean) => {
    setFormats((prev) => {
      if (checked) return prev.includes(value) ? prev : [...prev, value];
      return prev.length > 1 ? prev.filter((f) => f !== value) : prev;
    });
  };

  const bounds = useMemo(() => videoCutRequestBounds({
    used: usage?.cuts_used_today,
    reserved: usage?.cuts_reserved_today,
    limit: usage?.cuts_limit,
    maxPerJob: usage?.max_cuts_per_job,
    formatsCount: formats.length,
  }), [usage, formats.length]);

  const load = async (options: { silent?: boolean } = {}) => {
    if (!user) return;
    if (!options.silent) setLoading(true);
    const { data: accountRows, error: accountsError } = await supabase
      .from("instagram_accounts")
      .select("id, username, active")
      .eq("user_id", user.id)
      .eq("active", true)
      .order("username");

    const availableAccounts = accountRows || [];
    const selectedAccountId = availableAccounts.some((account) => account.id === accountId)
      ? accountId
      : availableAccounts[0]?.id || "";

    setAccounts(availableAccounts);
    if (selectedAccountId !== accountId) setAccountId(selectedAccountId);

    if (accountsError) {
      toast.error(accountsError.message || "Não foi possível carregar as contas do Instagram.");
    }

    const jobsQuery = db
      .from("video_cut_jobs")
      .select("*, instagram_accounts(username), video_cut_clips(*)")
      .eq("user_id", user.id);

    if (selectedAccountId) jobsQuery.eq("instagram_account_id", selectedAccountId);

    const [{ data: jobRows, error }, healthResult] = await Promise.all([
      selectedAccountId
        ? jobsQuery
        .order("created_at", { ascending: false })
        .limit(40)
        : Promise.resolve({ data: [], error: null }),
      db.rpc<WorkerHealth[]>("get_media_worker_health"),
    ]);
    if (error) toast.error(error.message || "Não foi possível carregar os cortes.");
    setWorkerHealth((healthResult.data as WorkerHealth[] | undefined) || []);
    const nextJobs = ((jobRows as VideoCutJob[] | undefined) || []).map((job) => ({
      ...job,
      video_cut_clips: (job.video_cut_clips || []).slice().sort((a, b) => a.clip_index - b.clip_index),
    }));
    setJobs((prev) => {
      // Evita re-render (que recarrega o <video> e interrompe a reprodução) quando nada mudou
      try {
        if (JSON.stringify(prev) === JSON.stringify(nextJobs)) return prev;
      } catch {
        // A comparação é apenas uma otimização; uma estrutura não serializável pode renderizar normalmente.
      }
      return nextJobs;
    });
    if (!options.silent) setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, accountId]);

  const hasActiveJobs = useMemo(() => jobs.some(isJobActive), [jobs]);

  useEffect(() => {
    if (!user || !hasActiveJobs) return;
    const interval = setInterval(() => {
      // Não atualiza enquanto o usuário está assistindo/interagindo com um vídeo — evita reiniciar a reprodução
      if (hasRecentVideoActivity()) return;
      load({ silent: true });
    }, JOB_REFRESH_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, accountId, hasActiveJobs]);

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
    const { error: uploadError } = await supabase.storage.from("video-cut-inputs").upload(path, videoFile, {
      contentType: "video/mp4",
      upsert: false,
    });
    if (uploadError) throw new Error(uploadError.message || "Não foi possível enviar o vídeo.");
    return path;
  };

  const createJob = async () => {
    if (inputMode === "youtube" && !isSupportedYoutubeUrl(youtubeUrl)) return toast.error("Cole um link público válido do YouTube.");
    if (inputMode === "upload" && !videoFile) return toast.error("Escolha um arquivo MP4 autorizado.");
    if (!accountId) return toast.error("Escolha uma conta do Instagram.");
    if (!rightsConfirmed) return toast.error("Confirme que você tem direito/autorização sobre o vídeo.");
    if (bounds.maxRequest <= 0) return toast.error("Seu limite de Cortes IA para hoje acabou.");

    setCreating(true);
    let uploadedPath: string | null = null;
    try {
      const requestClips = Math.min(requestedClips, bounds.maxRequest);
      if (inputMode === "upload") {
        uploadedPath = await uploadVideoFile();
        const { error } = await db.rpc("create_video_cut_upload_job_v2", {
          _instagram_account_id: accountId,
          _storage_path: uploadedPath,
          _requested_clips: requestClips,
          _rights_confirmed: rightsConfirmed,
          _source_title: videoFile?.name || "Vídeo enviado",
          _format: formats[0],
          _formats: formats,
          _subtitle_style: subtitleStyle,
          _hook_enabled: hookEnabled,
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
          _format: formats[0],
          _formats: formats,
          _subtitle_style: subtitleStyle,
          _hook_enabled: hookEnabled,
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
      if (uploadedPath) await supabase.storage.from("video-cut-inputs").remove([uploadedPath]);
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
    const originalUrl = job.source_kind === "upload"
      ? `upload://${job.id}/cut-${clip.clip_index}-${clip.id}`
      : `${job.youtube_url}#cut-${clip.clip_index}-${clip.id}`;
    const { data: existingNews, error: existingNewsError } = await db
      .from<{ id: string }>("news_items")
      .select("id")
      .eq("user_id", user.id)
      .eq("original_url", originalUrl)
      .limit(1)
      .maybeSingle();
    if (existingNewsError) throw existingNewsError;

    let newsId = existingNews?.id || clip.news_item_id || "";
    const updatePayload = {
      instagram_account_id: clip.instagram_account_id || job.instagram_account_id,
      source_name: "Cortes IA",
      original_title: title,
      original_content: clip.reason || clip.hook || caption,
      original_url: originalUrl,
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

    let error: SupabaseError | undefined;
    if (newsId) {
      ({ error } = await db.from("news_items").update(updatePayload).eq("id", newsId));
    } else {
      newsId = clip.id;
      ({ error } = await db.from("news_items").insert({
        ...updatePayload,
        id: newsId,
        user_id: user.id,
      }));
    }

    if (error) {
      const duplicateId = String(error.message || "")
        .match(/duplicate_news_item_(?:url|title):([0-9a-f-]{36})/i)?.[1];
      if (!duplicateId) throw error;
      newsId = duplicateId;
      ({ error } = await db.from("news_items").update(updatePayload).eq("id", newsId));
      if (error) throw error;
    }
    const { error: clipError } = await db
      .from("video_cut_clips")
      .update({ news_item_id: newsId, status: "approved" })
      .eq("id", clip.id);
    if (clipError) throw clipError;
    return newsId;
  };

  const getAutomaticScheduleDate = async (instagramAccountId: string) => {
    if (!user) throw new Error("Sessão expirada.");
    const [{ data: settings }, { data: channel }, { data: lastPost, error: lastPostError }] = await Promise.all([
      db.from<{ min_post_interval_minutes?: number }>("user_settings")
        .select("min_post_interval_minutes").eq("user_id", user.id).maybeSingle(),
      db.from<{ min_interval_minutes?: number }>("channel_settings")
        .select("min_interval_minutes").eq("user_id", user.id).eq("channel", "reel").maybeSingle(),
      db.from<{ scheduled_for: string }>("scheduled_posts")
        .select("scheduled_for")
        .eq("user_id", user.id)
        .eq("instagram_account_id", instagramAccountId)
        .in("status", ["scheduled", "posting", "awaiting_container"])
        .order("scheduled_for", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (lastPostError) throw lastPostError;
    const intervalMinutes = Math.max(
      10,
      Number(settings?.min_post_interval_minutes) || 10,
      Number(channel?.min_interval_minutes) || 10,
    );
    const earliest = Date.now() + intervalMinutes * 60_000;
    const afterLastPost = lastPost?.scheduled_for
      ? new Date(lastPost.scheduled_for).getTime() + intervalMinutes * 60_000
      : 0;
    return new Date(Math.max(earliest, afterLastPost));
  };

  const scheduleClipAt = async (clip: VideoCutClip, job: VideoCutJob, scheduledDate: Date) => {
    if (!user) throw new Error("Sessão expirada. Entre novamente.");
    const newsItemId = await ensureNewsItemForClip(clip, job);
    const instagramAccountId = clip.instagram_account_id || job.instagram_account_id;
    const { data: existing, error: existingError } = await db
      .from<{ id: string; status: string }>("scheduled_posts")
      .select("id, status")
      .eq("user_id", user.id)
      .eq("news_item_id", newsItemId)
      .eq("instagram_account_id", instagramAccountId)
      .in("status", ["scheduled", "posting", "awaiting_container"])
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.status === "posting" || existing?.status === "awaiting_container") {
      throw new Error("Este corte já está sendo processado para publicação no Instagram.");
    }

    let scheduledPostId = existing?.id;
    if (scheduledPostId) {
      const { error } = await db.from("scheduled_posts")
        .update({ scheduled_for: scheduledDate.toISOString(), media_type: "reel", error_message: null })
        .eq("id", scheduledPostId);
      if (error) throw error;
    } else {
      const { data, error } = await db.from<{ id: string }>("scheduled_posts").insert({
        user_id: user.id,
        news_item_id: newsItemId,
        instagram_account_id: instagramAccountId,
        scheduled_for: scheduledDate.toISOString(),
        status: "scheduled",
        media_type: "reel",
      }).select("id").single();
      if (error) throw error;
      if (!data?.id) throw new Error("Agendamento não retornou confirmação.");
      scheduledPostId = data.id;
    }

    const { error: clipUpdateError } = await db.from("video_cut_clips")
      .update({ status: "scheduled", scheduled_post_id: scheduledPostId }).eq("id", clip.id);
    if (clipUpdateError) throw clipUpdateError;
    const { error: newsUpdateError } = await db.from("news_items")
      .update({ status: "scheduled" }).eq("id", newsItemId);
    if (newsUpdateError) throw newsUpdateError;
    return { existed: Boolean(existing), scheduledDate };
  };

  const approveClip = async (clip: VideoCutClip, job: VideoCutJob) => {
    try {
      const instagramAccountId = clip.instagram_account_id || job.instagram_account_id;
      const scheduledDate = await getAutomaticScheduleDate(instagramAccountId);
      const result = await scheduleClipAt(clip, job, scheduledDate);
      toast.success(`${result.existed ? "Agendamento atualizado" : "Corte aprovado e agendado"} para ${scheduledDate.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`);
      await load();
    } catch (error: unknown) {
      toast.error(databaseErrorMessage(error, "Não foi possível aprovar e agendar."));
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

  const limitText = isUnlimited(bounds.limit)
    ? `${bounds.total}/∞ usados ou reservados hoje`
    : `${bounds.total}/${bounds.limit} usados ou reservados hoje`;
  const cutsWorkerOnline = workerHealth.some((worker) => worker.healthy && (worker.queue_mode.includes("cuts") || worker.queue_mode.includes("all")));

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
        <Button variant="outline" onClick={() => load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Atualizar
        </Button>
      </div>

      {workerHealth.length > 0 && !cutsWorkerOnline && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="font-medium text-foreground">Processador de Cortes IA indisponível</p>
            <p className="text-muted-foreground">A fila não respondeu nos últimos 90 segundos. Novos trabalhos ficarão aguardando até o worker voltar.</p>
          </div>
        </div>
      )}

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
          <div className="grid md:grid-cols-[180px_1fr] gap-3 items-start">
            <div className="space-y-2">
              <Label>Quantidade</Label>
              <Input
                type="number"
                min={1}
                max={Math.max(1, bounds.maxRequest || 1)}
                value={requestedClips}
                onChange={(e) => setRequestedClips(Math.max(1, Math.min(Number(e.target.value) || 1, Math.max(1, bounds.maxRequest || 1))))}
              />
              <p className="text-xs text-muted-foreground">Cada formato conta 1 crédito por corte.</p>
            </div>
            <div className="space-y-2">
              <Label>Formatos de saída (1 ou mais)</Label>
              <div className="grid sm:grid-cols-3 gap-2">
                {CUT_FORMAT_OPTIONS.map((opt) => {
                  const checked = formats.includes(opt.value);
                  return (
                    <label
                      key={opt.value}
                      className={`flex items-start gap-2 rounded-lg border p-2 text-sm cursor-pointer transition ${checked ? "border-primary bg-primary/5" : "border-border"}`}
                    >
                      <Checkbox checked={checked} onCheckedChange={(c) => toggleFormat(opt.value, c === true)} />
                      <span>
                        <span className="font-medium text-foreground block">{opt.label}</span>
                        <span className="text-xs text-muted-foreground">{opt.description}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="grid md:grid-cols-2 gap-3">
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
              <p>Máximo por vídeo: {bounds.maxPerJob || 0} · Cada corte × {formats.length} formato(s) = {formats.length} crédito(s). Duração máxima: {usage?.max_cut_video_minutes || 60} min.</p>
            </div>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3">
            <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm cursor-pointer">
              <Checkbox checked={hookEnabled} onCheckedChange={(c) => setHookEnabled(c === true)} />
              <span>
                <span className="font-medium text-foreground">Hook chamativo</span>
                <span className="block text-xs text-muted-foreground">Texto grande gerado pela IA nos primeiros 3s.</span>
              </span>
            </label>
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
                  {job.source_kind === "upload" ? (
                    <span className="text-sm text-muted-foreground inline-flex items-center gap-1"><Upload className="h-3 w-3" /> MP4 privado</span>
                  ) : (
                    <a className="text-sm text-primary inline-flex items-center gap-1" href={job.youtube_url} target="_blank" rel="noreferrer">
                      YouTube <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {job.analysis_mode === "transcript_ai" && <Badge variant="outline">Análise pela fala</Badge>}
                  {job.analysis_mode === "timeline_fallback" && <Badge variant="secondary">Modo básico</Badge>}
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
            {isJobActive(job) && <Progress value={job.progress || 0} />}
            {job.error_message && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {humanVideoCutError(job.error_message)}
                {job.fallback_required && <p className="mt-1 text-muted-foreground">Crie um novo corte usando a opção Enviar MP4.</p>}
              </div>
            )}
            {job.analysis_warning && job.status !== "failed" && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-muted-foreground">
                {job.analysis_warning}
              </div>
            )}

            {(job.video_cut_clips?.length ?? 0) > 0 && (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                {job.video_cut_clips!.map((clip) => (
                  <Card key={clip.id} className="overflow-hidden border-border/80">
                    <div className="aspect-[9/16] bg-black">
                      {clip.video_url ? (
                        <video
                          className="h-full w-full object-contain"
                          src={clip.video_url}
                          poster={clip.thumbnail_url || undefined}
                          controls
                          playsInline
                          onPlay={(event) => { event.currentTarget.dataset.lastActivity = String(Date.now()); }}
                          onPause={(event) => { event.currentTarget.dataset.lastActivity = String(Date.now()); }}
                          onSeeking={(event) => { event.currentTarget.dataset.lastActivity = String(Date.now()); }}
                          onTimeUpdate={(event) => { event.currentTarget.dataset.lastActivity = String(Date.now()); }}
                        />
                      ) : (
                        <div className="h-full grid place-items-center text-sm text-muted-foreground">Vídeo em geração</div>
                      )}
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant={statusVariant(clip.status)}>{statusLabel(clip.status)}</Badge>
                          {clip.viral_score != null && (() => {
                            const tone = viralBadgeTone(clip.viral_score);
                            const cls = tone === "high"
                              ? "bg-green-500/15 text-green-600 border-green-500/30"
                              : tone === "mid"
                                ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
                                : "bg-red-500/15 text-red-600 border-red-500/30";
                            return (
                              <span
                                className={`text-xs font-medium px-2 py-0.5 rounded-md border ${cls}`}
                                title={`Gancho ${clip.hook_score ?? "-"} · Emoção ${clip.emotion_score ?? "-"} · Clareza ${clip.clarity_score ?? "-"}`}
                              >
                                {viralBadgeLabel(clip.viral_score)}
                              </span>
                            );
                          })()}
                          {clip.format && (
                            <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-md border border-border">
                              {clip.format === "reels" ? "9:16" : clip.format === "feed_square" ? "1:1" : "4:5"}
                            </span>
                          )}
                          {clip.subtitle_error && (
                            <span className="text-xs text-amber-600 px-2 py-0.5 rounded-md border border-amber-500/30 bg-amber-500/10">
                              sem legenda
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">{formatCutTime(clip.start_seconds)} - {formatCutTime(clip.end_seconds)}</span>
                      </div>
                      <div>
                        <h3 className="font-semibold line-clamp-2">{clip.title || `Corte ${clip.clip_index}`}</h3>
                        {clip.hook_text && (
                          <p className="text-xs font-bold uppercase text-primary mt-1">🎯 {clip.hook_text}</p>
                        )}
                        <p className="text-sm text-muted-foreground line-clamp-3 mt-1">{clip.hook || clip.reason || clip.caption}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => setEditingClip({ ...clip, hashtagsText: hashtagsToText(clip.hashtags) })}>
                          Editar legenda
                        </Button>
                        <Button size="sm" onClick={() => approveClip(clip, job)} disabled={!clip.video_url || clip.status === "scheduled"}>
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Aprovar e agendar
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

    </div>
  );
}
