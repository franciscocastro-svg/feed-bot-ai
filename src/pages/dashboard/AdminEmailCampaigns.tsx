import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { CalendarClock, CheckCircle2, Eye, Loader2, Mail, Pencil, Plus, Send, Settings2, Trash2, Users, XCircle } from "lucide-react";
import { formatBR } from "@/lib/utils";

type Campaign = {
  id: string; name: string; campaign_type: string; audience: string; subject: string;
  preview_text: string | null; heading: string; body: string; cta_label: string | null;
  cta_url: string | null; status: string; scheduled_at: string | null; sent_at: string | null;
  recipient_count: number; error_message: string | null; created_at: string;
};

const emptyForm = {
  name: "", campaign_type: "update", audience: "all_opted_in", subject: "", preview_text: "",
  heading: "", body: "", cta_label: "", cta_url: "", scheduled_at: "",
};

const audienceLabels: Record<string, string> = {
  all_opted_in: "Todos que autorizaram", active: "Clientes ativos", paying: "Clientes pagantes",
  free: "Plano Free", starter: "Plano Starter", pro: "Plano Pro", business: "Plano Business",
};
const statusLabels: Record<string, string> = { draft: "Rascunho", scheduled: "Agendada", sending: "Enviando", sent: "Enviada", failed: "Falhou", cancelled: "Cancelada" };
const invokeCampaignFunction = (body: Record<string, unknown>) => supabase.functions.invoke("admin-email-campaigns", { body });

export default function AdminEmailCampaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState({ configured: false, from: "", reply_to: "" });
  const [audienceCount, setAudienceCount] = useState(0);
  const [counting, setCounting] = useState(false);
  const [open, setOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [working, setWorking] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [confirmText, setConfirmText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data, error }, status] = await Promise.all([
      supabase.from("email_campaigns").select("*").order("created_at", { ascending: false }),
      invokeCampaignFunction({ action: "status" }),
    ]);
    if (error) toast.error("Não foi possível carregar as campanhas");
    setCampaigns((data as unknown as Campaign[]) || []);
    if (status.data) setProvider(status.data);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setCounting(true);
    invokeCampaignFunction({ action: "audience", audience: form.audience }).then(({ data }) => {
      if (active) setAudienceCount(data?.count || 0);
    }).finally(() => active && setCounting(false));
    return () => { active = false; };
  }, [open, form.audience]);

  const openNew = () => { setEditing(null); setForm({ ...emptyForm }); setTestEmail(""); setOpen(true); };
  const openEdit = (c: Campaign) => {
    if (!['draft', 'failed'].includes(c.status)) return toast.error("Campanhas já processadas não podem ser editadas");
    setEditing(c);
    setForm({
      name: c.name, campaign_type: c.campaign_type, audience: c.audience, subject: c.subject,
      preview_text: c.preview_text || "", heading: c.heading, body: c.body,
      cta_label: c.cta_label || "", cta_url: c.cta_url || "",
      scheduled_at: c.scheduled_at ? new Date(c.scheduled_at).toISOString().slice(0, 16) : "",
    });
    setOpen(true);
  };

  const valid = useMemo(() => !!(form.name.trim() && form.subject.trim() && form.heading.trim() && form.body.trim()), [form]);
  const save = async () => {
    if (!valid) return toast.error("Preencha nome, assunto, título e mensagem");
    if ((form.cta_label || form.cta_url) && !(form.cta_label && /^https:\/\//i.test(form.cta_url))) return toast.error("O botão precisa de texto e URL segura iniciada por https://");
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      ...form, name: form.name.trim(), subject: form.subject.trim(), heading: form.heading.trim(), body: form.body.trim(),
      preview_text: form.preview_text.trim() || null, cta_label: form.cta_label.trim() || null,
      cta_url: form.cta_url.trim() || null, scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
    };
    const result = editing
      ? await supabase.from("email_campaigns").update(payload).eq("id", editing.id)
      : await supabase.from("email_campaigns").insert({ ...payload, created_by: user!.id });
    if (result.error) return toast.error(result.error.message);
    toast.success(editing ? "Rascunho atualizado" : "Campanha salva como rascunho");
    setOpen(false); await load();
  };

  const sendTest = async () => {
    if (!editing) return toast.error("Salve a campanha antes de enviar um teste");
    if (!provider.configured) return toast.error("Configure a Resend antes de enviar testes");
    setWorking(true);
    const { error, data } = await invokeCampaignFunction({ action: "test", campaign_id: editing.id, test_email: testEmail });
    setWorking(false);
    if (error || data?.error) return toast.error(data?.error || error?.message);
    toast.success("E-mail de teste enviado");
  };

  const publish = async () => {
    if (!editing || confirmText !== "ENVIAR") return;
    setWorking(true);
    const scheduledAt = form.scheduled_at ? new Date(form.scheduled_at) : null;
    if (scheduledAt && scheduledAt.getTime() <= Date.now()) {
      setWorking(false);
      return toast.error("Escolha um horário futuro para o agendamento");
    }
    const { error: saveError } = await supabase.from("email_campaigns").update({
      name: form.name.trim(), campaign_type: form.campaign_type, audience: form.audience,
      subject: form.subject.trim(), preview_text: form.preview_text.trim() || null,
      heading: form.heading.trim(), body: form.body.trim(), cta_label: form.cta_label.trim() || null,
      cta_url: form.cta_url.trim() || null, scheduled_at: scheduledAt?.toISOString() || null,
    }).eq("id", editing.id);
    if (saveError) {
      setWorking(false);
      return toast.error("Não foi possível salvar as alterações antes do envio");
    }
    const { error, data } = await invokeCampaignFunction({ action: "publish", campaign_id: editing.id, confirm_text: confirmText });
    setWorking(false);
    if (error || data?.error) return toast.error(data?.error === "empty_audience" ? "Nenhum cliente autorizou esse tipo de comunicação" : data?.error || error?.message);
    toast.success(data?.scheduled ? `Campanha agendada para ${data.recipients} contatos` : `Campanha enviada para ${data.recipients} contatos`);
    setConfirmOpen(false); setOpen(false); setConfirmText(""); await load();
  };

  const remove = async (c: Campaign) => {
    if (!confirm(`Excluir o rascunho “${c.name}”?`)) return;
    const { error } = await supabase.from("email_campaigns").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Campanha excluída"); load();
  };

  const statusBadge = (status: string) => {
    const variant = status === "sent" ? "default" : status === "failed" ? "destructive" : "secondary";
    return <Badge variant={variant}>{statusLabels[status] || status}</Badge>;
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div><h1 className="font-display text-3xl font-bold">E-mail & Campanhas</h1><p className="text-muted-foreground mt-1">Novidades, comunicados e promoções para clientes que autorizaram o recebimento.</p></div>
        <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Nova campanha</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card><CardContent className="p-5 flex items-center gap-3"><div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><Mail className="h-5 w-5 text-primary" /></div><div><p className="text-xs text-muted-foreground">Provedor</p><p className="font-semibold flex items-center gap-1.5">{provider.configured ? <><CheckCircle2 className="h-4 w-4 text-green-500" /> Resend conectada</> : <><XCircle className="h-4 w-4 text-amber-500" /> Configuração pendente</>}</p></div></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-xs text-muted-foreground">Remetente</p><p className="font-medium truncate">{provider.from || "novidades@news.fluxifeed.com"}</p><p className="text-xs text-muted-foreground truncate">Resposta: {provider.reply_to || "suporte@fluxifeed.com"}</p></CardContent></Card>
        <Card><CardContent className="p-5"><p className="text-xs text-muted-foreground">Campanhas</p><p className="text-2xl font-bold">{campaigns.length}</p><p className="text-xs text-muted-foreground">{campaigns.filter(c => c.status === "sent").length} enviadas</p></CardContent></Card>
      </div>

      {!provider.configured && <Card className="border-amber-500/40 bg-amber-500/5"><CardContent className="p-4 flex gap-3"><Settings2 className="h-5 w-5 text-amber-500 shrink-0" /><div><p className="font-medium">Painel pronto em modo seguro</p><p className="text-sm text-muted-foreground">Você pode criar e revisar rascunhos. Para testar ou enviar, configure os secrets <code>RESEND_API_KEY</code>, <code>MARKETING_EMAIL_FROM</code> e <code>MARKETING_EMAIL_REPLY_TO</code>.</p></div></CardContent></Card>}

      {loading ? <Card className="p-12 text-center text-muted-foreground">Carregando…</Card> : campaigns.length === 0 ? (
        <Card className="p-12 text-center border-dashed"><Mail className="h-10 w-10 mx-auto text-muted-foreground mb-3" /><p className="font-medium">Nenhuma campanha criada</p><p className="text-sm text-muted-foreground">Comece com um comunicado ou novidade da plataforma.</p></Card>
      ) : <div className="space-y-3">{campaigns.map(c => (
        <Card key={c.id}><CardContent className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4"><div className="min-w-0"><div className="flex items-center gap-2 flex-wrap"><h3 className="font-semibold">{c.name}</h3>{statusBadge(c.status)}<Badge variant="outline">{audienceLabels[c.audience]}</Badge></div><p className="text-sm mt-1 truncate">{c.subject}</p><p className="text-xs text-muted-foreground mt-1">Criada em {formatBR(c.created_at)}{c.scheduled_at ? ` · Agendada para ${formatBR(c.scheduled_at)}` : ""}{c.recipient_count ? ` · ${c.recipient_count} destinatários` : ""}</p>{c.error_message && <p className="text-xs text-destructive mt-1">{c.error_message}</p>}</div><div className="flex gap-2 shrink-0"><Button size="sm" variant="outline" onClick={() => { openEdit(c); setPreviewOpen(true); }}><Eye className="h-4 w-4 mr-1" /> Prévia</Button>{['draft','failed'].includes(c.status) && <><Button size="icon" variant="outline" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="outline" onClick={() => remove(c)}><Trash2 className="h-4 w-4 text-destructive" /></Button></>}</div></CardContent></Card>
      ))}</div>}

      <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto"><DialogHeader><DialogTitle>{editing ? "Editar campanha" : "Nova campanha"}</DialogTitle></DialogHeader><div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]"><div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3"><div><Label>Nome interno *</Label><Input value={form.name} onChange={e => setForm({...form,name:e.target.value})} placeholder="Novidades de junho" /></div><div><Label>Tipo</Label><Select value={form.campaign_type} onValueChange={v=>setForm({...form,campaign_type:v})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="update">Atualização</SelectItem><SelectItem value="announcement">Comunicado</SelectItem><SelectItem value="promotion">Promoção</SelectItem></SelectContent></Select></div></div>
        <div><Label>Público</Label><Select value={form.audience} onValueChange={v=>setForm({...form,audience:v})}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(audienceLabels).map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select><p className="text-xs mt-1 text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" /> {counting ? "Calculando…" : `${audienceCount} contato(s) autorizado(s)`}</p></div>
        <div><Label>Assunto *</Label><Input value={form.subject} maxLength={120} onChange={e=>setForm({...form,subject:e.target.value})} placeholder="Veja o que chegou ao Flux & Feed" /></div>
        <div><Label>Texto de prévia</Label><Input value={form.preview_text} maxLength={160} onChange={e=>setForm({...form,preview_text:e.target.value})} placeholder="A frase exibida ao lado do assunto na caixa de entrada" /></div>
        <div><Label>Título principal *</Label><Input value={form.heading} onChange={e=>setForm({...form,heading:e.target.value})} placeholder="Sua produção ficou ainda mais simples" /></div>
        <div><Label>Mensagem *</Label><Textarea rows={8} value={form.body} onChange={e=>setForm({...form,body:e.target.value})} placeholder="Escreva uma mensagem clara, humana e objetiva…" /></div>
        <div className="grid sm:grid-cols-2 gap-3"><div><Label>Texto do botão</Label><Input value={form.cta_label} onChange={e=>setForm({...form,cta_label:e.target.value})} placeholder="Conhecer novidade" /></div><div><Label>Link do botão</Label><Input value={form.cta_url} onChange={e=>setForm({...form,cta_url:e.target.value})} placeholder="https://fluxifeed.com/dashboard" /></div></div>
        <div><Label>Agendar (opcional)</Label><Input type="datetime-local" value={form.scheduled_at} onChange={e=>setForm({...form,scheduled_at:e.target.value})} /></div>
      </div><EmailPreview form={form} /></div>
      {editing && <div className="border-t pt-4 space-y-3"><Label>Enviar teste</Label><div className="flex gap-2"><Input type="email" value={testEmail} onChange={e=>setTestEmail(e.target.value)} placeholder="seu@email.com" /><Button variant="outline" onClick={sendTest} disabled={working || !testEmail}><Send className="h-4 w-4 mr-2" /> Testar</Button></div></div>}
      <DialogFooter className="gap-2"><Button variant="outline" onClick={()=>setPreviewOpen(true)}><Eye className="h-4 w-4 mr-2" /> Ampliar prévia</Button><Button variant="outline" onClick={save} disabled={!valid || working}>Salvar rascunho</Button>{editing && <Button onClick={()=>setConfirmOpen(true)} disabled={!provider.configured || audienceCount===0 || working}>{form.scheduled_at ? <CalendarClock className="h-4 w-4 mr-2" /> : <Send className="h-4 w-4 mr-2" />}{form.scheduled_at ? "Agendar" : "Enviar"}</Button>}</DialogFooter></DialogContent></Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}><DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Prévia do e-mail</DialogTitle></DialogHeader><EmailPreview form={form} large /></DialogContent></Dialog>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}><DialogContent><DialogHeader><DialogTitle>{form.scheduled_at ? "Confirmar agendamento" : "Confirmar envio"}</DialogTitle></DialogHeader><div className="space-y-4"><p className="text-sm text-muted-foreground">Esta ação enviará a campanha para <strong>{audienceCount} contato(s) autorizado(s)</strong>. Depois de processada, ela não poderá ser editada.</p><div><Label>Digite ENVIAR para confirmar</Label><Input value={confirmText} onChange={e=>setConfirmText(e.target.value.toUpperCase())} /></div></div><DialogFooter><Button variant="outline" onClick={()=>setConfirmOpen(false)}>Cancelar</Button><Button onClick={publish} disabled={confirmText!=="ENVIAR" || working}>{working && <Loader2 className="h-4 w-4 animate-spin mr-2" />}{form.scheduled_at ? "Confirmar agendamento" : "Confirmar envio"}</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

function EmailPreview({ form, large = false }: { form: typeof emptyForm; large?: boolean }) {
  return <div className={`rounded-xl bg-[#f4f4f6] p-3 ${large ? "min-h-[480px]" : "h-fit lg:sticky lg:top-2"}`}><div className="bg-white rounded-xl overflow-hidden shadow-sm max-w-xl mx-auto"><div className="bg-[#130712] text-white px-6 py-5 text-xl font-extrabold">Flux &amp; Feed</div><div className="p-6"><p className="text-[#f32ead] font-semibold text-sm mb-2">Olá, cliente!</p><h2 className="text-2xl font-bold leading-tight text-zinc-900">{form.heading || "Título da sua mensagem"}</h2><p className="mt-4 text-sm leading-6 text-zinc-600 whitespace-pre-line">{form.body || "O conteúdo aparecerá aqui enquanto você escreve."}</p>{form.cta_label && <span className="inline-block mt-6 rounded-lg bg-[#f32ead] text-white px-5 py-3 font-semibold text-sm">{form.cta_label}</span>}<div className="border-t mt-8 pt-4 text-[11px] text-zinc-500">Você recebeu esta mensagem porque autorizou novidades da Flux & Feed.<br/><span className="underline">Cancelar o recebimento</span></div></div></div></div>;
}
