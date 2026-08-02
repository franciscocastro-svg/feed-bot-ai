import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, WandSparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_EDITORIAL_CONFIG,
  EDITORIAL_MIN_DURATION_SECONDS,
  normalizeEditorialConfig,
  type EditorialCutConfig,
  type EditorialCutDraft,
} from "@/lib/editorialCuts";

type Props = {
  clipId: string;
  accountHandle: string;
  format?: "reels" | "feed_portrait" | null;
  previewUrl?: string | null;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  title?: string | null;
  comment?: string | null;
  startSeconds?: number | null;
  endSeconds?: number | null;
  transcriptText?: string | null;
  subtitleStyle?: EditorialCutDraft["subtitleStyle"] | null;
  config?: Partial<EditorialCutConfig> | null;
  confidence?: number | null;
  reviewRequired?: boolean | null;
  reviewConfirmedAt?: string | null;
  status?: string | null;
  finalRenderStatus?: "queued" | "processing" | null;
  busy?: "text" | "render" | null;
  onRegenerateText: (clipId: string) => Promise<{ title: string; comment: string; confidence: number; reviewRequired: boolean } | null>;
  onRender: (clipId: string, draft: EditorialCutDraft) => Promise<boolean>;
  onSchedule: () => void;
  onDiscard: () => void;
};

export function EditorialCutPreview(props: Props) {
  const isReels = props.format === "reels";
  const [draft, setDraft] = useState<EditorialCutDraft>({
    title: props.title || "Revisão necessária",
    comment: props.comment || "Revise a transcrição e descreva com clareza o contexto apresentado neste trecho.",
    startSeconds: Number(props.startSeconds || 0),
    endSeconds: Number(props.endSeconds || 0),
    transcriptText: props.transcriptText || "",
    subtitleStyle: props.subtitleStyle || "clean",
    config: normalizeEditorialConfig(props.config || DEFAULT_EDITORIAL_CONFIG),
  });

  useEffect(() => {
    setDraft((current) => ({
      ...current,
      title: props.title || current.title,
      comment: props.comment || current.comment,
      startSeconds: Number(props.startSeconds ?? current.startSeconds),
      endSeconds: Number(props.endSeconds ?? current.endSeconds),
      transcriptText: props.transcriptText ?? current.transcriptText,
      subtitleStyle: props.subtitleStyle || current.subtitleStyle,
      config: normalizeEditorialConfig(props.config || current.config),
    }));
  }, [props.title, props.comment, props.startSeconds, props.endSeconds, props.transcriptText, props.subtitleStyle, props.config]);

  const finalReady = Boolean(props.videoUrl && props.reviewConfirmedAt);
  const finalRenderQueued = props.finalRenderStatus === "queued";
  const finalRenderProcessing = props.finalRenderStatus === "processing"
    || (!finalReady && props.status === "rendering");
  const finalRenderPending = finalRenderQueued || finalRenderProcessing;
  const mediaUrl = props.videoUrl || props.previewUrl;

  const regenerateText = async () => {
    const result = await props.onRegenerateText(props.clipId);
    if (result) setDraft((current) => ({ ...current, title: result.title, comment: result.comment }));
  };

  return (
    <Card className="overflow-hidden border-primary/30">
      <div className="grid xl:grid-cols-[minmax(300px,0.8fr)_minmax(360px,1.2fr)]">
        <div className={`${isReels ? "aspect-[9/16]" : "aspect-[4/5]"} bg-black`}>
          {mediaUrl ? (
            <video
              className="h-full w-full object-contain"
              src={mediaUrl}
              poster={props.thumbnailUrl || undefined}
              controls
              playsInline
              onPlay={(event) => { event.currentTarget.dataset.lastActivity = String(Date.now()); }}
              onPause={(event) => { event.currentTarget.dataset.lastActivity = String(Date.now()); }}
              onSeeking={(event) => { event.currentTarget.dataset.lastActivity = String(Date.now()); }}
              onTimeUpdate={(event) => { event.currentTarget.dataset.lastActivity = String(Date.now()); }}
            />
          ) : props.thumbnailUrl ? (
            <img className="h-full w-full object-contain" src={props.thumbnailUrl} alt="Prévia do Corte Editorial" />
          ) : (
            <div className="grid h-full place-items-center px-6 text-center text-sm text-white/70">
              A prévia editorial está sendo montada.
            </div>
          )}
        </div>

        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Corte editorial · {isReels ? "Reel 1080 × 1920" : "Feed 1080 × 1350"}</Badge>
            {finalReady ? (
              <Badge variant="outline" className="border-green-500/40 text-green-600"><CheckCircle2 className="mr-1 h-3 w-3" /> Final revisado</Badge>
            ) : (
              <Badge variant="outline">Prévia — nada será publicado</Badge>
            )}
            {props.reviewRequired && (
              <Badge variant="outline" className="border-amber-500/50 text-amber-600"><AlertTriangle className="mr-1 h-3 w-3" /> Revisão necessária</Badge>
            )}
            {finalRenderPending && (
              <Badge variant="outline" className="border-primary/40 text-primary">
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                {finalRenderQueued ? "Vídeo final na fila" : "Renderizando vídeo final"}
              </Badge>
            )}
            {props.confidence != null && <span className="text-xs text-muted-foreground">Confiança do texto: {Math.round(props.confidence * 100)}%</span>}
          </div>

          <div className="rounded-lg border bg-muted/20 p-3 text-xs text-muted-foreground">
            Cabeçalho e identidade de <strong className="text-foreground">@{props.accountHandle}</strong>. O texto usa a transcrição como fonte principal; a análise visual não identifica pessoas pela aparência.
          </div>

          <div className="space-y-2">
            <Label>Título principal</Label>
            <Input maxLength={140} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Comentário editorial</Label>
            <Textarea rows={5} maxLength={600} value={draft.comment} onChange={(event) => setDraft({ ...draft, comment: event.target.value })} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Início (segundos)</Label>
              <Input type="number" min={0} step={0.1} value={draft.startSeconds} onChange={(event) => setDraft({ ...draft, startSeconds: Number(event.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label>Fim (segundos)</Label>
              <Input type="number" min={draft.startSeconds + EDITORIAL_MIN_DURATION_SECONDS} step={0.1} value={draft.endSeconds} onChange={(event) => setDraft({ ...draft, endSeconds: Number(event.target.value) })} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">O Corte Editorial precisa ter no mínimo {EDITORIAL_MIN_DURATION_SECONDS} segundos.</p>

          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Enquadramento</Label>
              <Select value={draft.config.framing} onValueChange={(framing) => setDraft({ ...draft, config: { ...draft.config, framing: framing as EditorialCutConfig["framing"] } })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="blur_fit">Fundo desfocado + vídeo inteiro</SelectItem>
                  <SelectItem value="smart_crop">Recorte inteligente</SelectItem>
                  <SelectItem value="contain">Vídeo inteiro sem ampliar</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fonte</Label>
              <Select value={draft.config.font_family} onValueChange={(font_family) => setDraft({ ...draft, config: { ...draft.config, font_family } })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Inter">Inter</SelectItem>
                  <SelectItem value="Montserrat">Montserrat</SelectItem>
                  <SelectItem value="Poppins">Poppins</SelectItem>
                  <SelectItem value="Arial">Arial</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs text-muted-foreground">Texto<Input type="color" className="h-10 p-1" value={draft.config.primary_color} onChange={(event) => setDraft({ ...draft, config: { ...draft.config, primary_color: event.target.value } })} /></label>
            <label className="space-y-1 text-xs text-muted-foreground">Destaque<Input type="color" className="h-10 p-1" value={draft.config.accent_color} onChange={(event) => setDraft({ ...draft, config: { ...draft.config, accent_color: event.target.value } })} /></label>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div><Label>Legendas sincronizadas</Label><p className="text-xs text-muted-foreground">Ative ou desative antes da renderização final.</p></div>
            <Switch checked={draft.config.subtitles_enabled} onCheckedChange={(subtitles_enabled) => setDraft({ ...draft, config: { ...draft.config, subtitles_enabled } })} />
          </div>
          {draft.config.subtitles_enabled && (
            <div className="space-y-2">
              <Label>Texto das legendas</Label>
              <Textarea
                rows={4}
                value={draft.transcriptText}
                onChange={(event) => setDraft({ ...draft, transcriptText: event.target.value })}
                placeholder="A transcrição sincronizada aparecerá aqui quando a prévia ficar pronta."
              />
              <p className="text-xs text-muted-foreground">Você pode corrigir palavras e pontuação; os tempos são preservados e recalculados ao trocar o trecho.</p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={regenerateText} disabled={Boolean(props.busy)}>
              {props.busy === "text" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
              Regenerar somente o texto
            </Button>
            <Button onClick={() => props.onRender(props.clipId, draft)} disabled={Boolean(props.busy) || finalRenderPending}>
              {props.busy === "render" ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <WandSparkles className="mr-1 h-4 w-4" />}
              {finalRenderQueued
                ? "Vídeo final na fila"
                : finalRenderProcessing
                  ? "Renderizando vídeo final"
                  : "Revisar e gerar vídeo final"}
            </Button>
            <Button variant="secondary" onClick={props.onSchedule} disabled={!finalReady || Boolean(props.busy) || finalRenderPending}>
              <CheckCircle2 className="mr-1 h-4 w-4" /> Aprovar e agendar
            </Button>
            <Button variant="ghost" onClick={props.onDiscard} disabled={Boolean(props.busy)}>Descartar</Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
