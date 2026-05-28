import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { MessageSquare, Plus, Send, Loader2, ArrowLeft, CheckCircle2, Clock } from "lucide-react";
import { AudioRecorder } from "@/components/support/AudioRecorder";
import { AudioBubble } from "@/components/support/AudioBubble";
import { ImageBubble } from "@/components/support/ImageBubble";
import { ImageUploadButton } from "@/components/support/ImageUploadButton";

type Ticket = {
  id: string;
  subject: string;
  status: string;
  last_message_at: string;
  last_sender_role: string;
  unread_for_user: boolean;
  created_at: string;
};
type Message = {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_role: string;
  body: string | null;
  audio_url: string | null;
  audio_duration_seconds: number | null;
  image_url: string | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, { label: string; tone: string; icon: any }> = {
  open: { label: "Aberto", tone: "bg-blue-500/15 text-blue-400 border-blue-500/30", icon: Clock },
  pending_user: { label: "Aguardando você", tone: "bg-amber-500/15 text-amber-400 border-amber-500/30", icon: MessageSquare },
  closed: { label: "Resolvido", tone: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: CheckCircle2 },
};

export default function Support() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const [creating, setCreating] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const loadTickets = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("user_id", user.id)
      .order("last_message_at", { ascending: false });
    setTickets((data as Ticket[]) || []);
    setLoading(false);
  };

  const loadMessages = async (ticketId: string) => {
    const { data } = await supabase
      .from("support_messages")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true });
    setMessages((data as Message[]) || []);
    // mark as read for user
    await supabase.from("support_tickets").update({ unread_for_user: false }).eq("id", ticketId);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  useEffect(() => { loadTickets(); }, [user?.id]);

  // Live updates on ticket list — optimistic patch instead of full reload
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`support-tickets-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as Ticket | undefined;
          if (!row) return;
          setTickets((prev) => {
            if (payload.eventType === "DELETE") return prev.filter(t => t.id !== row.id);
            const exists = prev.some(t => t.id === row.id);
            const next = exists ? prev.map(t => t.id === row.id ? { ...t, ...row } : t) : [row as Ticket, ...prev];
            return next.sort((a, b) => +new Date(b.last_message_at) - +new Date(a.last_message_at));
          });
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id]);

  useEffect(() => {
    if (!selected) return;
    loadMessages(selected.id);
    const ch = supabase
      .channel(`support-${selected.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages", filter: `ticket_id=eq.${selected.id}` },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => prev.some(x => x.id === m.id) ? prev : [...prev, m]);
          if (m.sender_role !== "user") {
            supabase.from("support_tickets").update({ unread_for_user: false }).eq("id", selected.id);
          }
          setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [selected?.id]);

  const sendImage = async (file: File) => {
    if (!user || !selected) return;
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const path = `${selected.id}/${Date.now()}-${user.id}.${ext}`;
    const { error: upErr } = await supabase.storage.from("support-images").upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) { toast.error("Erro ao enviar imagem"); return; }
    const { error } = await supabase.from("support_messages").insert({
      ticket_id: selected.id, sender_id: user.id, sender_role: "user", image_url: path,
    });
    if (error) toast.error("Erro ao registrar imagem");
  };

  const sendAudio = async (blob: Blob, duration: number) => {
    if (!user || !selected) return;
    const ext = (blob.type.includes("mp4") ? "mp4" : "webm");
    const path = `${selected.id}/${Date.now()}-${user.id}.${ext}`;
    const { error: upErr } = await supabase.storage.from("support-audio").upload(path, blob, { contentType: blob.type, upsert: false });
    if (upErr) { toast.error("Erro ao enviar áudio"); return; }
    const { error } = await supabase.from("support_messages").insert({
      ticket_id: selected.id, sender_id: user.id, sender_role: "user",
      audio_url: path, audio_duration_seconds: duration,
    });
    if (error) toast.error("Erro ao registrar áudio");
  };

  const sendReply = async () => {
    if (!user || !selected || !reply.trim()) return;
    setSending(true);
    const body = reply.trim();
    setReply("");
    const { error } = await supabase.from("support_messages").insert({
      ticket_id: selected.id, sender_id: user.id, sender_role: "user", body,
    });
    setSending(false);
    if (error) { toast.error("Erro ao enviar"); setReply(body); return; }
    // Realtime will patch ticket list automatically
  };

  const createTicket = async () => {
    if (!user || !newSubject.trim() || !newBody.trim()) return;
    setCreating(true);
    const { data: t, error } = await supabase
      .from("support_tickets")
      .insert({ user_id: user.id, subject: newSubject.trim() })
      .select().single();
    if (error || !t) { setCreating(false); toast.error("Erro ao abrir ticket"); return; }
    const { error: mErr } = await supabase.from("support_messages").insert({
      ticket_id: t.id, sender_id: user.id, sender_role: "user", body: newBody.trim(),
    });
    setCreating(false);
    if (mErr) { toast.error("Ticket criado, mas a mensagem falhou"); return; }
    toast.success("Ticket aberto! Nossa equipe responde em breve.");
    setNewOpen(false); setNewSubject(""); setNewBody("");
    await loadTickets();
    setSelected(t as Ticket);
  };

  const formatTime = (s: string) => new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

  if (selected) {
    const meta = STATUS_LABEL[selected.status] ?? STATUS_LABEL.open;
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <Button variant="ghost" size="sm" onClick={() => { setSelected(null); loadTickets(); }}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <Badge variant="outline" className={meta.tone}>{meta.label}</Badge>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{selected.subject}</CardTitle>
            <p className="text-xs text-muted-foreground">Aberto em {formatTime(selected.created_at)}</p>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[55vh] pr-3">
              <div className="space-y-3">
                {messages.map((m) => {
                  const mine = m.sender_role === "user";
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                        mine ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
                      }`}>
                        <div className="text-[10px] opacity-70 mb-1">
                          {mine ? "Você" : "Suporte"} • {formatTime(m.created_at)}
                        </div>
                        {m.body}
                        {m.audio_url && <AudioBubble path={m.audio_url} durationSec={m.audio_duration_seconds} />}
                        {m.image_url && <ImageBubble path={m.image_url} />}
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
            </ScrollArea>
            {selected.status !== "closed" && (
              <div className="mt-4 space-y-2">
                <Textarea
                  placeholder="Escreva sua mensagem..."
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={3}
                  maxLength={4000}
                />
                <div className="flex justify-end items-center gap-2">
                  <ImageUploadButton onPick={sendImage} disabled={sending} />
                  <AudioRecorder onSend={sendAudio} disabled={sending} />
                  <Button onClick={sendReply} disabled={sending || !reply.trim()}>
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Enviar
                  </Button>
                </div>
              </div>
            )}
            {selected.status === "closed" && (
              <p className="mt-4 text-sm text-muted-foreground text-center">Este ticket foi marcado como resolvido.</p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <MessageSquare className="h-6 w-6" /> Suporte
          </h1>
          <p className="text-sm text-muted-foreground">Fale com nossa equipe. Respondemos no mesmo lugar.</p>
        </div>
        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4" /> Novo ticket</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Abrir novo ticket</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="Assunto" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} maxLength={140} />
              <Textarea placeholder="Descreva sua dúvida ou problema..." rows={6} value={newBody} onChange={(e) => setNewBody(e.target.value)} maxLength={4000} />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setNewOpen(false)}>Cancelar</Button>
              <Button onClick={createTicket} disabled={creating || !newSubject.trim() || !newBody.trim()}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : tickets.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">
          Você ainda não abriu nenhum ticket. Clique em "Novo ticket" para começar.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {tickets.map((t) => {
            const meta = STATUS_LABEL[t.status] ?? STATUS_LABEL.open;
            const Icon = meta.icon;
            return (
              <Card key={t.id} className="cursor-pointer hover:bg-secondary/40 transition-colors" onClick={() => setSelected(t)}>
                <CardContent className="p-4 flex items-center gap-3">
                  <Icon className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{t.subject}</span>
                      {t.unread_for_user && <Badge className="bg-primary text-primary-foreground">novo</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">Última atividade: {formatTime(t.last_message_at)}</p>
                  </div>
                  <Badge variant="outline" className={meta.tone}>{meta.label}</Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
