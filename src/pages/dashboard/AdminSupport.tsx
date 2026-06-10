import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { MessageSquare, Send, Loader2, ArrowLeft, ShieldCheck, RefreshCw } from "lucide-react";
import { AudioRecorder } from "@/components/support/AudioRecorder";
import { AudioBubble } from "@/components/support/AudioBubble";
import { ImageBubble } from "@/components/support/ImageBubble";
import { ImageUploadButton } from "@/components/support/ImageUploadButton";

type Ticket = {
  id: string;
  user_id: string;
  subject: string;
  status: string;
  last_message_at: string;
  last_sender_role: string;
  unread_for_admin: boolean;
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
type Profile = { id: string; display_name: string | null };

const STATUSES = [
  { value: "open", label: "Aberto" },
  { value: "pending_user", label: "Aguardando cliente" },
  { value: "closed", label: "Resolvido" },
];
const STATUS_TONE: Record<string, string> = {
  open: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  pending_user: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  closed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
};

export default function AdminSupport() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle()
      .then(({ data }) => { setAllowed(!!data); if (!data) navigate("/dashboard"); });
  }, [user]);

  const loadTickets = async () => {
    setLoading(true);
    let q = supabase.from("support_tickets").select("*").order("last_message_at", { ascending: false });
    if (filter !== "all") q = q.eq("status", filter);
    const { data } = await q;
    const list = (data as Ticket[]) || [];
    setTickets(list);
    const ids = Array.from(new Set(list.map(t => t.user_id)));
    if (ids.length) {
      const { data: ps } = await supabase.from("profiles").select("id, display_name").in("id", ids);
      const map: Record<string, Profile> = {};
      (ps || []).forEach((p: any) => { map[p.id] = p; });
      setProfiles(map);
    }
    setLoading(false);
  };

  useEffect(() => { if (allowed) loadTickets(); }, [allowed, filter]);

  // Polling for ticket list (Realtime removed for security)
  useEffect(() => {
    if (!allowed) return;
    const id = setInterval(() => { loadTickets(); }, 15000);
    return () => clearInterval(id);
  }, [allowed, filter]);

  const loadMessages = async (ticketId: string) => {
    const { data } = await supabase.from("support_messages").select("*").eq("ticket_id", ticketId).order("created_at", { ascending: true });
    setMessages((data as Message[]) || []);
    await supabase.from("support_tickets").update({ unread_for_admin: false }).eq("id", ticketId);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  };

  useEffect(() => {
    if (!selected) return;
    loadMessages(selected.id);
    const id = setInterval(() => { loadMessages(selected.id); }, 10000);
    return () => clearInterval(id);
  }, [selected?.id]);


  const sendReply = async () => {
    if (!user || !selected || !reply.trim()) return;
    setSending(true);
    const body = reply.trim();
    setReply("");
    const { error } = await supabase.from("support_messages").insert({
      ticket_id: selected.id, sender_id: user.id, sender_role: "admin", body,
    });
    setSending(false);
    if (error) { toast.error("Erro ao enviar"); setReply(body); return; }
  };

  const sendAudio = async (blob: Blob, duration: number) => {
    if (!user || !selected) return;
    const ext = (blob.type.includes("mp4") ? "mp4" : "webm");
    const path = `${selected.id}/${Date.now()}-${user.id}.${ext}`;
    const { error: upErr } = await supabase.storage.from("support-audio").upload(path, blob, { contentType: blob.type, upsert: false });
    if (upErr) { toast.error("Erro ao enviar áudio"); return; }
    const { error } = await supabase.from("support_messages").insert({
      ticket_id: selected.id, sender_id: user.id, sender_role: "admin",
      audio_url: path, audio_duration_seconds: duration,
    });
    if (error) toast.error("Erro ao registrar áudio");
  };

  const sendImage = async (file: File) => {
    if (!user || !selected) return;
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "") || "png";
    const path = `${selected.id}/${Date.now()}-${user.id}.${ext}`;
    const { error: upErr } = await supabase.storage.from("support-images").upload(path, file, { contentType: file.type, upsert: false });
    if (upErr) { toast.error("Erro ao enviar imagem"); return; }
    const { error } = await supabase.from("support_messages").insert({
      ticket_id: selected.id, sender_id: user.id, sender_role: "admin", image_url: path,
    });
    if (error) toast.error("Erro ao registrar imagem");
  };

  const changeStatus = async (status: string) => {
    if (!selected) return;
    const { error } = await supabase.from("support_tickets").update({ status }).eq("id", selected.id);
    if (error) return toast.error("Erro ao alterar status");
    setSelected({ ...selected, status });
    toast.success("Status atualizado");
    loadTickets();
  };

  const formatTime = (s: string) => new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

  if (allowed === null) return <div className="p-10 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>;
  if (!allowed) return null;

  if (selected) {
    const prof = profiles[selected.user_id];
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => { setSelected(null); loadTickets(); }}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <Badge variant="outline" className={STATUS_TONE[selected.status]}>
            {STATUSES.find(s => s.value === selected.status)?.label}
          </Badge>
          <div className="ml-auto">
            <Select value={selected.status} onValueChange={changeStatus}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{selected.subject}</CardTitle>
            <p className="text-xs text-muted-foreground">
              Cliente: <span className="font-medium">{prof?.display_name || selected.user_id.slice(0, 8)}</span>
              {" • "}Aberto em {formatTime(selected.created_at)}
            </p>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[55vh] pr-3">
              <div className="space-y-3">
                {messages.map((m) => {
                  const mine = m.sender_role === "admin";
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                        mine ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"
                      }`}>
                        <div className="text-[10px] opacity-70 mb-1">
                          {mine ? "Você (suporte)" : "Cliente"} • {formatTime(m.created_at)}
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
            <div className="mt-4 space-y-2">
              <Textarea placeholder="Responder como suporte..." value={reply} onChange={(e) => setReply(e.target.value)} rows={3} maxLength={4000} />
              <div className="flex justify-end items-center gap-2">
                <ImageUploadButton onPick={sendImage} disabled={sending} />
                <AudioRecorder onSend={sendAudio} disabled={sending} />
                <Button onClick={sendReply} disabled={sending || !reply.trim()}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6" /> Suporte (Admin)
          </h1>
          <p className="text-sm text-muted-foreground">Tickets enviados pelos clientes.</p>
        </div>
        <div className="flex gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={loadTickets}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : tickets.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground text-sm">Nenhum ticket {filter !== "all" ? "neste status" : "ainda"}.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {tickets.map((t) => {
            const prof = profiles[t.user_id];
            return (
              <Card key={t.id} className="cursor-pointer hover:bg-secondary/40 transition-colors" onClick={() => setSelected(t)}>
                <CardContent className="p-4 flex items-center gap-3">
                  <MessageSquare className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{t.subject}</span>
                      {t.unread_for_admin && <Badge className="bg-primary text-primary-foreground">novo</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {prof?.display_name || t.user_id.slice(0, 8)} • {formatTime(t.last_message_at)}
                    </p>
                  </div>
                  <Badge variant="outline" className={STATUS_TONE[t.status]}>
                    {STATUSES.find(s => s.value === t.status)?.label}
                  </Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
