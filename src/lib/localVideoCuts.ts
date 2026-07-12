import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";

export type LocalCutProgress = { phase: "loading" | "audio" | "render"; ratio: number; message: string };
export type TimedWord = { word: string; start: number; end: number };

export type LocalCutSpec = {
  id: string;
  startSeconds: number;
  endSeconds: number;
  format: string;
  subtitleStyle?: string | null;
  transcriptWords?: TimedWord[];
};

export type LocalDeviceCapability = {
  supported: boolean;
  recommended: boolean;
  reason: string;
  maxRecommendedBytes: number;
};

type NavigatorWithMemory = Navigator & { deviceMemory?: number };

export function localDeviceCapability(file?: File | null): LocalDeviceCapability {
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const memory = Number((navigator as NavigatorWithMemory).deviceMemory || 0);
  const cores = Number(navigator.hardwareConcurrency || 0);
  const maxRecommendedBytes = isMobile ? 150 * 1024 * 1024 : 500 * 1024 * 1024;
  if (typeof WebAssembly === "undefined" || typeof File === "undefined") {
    return { supported: false, recommended: false, reason: "Este navegador não possui WebAssembly.", maxRecommendedBytes };
  }
  if (file && file.size > maxRecommendedBytes) {
    return { supported: true, recommended: false, reason: "O arquivo é grande para este dispositivo; prefira processamento na nuvem.", maxRecommendedBytes };
  }
  if ((memory > 0 && memory < 4) || (cores > 0 && cores < 4)) {
    return { supported: true, recommended: false, reason: "O aparelho pode ficar lento; o modo nuvem é mais seguro.", maxRecommendedBytes };
  }
  return { supported: true, recommended: true, reason: "Dispositivo compatível com processamento local.", maxRecommendedBytes };
}

export async function readVideoDuration(file: File): Promise<number> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<number>((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => resolve(Number(video.duration || 0));
      video.onerror = () => reject(new Error("Não foi possível ler a duração deste vídeo."));
      video.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function srtTime(seconds: number) {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const millis = totalMs % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

function buildSrt(words: TimedWord[]) {
  const groups: TimedWord[][] = [];
  for (let index = 0; index < words.length; index += 4) groups.push(words.slice(index, index + 4));
  return groups.map((group, index) => {
    const start = group[0]?.start || 0;
    const end = Math.max(start + 0.2, group[group.length - 1]?.end || start + 1);
    const text = group.map((word) => word.word).join(" ").replace(/-->/g, "→");
    return `${index + 1}\n${srtTime(start)} --> ${srtTime(end)}\n${text}\n`;
  }).join("\n");
}

function outputDimensions(format: string) {
  if (format === "feed_square") return { width: 1080, height: 1080 };
  if (format === "feed_portrait") return { width: 1080, height: 1350 };
  return { width: 1080, height: 1920 };
}

function binaryBlob(data: Uint8Array | string, type: string) {
  const bytes = data instanceof Uint8Array ? data : new TextEncoder().encode(data);
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy.buffer], { type });
}

export class LocalVideoCutSession {
  private ffmpeg = new FFmpeg();
  private loaded = false;
  private inputName = "local-source.mp4";
  private progress?: (progress: LocalCutProgress) => void;

  constructor(progress?: (progress: LocalCutProgress) => void) {
    this.progress = progress;
    this.ffmpeg.on("progress", ({ progress: ratio }) => {
      this.progress?.({ phase: "render", ratio: Math.max(0, Math.min(1, ratio || 0)), message: "Processando no dispositivo…" });
    });
  }

  async prepare(file: File) {
    if (!this.loaded) {
      this.progress?.({ phase: "loading", ratio: 0.05, message: "Carregando editor local…" });
      const baseURL = import.meta.env.VITE_FFMPEG_CORE_URL || "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";
      await this.ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
      });
      this.loaded = true;
    }
    this.progress?.({ phase: "loading", ratio: 0.2, message: "Preparando o vídeo local…" });
    await this.ffmpeg.writeFile(this.inputName, await fetchFile(file));
  }

  async extractAnalysisAudio(): Promise<Blob> {
    const output = "analysis-audio.mp3";
    this.progress?.({ phase: "audio", ratio: 0.25, message: "Extraindo áudio leve…" });
    await this.ffmpeg.exec(["-i", this.inputName, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", output]);
    const data = await this.ffmpeg.readFile(output);
    await this.ffmpeg.deleteFile(output).catch(() => undefined);
    return binaryBlob(data, "audio/mpeg");
  }

  async renderCut(spec: LocalCutSpec): Promise<Blob> {
    const duration = Math.max(3, spec.endSeconds - spec.startSeconds);
    const { width, height } = outputDimensions(spec.format);
    const output = `cut-${spec.id}.mp4`;
    const subtitleFile = `cut-${spec.id}.srt`;
    const words = Array.isArray(spec.transcriptWords) ? spec.transcriptWords : [];
    if (words.length && spec.subtitleStyle !== "none") {
      await this.ffmpeg.writeFile(subtitleFile, new TextEncoder().encode(buildSrt(words)));
    }
    const baseFilter = `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1`;
    const subtitleFilter = words.length && spec.subtitleStyle !== "none"
      ? `${baseFilter},subtitles=${subtitleFile}:force_style='FontName=Arial,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Alignment=2,MarginV=120'`
      : baseFilter;
    const args = [
      "-ss", String(spec.startSeconds), "-i", this.inputName, "-t", String(duration),
      "-vf", subtitleFilter,
      "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", output,
    ];
    this.progress?.({ phase: "render", ratio: 0, message: "Renderizando corte no dispositivo…" });
    try {
      await this.ffmpeg.exec(args);
    } catch (error) {
      // Algumas builds WASM não incluem libass. Mantemos o corte utilizável e
      // registramos a legenda para uma regeneração posterior.
      if (!(words.length && spec.subtitleStyle !== "none")) throw error;
      await this.ffmpeg.exec([
        "-ss", String(spec.startSeconds), "-i", this.inputName, "-t", String(duration),
        "-vf", baseFilter,
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", output,
      ]);
    }
    const data = await this.ffmpeg.readFile(output);
    await Promise.all([
      this.ffmpeg.deleteFile(output).catch(() => undefined),
      this.ffmpeg.deleteFile(subtitleFile).catch(() => undefined),
    ]);
    return binaryBlob(data, "video/mp4");
  }

  async dispose() {
    await this.ffmpeg.deleteFile(this.inputName).catch(() => undefined);
    this.ffmpeg.terminate();
  }
}
