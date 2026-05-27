import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square, Trash2, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Props = {
  onSend: (blob: Blob, durationSec: number) => Promise<void>;
  disabled?: boolean;
};

export function AudioRecorder({ onSend, disabled }: Props) {
  const [recording, setRecording] = useState(false);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [sending, setSending] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const previewUrl = blob ? URL.createObjectURL(blob) : null;

  useEffect(() => () => { stopStream(); if (previewUrl) URL.revokeObjectURL(previewUrl); }, []);

  const stopStream = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const b = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        setBlob(b);
        stopStream();
      };
      mediaRef.current = rec;
      startedAtRef.current = Date.now();
      setElapsed(0);
      timerRef.current = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000)), 250);
      rec.start();
      setRecording(true);
    } catch (e: any) {
      toast.error("Não consegui acessar o microfone");
    }
  };

  const stop = () => {
    mediaRef.current?.stop();
    setRecording(false);
  };

  const cancel = () => { setBlob(null); setElapsed(0); };

  const send = async () => {
    if (!blob) return;
    setSending(true);
    try {
      await onSend(blob, Math.max(1, elapsed));
      setBlob(null); setElapsed(0);
    } finally { setSending(false); }
  };

  const mm = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  if (blob && previewUrl) {
    return (
      <div className="flex items-center gap-2">
        <audio src={previewUrl} controls className="h-9 flex-1" />
        <Button type="button" size="icon" variant="ghost" onClick={cancel} disabled={sending}>
          <Trash2 className="h-4 w-4" />
        </Button>
        <Button type="button" size="icon" onClick={send} disabled={sending}>
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    );
  }

  if (recording) {
    return (
      <Button type="button" variant="destructive" onClick={stop} disabled={disabled}>
        <Square className="h-4 w-4" /> Parar • {mm(elapsed)}
      </Button>
    );
  }

  return (
    <Button type="button" variant="outline" size="icon" onClick={start} disabled={disabled} title="Gravar áudio">
      <Mic className="h-4 w-4" />
    </Button>
  );
}
