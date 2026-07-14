import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, Loader2, PlayCircle, RefreshCw, Scissors, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { usePlanUsage, isUnlimited } from "@/hooks/usePlanUsage";
import {
  formatCutTime,
  isSupportedYoutubeUrl,
  splitHashtags,
  videoCutRequestBounds,
  viralBadgeTone,
  viralBadgeLabel,
  CUT_FORMAT_OPTIONS,
  CUT_PRESET_OPTIONS,
  type CutPresetKey,
} from "@/lib/videoCuts";
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
import { statusLabelPt } from "@/lib/statusLabels";
import {
  LocalVideoCutSession,
  localDeviceCapability,
  readVideoDuration,
  type LocalCutProgress,
} from "@/lib/localVideoCuts";

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
  subtitle_style?: "none" | "classic" | "neon" | "karaoke" | "clean" | "bold" | null;
  transcript_text?: string | null;
  quality_report?: { ok?: boolean; failures?: string[] } | null;
  provider_trace?: { transcription?: string | null; framing?: string | null; framing_confidence?: number | null } | null;
  transcript?: { words?: Array<{ word: string; start: number; end: number }> } | null;
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
  preset_key?: CutPresetKey | null;
  custom_prompt?: string | null;
  processing_mode?: "cloud" | "local_device" | null;
  local_file_name?: string | null;
  local_file_size_bytes?: number | null;
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

type CutBrandProfile = {
  instagram_account_id: string;
  user_id: string;
  font_family: string;
  primary_color: string;
  highlight_color: string;
  outline_color: string;
  watermark_enabled: boolean;
  watermark_text: string;
  subtitle_position: "safe_bottom" | "center" | "upper_third";
  default_preset_key: CutPresetKey;
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
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
type BadgeVariant = "default" | "secondary" | "destructive" | "outline";
type InputMode = "youtube" | "upload";
type ProcessingMode = "cloud" | "local_device";

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
  return map[status] || statusLabelPt(status);
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
  const [processingMode, setProcessingMode] = useState<ProcessingMode>("local_device");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [accountId, setAccountId] = useState("");
  const [requestedClips, setRequestedClips] = useState(1);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [formats, setFormats] = useState<CutFormat[]>(["reels"]);
  const [subtitleStyle, setSubtitleStyle] = useState<"none" | "classic" | "neon" | "karaoke" | "clean" | "bold">("bold");
  const [presetKey, setPresetKey] = useState<CutPresetKey>("viral");
  const [customPrompt, setCustomPrompt] = useState("");
  const [hookEnabled, setHookEnabled] = useState(true);
  const [autoPublish, setAutoPublish] = useState(false);
  const [removeSilences, setRemoveSilences] = useState(true);
  const [zoomEffect, setZoomEffect] = useState(false);
  const [smartCrop, setSmartCrop] = useState(true);
  const [editingClip, setEditingClip] = useState<VideoCutClip | null>(null);
  const [savingBrand, setSavingBrand] = useState(false);
  const [regeneratingJobId, setRegeneratingJobId] = useState<string | null>(null);
  const [rerenderingClipId, setRerenderingClipId] = useState<string | null>(null);
  const [brandProfile, setBrandProfile] = useState<CutBrandProfile | null>(null);
  const [localJobId, setLocalJobId] = useState<string | null>(null);
  const [localAudioPath, setLocalAudioPath] = useState<string | null>(null);
  const [localProgress, setLocalProgress] = useState<LocalCutProgress | null>(null);
  const [localRendering, setLocalRendering] = useState(false);
  const localSessionRef = useRef<LocalVideoCutSession | null>(null);

  const deviceCapability = useMemo(() => localDeviceCapability(videoFile), [videoFile]);

  const toggleFormat = (value: CutFormat, checked: boolean) => {
    setFormats((prev) => {
      if (checked) return prev.includes(value) ? prev : [...prev, value];
      return prev.length > 1 ? prev.filter((f) => f !== value) : prev;
    });
  };

  const applyPreset = (value: CutPresetKey) => {
    setPresetKey(value);
    const preset = CUT_PRESET_OPTIONS.find((item) => item.value === value);
    if (!preset) return;
    setSubtitleStyle(preset.subtitleStyle);
    setHookEnabled(preset.hookEnabled);
    setRemoveSilences(preset.removeSilences);
    setZoomEffect(preset.zoomEffect);
    setSmartCrop(true);
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

    const [{ data: jobRows, error }, healthResult, brandResult] = await Promise.all([
      selectedAccountId
        ? jobsQuery
        .order("created_at", { ascending: false })
        .limit(40)
        : Promise.resolve({ data: [], error: null }),
      db.rpc<WorkerHealth[]>("get_media_worker_health"),
      selectedAccountId
        ? db.from<CutBrandProfile>("video_cut_brand_profiles").select("*").eq("instagram_account_id", selectedAccountId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (error) toast.error(error.message || "Não foi possível carregar os cortes.");
    setWorkerHealth((healthResult.data as WorkerHealth[] | undefined) || []);
    const storedBrand = brandResult.data as CutBrandProfile | null | undefined;
    const nextBrand = storedBrand || (selectedAccountId && user ? {
      instagram_account_id: selectedAccountId,
      user_id: user.id,
      font_family: "Inter",
      primary_color: "#FFFFFF",
      highlight_color: "#FFD400",
      outline_color: "#000000",
      watermark_enabled: true,
      watermark_text: availableAccounts.find((account) => account.id === selectedAccountId)?.username || "",
      subtitle_position: "safe_bottom" as const,
      default_preset_key: "viral" as CutPresetKey,
    } : null);
    setBrandProfile(nextBrand);
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

  const hasActiveJobs = useMemo(() => jobs.some((job) =>
    isJobActive(job) || job.video_cut_clips?.some((clip) => clip.status === "rendering"),
  ), [jobs]);

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

  const createLocalJob = async (requestClips: number) => {
    if (!user || !videoFile) throw new Error("Escolha o vídeo original.");
    if (!deviceCapability.supported || !deviceCapability.recommended) throw new Error(deviceCapability.reason);
    const duration = Math.round(await readVideoDuration(videoFile));
    const session = new LocalVideoCutSession(setLocalProgress);
    localSessionRef.current = session;
    await session.prepare(videoFile);
    const audio = await session.extractAnalysisAudio();
    const safeName = videoFile.name.replace(/[^a-z0-9._-]+/gi, "-").slice(-100);
    const audioPath = `${user.id}/cuts/audio/${Date.now()}-${safeName || "video"}.mp3`;
    const { error: uploadError } = await supabase.storage.from("video-cut-audio").upload(audioPath, audio, {
      contentType: "audio/mpeg",
      upsert: false,
    });
    if (uploadError) throw new Error(uploadError.message || "Não foi possível enviar o áudio para análise.");
    const { data, error } = await db.rpc<{ id?: string }>("create_local_video_cut_job", {
      _instagram_account_id: accountId,
      _audio_storage_path: audioPath,
      _source_file_name: videoFile.name,
      _source_file_size_bytes: videoFile.size,
      _duration_seconds: duration,
      _requested_clips: requestClips,
      _rights_confirmed: rightsConfirmed,
      _format: formats[0],
      _formats: formats,
      _subtitle_style: subtitleStyle,
      _hook_enabled: hookEnabled,
      _remove_silences: removeSilences,
      _zoom_effect: zoomEffect,
      _smart_crop: smartCrop,
      _preset_key: presetKey,
      _custom_prompt: presetKey === "custom" ? customPrompt.trim() : null,
    });
    if (error || !data?.id) {
      await supabase.storage.from("video-cut-audio").remove([audioPath]);
      throw new Error(error?.message || "Não foi possível criar a análise local.");
    }
    setLocalJobId(data.id);
    setLocalAudioPath(audioPath);
    setLocalProgress({ phase: "audio", ratio: 1, message: "Áudio enviado. A IA está escolhendo os melhores momentos…" });
    return data.id;
  };

  const renderLocalJob = async (job: VideoCutJob, selectedFile = videoFile) => {
    if (!user || !selectedFile || localRendering) return;
    if (job.local_file_name && selectedFile.name !== job.local_file_name) {
      toast.error(`Selecione novamente o arquivo original: ${job.local_file_name}`);
      return;
    }
    setLocalRendering(true);
    try {
      let session = localSessionRef.current;
      if (!session) {
        session = new LocalVideoCutSession(setLocalProgress);
        localSessionRef.current = session;
        await session.prepare(selectedFile);
      }
      const pendingClips = (job.video_cut_clips || []).filter((clip) => !clip.video_url);
      for (let index = 0; index < pendingClips.length; index += 1) {
        const clip = pendingClips[index];
        setLocalProgress({ phase: "render", ratio: index / Math.max(1, pendingClips.length), message: `Renderizando corte ${index + 1} de ${pendingClips.length}…` });
        const output = await session.renderCut({
          id: clip.id,
          startSeconds: Number(clip.start_seconds || 0),
          endSeconds: Number(clip.end_seconds || 0),
          format: String(clip.format || "reels"),
          subtitleStyle: clip.subtitle_style,
          transcriptWords: clip.transcript?.words || [],
        });
        const storagePath = `${user.id}/cuts/${clip.id}.mp4`;
        const { error: outputError } = await supabase.storage.from("post-images").upload(storagePath, output, {
          contentType: "video/mp4",
          upsert: true,
        });
        if (outputError) throw new Error(outputError.message || `Falha ao enviar o corte ${index + 1}.`);
        const videoUrl = supabase.storage.from("post-images").getPublicUrl(storagePath).data.publicUrl;
        const { error: clipError } = await db.from("video_cut_clips").update({
          video_url: videoUrl,
          status: "draft",
          error_message: null,
          quality_report: { ok: true, render: "local_device", checked_at: new Date().toISOString() },
          provider_trace: { render: "local_device" },
          edit_config: { local_render_pending: false },
        }).eq("id", clip.id);
        if (clipError) throw new Error(clipError.message || "Não foi possível registrar o corte final.");
      }
      if (localAudioPath || job.source_storage_path) {
        await supabase.storage.from("video-cut-audio").remove([localAudioPath || job.source_storage_path!]);
      }
      const { data: finalized, error: finalError } = await db.rpc<boolean>("finalize_local_video_cut_job", { _job_id: job.id });
      if (finalError || finalized !== true) throw new Error(finalError?.message || "Alguns cortes ainda não foram concluídos.");
      await session.dispose();
      localSessionRef.current = null;
      setLocalJobId(null);
      setLocalAudioPath(null);
      setVideoFile(null);
      setLocalProgress({ phase: "render", ratio: 1, message: "Cortes prontos para revisão." });
      toast.success("Cortes processados neste dispositivo e prontos para revisão.");
      await Promise.all([load(), refetchUsage()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha no processamento local.");
    } finally {
      setLocalRendering(false);
    }
  };

  useEffect(() => {
    if (!localJobId || !videoFile || localRendering) return;
    const job = jobs.find((item) => item.id === localJobId);
    const hasPendingLocalClips = job?.video_cut_clips?.some((clip) => !clip.video_url && clip.status === "rendering");
    if (job?.status === "ready" && hasPendingLocalClips) void renderLocalJob(job, videoFile);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, localJobId, videoFile, localRendering]);

  const createJob = async () => {
    if (inputMode === "youtube" && !isSupportedYoutubeUrl(youtubeUrl)) return toast.error("Cole um link público válido do YouTube.");
    if (inputMode === "upload" && !videoFile) return toast.error("Escolha um arquivo MP4 autorizado.");
    if (!accountId) return toast.error("Escolha uma conta do Instagram.");
    if (!rightsConfirmed) return toast.error("Confirme que você tem direito/autorização sobre o vídeo.");
    if (presetKey === "custom" && customPrompt.trim().length < 10) return toast.error("Descreva em pelo menos 10 caracteres o que a IA deve procurar.");
    if (bounds.maxRequest <= 0) return toast.error("Seu limite de Cortes IA para hoje acabou.");

    setCreating(true);
    let uploadedPath: string | null = null;
    try {
      const requestClips = Math.min(requestedClips, bounds.maxRequest);
      let createdJobId: string | null = null;
      if (inputMode === "upload") {
        if (processingMode === "local_device") {
          await createLocalJob(requestClips);
          toast.success("Áudio extraído no dispositivo. A IA está analisando os melhores momentos.");
          setRightsConfirmed(false);
          await Promise.all([load(), refetchUsage()]);
          return;
        }
        uploadedPath = await uploadVideoFile();
        const { data, error } = await db.rpc<{ id?: string }>("create_video_cut_upload_job_v2", {
          _instagram_account_id: accountId,
          _storage_path: uploadedPath,
          _requested_clips: requestClips,
          _rights_confirmed: rightsConfirmed,
          _source_title: videoFile?.name || "Vídeo enviado",
          _format: formats[0],
          _formats: formats,
          _subtitle_style: ["bold", "clean"].includes(subtitleStyle) ? "classic" : subtitleStyle,
          _hook_enabled: hookEnabled,
          _auto_publish: autoPublish,
          _remove_silences: removeSilences,
          _zoom_effect: zoomEffect,
          _smart_crop: smartCrop,
        });
        if (error) throw new Error(error.message || "Não foi possível criar o job.");
        createdJobId = data?.id || null;
      } else {
        const { data, error } = await db.rpc<{ id?: string }>("create_video_cut_job", {
          _instagram_account_id: accountId,
          _youtube_url: youtubeUrl.trim(),
          _requested_clips: requestClips,
          _rights_confirmed: rightsConfirmed,
          _format: formats[0],
          _formats: formats,
          _subtitle_style: ["bold", "clean"].includes(subtitleStyle) ? "classic" : subtitleStyle,
          _hook_enabled: hookEnabled,
          _auto_publish: autoPublish,
          _remove_silences: removeSilences,
          _zoom_effect: zoomEffect,
          _smart_crop: smartCrop,
        });
        if (error) throw new Error(error.message || "Não foi possível criar o job.");
        createdJobId = data?.id || null;
      }
      if (createdJobId) {
        const { error: optionsError } = await db.from("video_cut_jobs")
          .update({
            preset_key: presetKey,
            custom_prompt: presetKey === "custom" ? customPrompt.trim().slice(0, 2000) || null : null,
            subtitle_style: subtitleStyle,
          })
          .eq("id", createdJobId);
        if (optionsError) throw new Error(optionsError.message || "Não foi possível salvar o preset do corte.");
      }
      toast.success("Corte enviado para análise. Ele aparecerá como rascunho para revisão.");
      setYoutubeUrl("");
      if (processingMode === "cloud") setVideoFile(null);
      setRightsConfirmed(false);
      await Promise.all([load(), refetchUsage()]);
    } catch (error: unknown) {
      if (uploadedPath) await supabase.storage.from("video-cut-inputs").remove([uploadedPath]);
      if (inputMode === "upload" && processingMode === "local_device" && !localJobId && localSessionRef.current) {
        await localSessionRef.current.dispose().catch(() => undefined);
        localSessionRef.current = null;
      }
      toast.error(error instanceof Error ? error.message : "Não foi possível criar o job.");
    } finally {
      setCreating(false);
    }
  };

  const saveBrandProfile = async () => {
    if (!brandProfile || !user || !accountId) return;
    setSavingBrand(true);
    const payload = {
      ...brandProfile,
      user_id: user.id,
      instagram_account_id: accountId,
      watermark_text: brandProfile.watermark_text.trim().slice(0, 80) || null,
    };
    const { error } = await db.from("video_cut_brand_profiles")
      .upsert(payload, { onConflict: "instagram_account_id" });
    setSavingBrand(false);
    if (error) return toast.error(error.message || "Não foi possível salvar a identidade dos cortes.");
    toast.success("Identidade visual dos Cortes IA salva para esta conta.");
    applyPreset(brandProfile.default_preset_key);
  };

  const regenerateJob = async (job: VideoCutJob) => {
    if (presetKey === "custom" && customPrompt.trim().length < 10) {
      return toast.error("Descreva o prompt personalizado antes de regenerar.");
    }
    setRegeneratingJobId(job.id);
    const { error } = await db.rpc("regenerate_video_cut_job", {
      _job_id: job.id,
      _preset_key: presetKey,
      _custom_prompt: presetKey === "custom" ? customPrompt.trim() : null,
    });
    setRegeneratingJobId(null);
    if (error) return toast.error(error.message || "Não foi possível regenerar este vídeo.");
    toast.success("Nova versão enviada para a fila usando o mesmo vídeo original.");
    await Promise.all([load(), refetchUsage()]);
  };

  const rerenderClip = async () => {
    if (!editingClip) return;
    const start = Number(editingClip.start_seconds || 0);
    const end = Number(editingClip.end_seconds || 0);
    if (end - start < 3) return toast.error("O trecho precisa ter pelo menos 3 segundos.");
    setRerenderingClipId(editingClip.id);
    const { error } = await db.rpc("request_video_cut_rerender", {
      _clip_id: editingClip.id,
      _start_seconds: start,
      _end_seconds: end,
      _subtitle_style: editingClip.subtitle_style || subtitleStyle,
      _hook_text: editingClip.hook_text || null,
      _transcript_text: editingClip.transcript_text || null,
    });
    setRerenderingClipId(null);
    if (error) return toast.error(error.message || "Não foi possível reprocessar o corte.");
    toast.success("Corte enviado para reprocessamento. O vídeo será substituído quando ficar pronto.");
    setEditingClip(null);
    await load();
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
    const [{ data: settings }, { data: channel }, activeResult, postedResult] = await Promise.all([
      db.from<{ min_post_interval_minutes?: number; preferred_post_hours?: number[] }>("user_settings")
        .select("min_post_interval_minutes, preferred_post_hours").eq("user_id", user.id).maybeSingle(),
      db.from<{ min_interval_minutes?: number; allowed_hours?: number[] }>("channel_settings")
        .select("min_interval_minutes, allowed_hours").eq("user_id", user.id).eq("channel", "reel").maybeSingle(),
      db.from<{ scheduled_for: string; media_type?: string }>("scheduled_posts")
        .select("scheduled_for, media_type")
        .eq("user_id", user.id)
        .eq("instagram_account_id", instagramAccountId)
        .in("status", ["scheduled", "posting", "awaiting_container"])
        .order("scheduled_for", { ascending: true }),
      db.from<{ posted_at?: string; media_type?: string }>("scheduled_posts")
        .select("posted_at, media_type")
        .eq("user_id", user.id)
        .eq("instagram_account_id", instagramAccountId)
        .eq("status", "posted")
        .order("posted_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (activeResult.error) throw activeResult.error;
    if (postedResult.error) throw postedResult.error;

    const intervalMinutes = Math.max(
      10,
      Number(settings?.min_post_interval_minutes) || 10,
      Number(channel?.min_interval_minutes) || 10,
    );
    const gapMs = intervalMinutes * 60_000;
    const allowedHours = Array.isArray(channel?.allowed_hours) && channel.allowed_hours.length
      ? channel.allowed_hours.map(Number).filter((hour) => hour >= 0 && hour <= 23)
      : Array.isArray(settings?.preferred_post_hours)
        ? settings.preferred_post_hours.map(Number).filter((hour) => hour >= 0 && hour <= 23)
        : [];
    const activeTimes = ((activeResult.data || []) as Array<{ scheduled_for: string }>)
      .map((post) => new Date(post.scheduled_for).getTime())
      .filter(Number.isFinite)
      .sort((a, b) => a - b);
    const lastPostedAt = postedResult.data?.posted_at
      ? new Date(postedResult.data.posted_at).getTime()
      : 0;

    let slot = Math.max(Date.now() + 60_000, lastPostedAt ? lastPostedAt + gapMs : 0);
    const toBRT = (date: Date) => new Date(date.getTime() - BRT_OFFSET_MS);
    const fromBRT = (date: Date) => new Date(date.getTime() + BRT_OFFSET_MS);
    for (let guard = 0; guard < 800; guard++) {
      const candidateBRT = toBRT(new Date(slot));
      const hour = candidateBRT.getUTCHours();
      if (allowedHours.length && !allowedHours.includes(hour)) {
        const sortedHours = [...allowedHours].sort((a, b) => a - b);
        const nextHour = sortedHours.find((allowed) => allowed > hour) ?? sortedHours[0];
        const nextBRT = new Date(candidateBRT);
        if (nextHour > hour) nextBRT.setUTCHours(nextHour, 0, 0, 0);
        else {
          nextBRT.setUTCDate(nextBRT.getUTCDate() + 1);
          nextBRT.setUTCHours(nextHour, 0, 0, 0);
        }
        slot = fromBRT(nextBRT).getTime();
        continue;
      }
      const conflicts = activeTimes.some((time) => Math.abs(slot - time) < gapMs);
      if (!conflicts) return new Date(slot);
      slot += Math.max(60_000, gapMs);
    }
    return new Date(slot);
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

      if (job.processing_mode === "local_device" && job.source_storage_path) {
        await supabase.storage.from("video-cut-audio").remove([job.source_storage_path]);
      }

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
                  <p className="text-xs text-muted-foreground">O vídeo é capturado e processado no servidor; você não precisa baixá-lo nem enviá-lo manualmente.</p>
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
                    Selecione o original. No modo local somente o áudio leve e os cortes finais são enviados.
                  </p>
                  <div className="grid sm:grid-cols-2 gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setProcessingMode("local_device")}
                      className={`rounded-xl border p-3 text-left transition ${processingMode === "local_device" ? "border-primary bg-primary/5" : "border-border"}`}
                    >
                      <span className="block text-sm font-medium">Neste dispositivo</span>
                      <span className="block text-xs text-muted-foreground mt-1">Privado e econômico. Recomendado para computadores recentes.</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setProcessingMode("cloud")}
                      className={`rounded-xl border p-3 text-left transition ${processingMode === "cloud" ? "border-primary bg-primary/5" : "border-border"}`}
                    >
                      <span className="block text-sm font-medium">Na nuvem</span>
                      <span className="block text-xs text-muted-foreground mt-1">Envia o MP4 completo e usa o worker do servidor.</span>
                    </button>
                  </div>
                  {processingMode === "local_device" && videoFile && (
                    <p className={`text-xs ${deviceCapability.recommended ? "text-green-600" : "text-amber-600"}`}>
                      {deviceCapability.reason}
                    </p>
                  )}
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
            <div className="space-y-2 md:col-span-2">
              <Label>Preset de edição</Label>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
                {CUT_PRESET_OPTIONS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => applyPreset(preset.value)}
                    className={`rounded-xl border p-3 text-left transition ${presetKey === preset.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                  >
                    <span className="block text-sm font-medium text-foreground">{preset.label}</span>
                    <span className="block text-xs text-muted-foreground mt-1">{preset.description}</span>
                  </button>
                ))}
              </div>
              {presetKey === "custom" && (
                <Textarea
                  value={customPrompt}
                  onChange={(event) => setCustomPrompt(event.target.value.slice(0, 2000))}
                  rows={3}
                  placeholder="Ex.: encontre explicações práticas sobre vendas, preserve exemplos completos e evite trechos políticos."
                />
              )}
            </div>
            <div className="space-y-2">
              <Label>Estilo da legenda</Label>
              <Select value={subtitleStyle} onValueChange={(v) => setSubtitleStyle(v as typeof subtitleStyle)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="classic">Clássica · branco/preto</SelectItem>
                  <SelectItem value="neon">Neon · amarelo destacando</SelectItem>
                  <SelectItem value="karaoke">Karaokê · verde progressivo</SelectItem>
                  <SelectItem value="bold">Bold viral · impacto e destaque</SelectItem>
                  <SelectItem value="clean">Clean · discreta e profissional</SelectItem>
                  <SelectItem value="none">Sem legenda</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-xl border border-border p-3 text-sm text-muted-foreground">
              <p><span className="text-foreground font-medium">{limitText}</span></p>
              <p>Máximo por vídeo: {bounds.maxPerJob || 0} · Cada corte × {formats.length} formato(s) = {formats.length} crédito(s). Duração máxima: {usage?.max_cut_video_minutes || 60} min.</p>
            </div>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-3">
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
              <Checkbox checked={smartCrop} onCheckedChange={(c) => setSmartCrop(c === true)} />
              <span>
                <span className="font-medium text-foreground">Enquadrar pessoa</span>
                <span className="block text-xs text-muted-foreground">Detecta o assunto principal e reposiciona o recorte.</span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-sm cursor-pointer">
              <Checkbox
                checked={inputMode === "upload" && processingMode === "local_device" ? false : autoPublish}
                disabled={inputMode === "upload" && processingMode === "local_device"}
                onCheckedChange={(c) => setAutoPublish(c === true)}
              />
              <span>
                <span className="font-medium text-foreground">Auto-publicar no Instagram</span>
                <span className="block text-xs text-muted-foreground">
                  {inputMode === "upload" && processingMode === "local_device" ? "Disponível depois da renderização local." : "Agenda para +10min sem revisão manual."}
                </span>
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
          {localProgress && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                {(creating || localRendering || localProgress.ratio < 1) && <Loader2 className="h-4 w-4 animate-spin" />}
                <span>{localProgress.message}</span>
              </div>
              <Progress value={Math.round(localProgress.ratio * 100)} />
              <p className="text-xs text-muted-foreground">Mantenha esta página aberta até os vídeos finais aparecerem.</p>
            </div>
          )}
        </Card>

        <Card className="p-5 space-y-4">
          <h2 className="font-semibold text-lg">Como funciona</h2>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p><span className="text-foreground font-medium">1.</span> A IA encontra trechos com gancho, contexto e potencial.</p>
            <p><span className="text-foreground font-medium">2.</span> Se o YouTube bloquear, envie o MP4 autorizado e o worker processa pelo arquivo.</p>
            <p><span className="text-foreground font-medium">3.</span> Você revisa, edita legenda e agenda. Nada é publicado sozinho.</p>
          </div>
          {brandProfile && (
            <div className="border-t border-border pt-4 space-y-3">
              <div>
                <h3 className="font-semibold">Identidade desta conta</h3>
                <p className="text-xs text-muted-foreground">Aplicada apenas aos cortes de @{accounts.find((account) => account.id === accountId)?.username || "Instagram"}.</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="space-y-1 text-xs text-muted-foreground">
                  Texto
                  <Input type="color" className="h-9 p-1" value={brandProfile.primary_color} onChange={(event) => setBrandProfile({ ...brandProfile, primary_color: event.target.value })} />
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  Destaque
                  <Input type="color" className="h-9 p-1" value={brandProfile.highlight_color} onChange={(event) => setBrandProfile({ ...brandProfile, highlight_color: event.target.value })} />
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  Contorno
                  <Input type="color" className="h-9 p-1" value={brandProfile.outline_color} onChange={(event) => setBrandProfile({ ...brandProfile, outline_color: event.target.value })} />
                </label>
              </div>
              <div className="space-y-2">
                <Label>Marca d'água</Label>
                <Input value={brandProfile.watermark_text} onChange={(event) => setBrandProfile({ ...brandProfile, watermark_text: event.target.value })} placeholder="@sua_conta" />
              </div>
              <div className="space-y-2">
                <Label>Posição das legendas</Label>
                <Select value={brandProfile.subtitle_position} onValueChange={(value) => setBrandProfile({ ...brandProfile, subtitle_position: value as CutBrandProfile["subtitle_position"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="safe_bottom">Inferior segura</SelectItem>
                    <SelectItem value="center">Centro</SelectItem>
                    <SelectItem value="upper_third">Terço superior</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Preset padrão</Label>
                <Select value={brandProfile.default_preset_key} onValueChange={(value) => setBrandProfile({ ...brandProfile, default_preset_key: value as CutPresetKey })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CUT_PRESET_OPTIONS.map((preset) => <SelectItem key={preset.value} value={preset.value}>{preset.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" className="w-full" onClick={saveBrandProfile} disabled={savingBrand}>
                {savingBrand && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar identidade
              </Button>
            </div>
          )}
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
                  {job.processing_mode === "local_device" ? (
                    <span className="text-sm text-primary inline-flex items-center gap-1"><Scissors className="h-3 w-3" /> Processamento local</span>
                  ) : job.source_kind === "upload" ? (
                    <span className="text-sm text-muted-foreground inline-flex items-center gap-1"><Upload className="h-3 w-3" /> MP4 privado</span>
                  ) : (
                    <a className="text-sm text-primary inline-flex items-center gap-1" href={job.youtube_url} target="_blank" rel="noreferrer">
                      YouTube <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {job.analysis_mode?.startsWith("transcript_ai") && <Badge variant="outline">Análise pela fala</Badge>}
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
                {job.processing_mode === "local_device" && job.video_cut_clips?.some((clip) => !clip.video_url) && (
                  <Button size="sm" onClick={() => {
                    setLocalJobId(job.id);
                    setLocalAudioPath(job.source_storage_path || null);
                    void renderLocalJob(job);
                  }} disabled={!videoFile || localRendering}>
                    {localRendering ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-1" />}
                    {videoFile ? "Concluir neste dispositivo" : "Selecione o original acima"}
                  </Button>
                )}
                {job.status === "ready" && job.processing_mode !== "local_device" && (
                  <Button size="sm" variant="outline" onClick={() => regenerateJob(job)} disabled={regeneratingJobId === job.id}>
                    {regeneratingJobId === job.id ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                    Nova versão
                  </Button>
                )}
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
                          {clip.quality_report?.ok && (
                            <span className="text-xs text-green-600 px-2 py-0.5 rounded-md border border-green-500/30 bg-green-500/10" title="Codec, áudio, resolução e duração validados antes da publicação">
                              qualidade validada
                            </span>
                          )}
                          {clip.provider_trace?.framing === "gemini_vision" && (
                            <span className="text-xs text-primary px-2 py-0.5 rounded-md border border-primary/30 bg-primary/5" title={`Confiança ${Math.round(Number(clip.provider_trace.framing_confidence || 0) * 100)}%`}>
                              enquadramento IA
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
                        <Button size="sm" variant="outline" onClick={() => setEditingClip({
                          ...clip,
                          hashtagsText: hashtagsToText(clip.hashtags),
                          transcript_text: clip.transcript_text || clip.transcript?.words?.map((word) => word.word).join(" ") || "",
                        })}>
                          Editar corte
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
            <DialogTitle>Editar corte e legenda</DialogTitle>
            <DialogDescription>Metadados são salvos imediatamente; alterações de tempo, estilo ou transcrição exigem reprocessar o vídeo.</DialogDescription>
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
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Início no original (segundos)</Label>
                  <Input type="number" min={0} step={0.1} value={editingClip.start_seconds ?? 0} onChange={(e) => setEditingClip({ ...editingClip, start_seconds: Number(e.target.value) })} />
                </div>
                <div className="space-y-2">
                  <Label>Fim no original (segundos)</Label>
                  <Input type="number" min={0} step={0.1} value={editingClip.end_seconds ?? 0} onChange={(e) => setEditingClip({ ...editingClip, end_seconds: Number(e.target.value) })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Estilo no vídeo</Label>
                <Select value={editingClip.subtitle_style || subtitleStyle} onValueChange={(value) => setEditingClip({ ...editingClip, subtitle_style: value as VideoCutClip["subtitle_style"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bold">Bold viral</SelectItem>
                    <SelectItem value="classic">Clássica</SelectItem>
                    <SelectItem value="clean">Clean</SelectItem>
                    <SelectItem value="neon">Neon</SelectItem>
                    <SelectItem value="karaoke">Karaokê</SelectItem>
                    <SelectItem value="none">Sem legenda</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Transcrição que aparece no vídeo</Label>
                <Textarea rows={6} value={editingClip.transcript_text || ""} onChange={(e) => setEditingClip({ ...editingClip, transcript_text: e.target.value })} />
                <p className="text-xs text-muted-foreground">Você pode corrigir palavras e pontuação. Para cortar uma fala inteira, ajuste também os segundos de início e fim.</p>
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
            <Button onClick={rerenderClip} disabled={rerenderingClipId === editingClip?.id}>
              {rerenderingClipId === editingClip?.id && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar e reprocessar vídeo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
