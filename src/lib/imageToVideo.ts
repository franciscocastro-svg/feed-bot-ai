/**
 * Gera um MP4/WebM 1080x1920 de N segundos a partir de uma imagem usando
 * Canvas + MediaRecorder. Não depende de ffmpeg.wasm (que exige
 * SharedArrayBuffer / COOP-COEP, indisponíveis no preview do Lovable).
 *
 * Se audioUrl for fornecido, mixa a trilha sonora (cortada/loop até durationSeconds).
 */
export async function imageToReelVideo(
  imageUrl: string,
  durationSeconds = 6,
  audioUrl?: string | null,
): Promise<Blob> {
  const W = 1080, H = 1920, FPS = 30;

  // Carrega a imagem via proxy para evitar canvas tainted por CORS
  const proxied = imageUrl.startsWith("http")
    ? `https://images.weserv.nl/?url=${encodeURIComponent(imageUrl.replace(/^https?:\/\//, ""))}`
    : imageUrl;

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("Falha ao carregar imagem para o vídeo"));
    i.src = proxied;
  });

  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Fundo preto + imagem em "cover"
  const draw = () => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    const ir = img.width / img.height;
    const cr = W / H;
    let dw = W, dh = H, dx = 0, dy = 0;
    if (ir > cr) { dh = H; dw = H * ir; dx = (W - dw) / 2; }
    else { dw = W; dh = W / ir; dy = (H - dh) / 2; }
    ctx.drawImage(img, dx, dy, dw, dh);
  };
  draw();

  // captureStream do canvas -> MediaRecorder
  const videoStream = (canvas as any).captureStream(FPS) as MediaStream;

  // ===== Áudio (opcional) =====
  let audioCtx: AudioContext | null = null;
  let audioSourceNode: AudioBufferSourceNode | null = null;
  const combinedStream = new MediaStream();
  videoStream.getVideoTracks().forEach((t) => combinedStream.addTrack(t));

  if (audioUrl) {
    try {
      // Remove cache-buster (?t=...) que pode atrapalhar o CORS, e busca direto.
      const cleanUrl = audioUrl.split("?")[0];
      const resp = await fetch(cleanUrl, { mode: "cors" });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const ab = await resp.arrayBuffer();
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const decoded = await new Promise<AudioBuffer>((resolve, reject) => {
        audioCtx!.decodeAudioData(ab.slice(0), resolve, reject);
      });
      audioSourceNode = audioCtx.createBufferSource();
      audioSourceNode.buffer = decoded;
      audioSourceNode.loop = true; // loop caso o áudio seja menor que durationSeconds
      const dest = audioCtx.createMediaStreamDestination();
      audioSourceNode.connect(dest);
      dest.stream.getAudioTracks().forEach((t) => combinedStream.addTrack(t));
    } catch (e) {
      console.warn("[reel] falha ao carregar áudio, gerando sem trilha", e);
    }
  }

  // Escolhe o melhor mimeType disponível (Chrome: mp4 h264 ok; Safari: mp4; FF: webm)
  const candidates = [
    "video/mp4;codecs=h264,aac",
    "video/mp4;codecs=avc1,mp4a",
    "video/mp4;codecs=h264",
    "video/mp4;codecs=avc1",
    "video/mp4",
    "video/webm;codecs=h264,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  const mimeType = candidates.find((m) => (window as any).MediaRecorder?.isTypeSupported?.(m)) || "video/webm";

  const recorder = new MediaRecorder(combinedStream, { mimeType, videoBitsPerSecond: 6_000_000, audioBitsPerSecond: 128_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };

  const done = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => {
      const out = new Blob(chunks, { type: mimeType.startsWith("video/mp4") ? "video/mp4" : "video/webm" });
      if (out.size < 1000) reject(new Error("Vídeo gerado vazio"));
      else resolve(out);
    };
    recorder.onerror = (e: any) => reject(e?.error || new Error("Erro no MediaRecorder"));
  });

  recorder.start(200);
  if (audioSourceNode) {
    try { audioSourceNode.start(0); } catch {}
  }

  // Mantém redesenho contínuo para o stream "andar"
  const start = performance.now();
  const totalMs = durationSeconds * 1000;
  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = performance.now() - start;
      draw();
      if (t < totalMs) requestAnimationFrame(tick);
      else resolve();
    };
    requestAnimationFrame(tick);
  });

  recorder.stop();
  if (audioSourceNode) { try { audioSourceNode.stop(); } catch {} }
  if (audioCtx) { try { await audioCtx.close(); } catch {} }
  combinedStream.getTracks().forEach((t) => t.stop());
  videoStream.getTracks().forEach((t) => t.stop());
  return await done;
}
