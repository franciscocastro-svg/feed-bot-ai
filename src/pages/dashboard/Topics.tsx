import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2, Sparkles, Edit, Loader2, BookOpen, Lightbulb, FileUp, FileText, Youtube, Zap } from "lucide-react";

const FORMATS = [
  { key: "dica", label: "Dica rápida", desc: "Lista de 3-5 dicas práticas" },
  { key: "mini_aula", label: "Mini-aula", desc: "Conceito explicado com exemplo" },
  { key: "pergunta", label: "Pergunta de engajamento", desc: "Gera comentários" },
  { key: "carrossel", label: "Carrossel", desc: "5-7 slides estruturados" },
  { key: "frase", label: "Frase / Citação", desc: "Frase impactante + explicação" },
];

type Topic = {
  id: string;
  title: string;
  notes: string | null;
  formats: string[];
  active: boolean;
  instagram_account_id: string | null;
  last_used_at: string | null;
  use_count: number;
};

type IgAccount = { id: string; username: string };

export default function Topics() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [igAccounts, setIgAccounts] = useState<IgAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [postsPerDay, setPostsPerDay] = useState(1);
  const [savingSettings, setSavingSettings] = useState(false);
  const [editing, setEditing] = useState<Partial<Topic> | null>(null);
  const [open, setOpen] = useState(false);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfCount, setPdfCount] = useState(10);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfSuggestions, setPdfSuggestions] = useState<{ title: string; notes?: string; formats?: string[] }[]>([]);
  const [pdfSelected, setPdfSelected] = useState<Set<number>>(new Set());
  // YouTube
  const [ytOpen, setYtOpen] = useState(false);
  const [ytUrl, setYtUrl] = useState("");
  const [ytCount, setYtCount] = useState(10);
  const [ytLoading, setYtLoading] = useState(false);
  const [ytSuggestions, setYtSuggestions] = useState<{ title: string; notes?: string; formats?: string[] }[]>([]);
  const [ytSelected, setYtSelected] = useState<Set<number>>(new Set());
  // Geração avulsa
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickTheme, setQuickTheme] = useState("");
  const [quickFormat, setQuickFormat] = useState("dica");
  const [quickLoading, setQuickLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const [t, ig, us] = await Promise.all([
      supabase.from("content_topics").select("*").order("created_at", { ascending: false }),
      supabase.from("instagram_accounts").select("id, username").eq("active", true),
      supabase.from("user_settings").select("topics_enabled, topics_posts_per_day").maybeSingle(),
    ]);
    setTopics((t.data as Topic[]) || []);
    setIgAccounts((ig.data as IgAccount[]) || []);
    setEnabled(!!us.data?.topics_enabled);
    setPostsPerDay(us.data?.topics_posts_per_day || 1);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const saveSettings = async (nextEnabled: boolean, nextPpd: number) => {
    setSavingSettings(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSavingSettings(false); return; }
    const { error } = await supabase.from("user_settings")
      .update({ topics_enabled: nextEnabled, topics_posts_per_day: nextPpd })
      .eq("user_id", user.id);
    if (error) toast.error("Erro ao salvar"); else toast.success("Configurações salvas");
    setSavingSettings(false);
  };

  const openNew = () => { setEditing({ title: "", notes: "", formats: ["dica", "mini_aula", "pergunta"], active: true, instagram_account_id: null }); setOpen(true); };
  const openEdit = (t: Topic) => { setEditing(t); setOpen(true); };

  const save = async () => {
    if (!editing?.title?.trim()) { toast.error("Título obrigatório"); return; }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const payload = {
      user_id: user.id,
      title: editing.title.trim(),
      notes: editing.notes || null,
      formats: editing.formats && editing.formats.length ? editing.formats : ["dica"],
      active: editing.active !== false,
      instagram_account_id: editing.instagram_account_id || null,
    };
    const res = editing.id
      ? await supabase.from("content_topics").update(payload).eq("id", editing.id)
      : await supabase.from("content_topics").insert(payload);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success(editing.id ? "Pauta atualizada" : "Pauta criada");
    setOpen(false); setEditing(null); load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esta pauta?")) return;
    const { error } = await supabase.from("content_topics").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Excluída"); load(); }
  };

  const generateNow = async (t: Topic) => {
    setGeneratingId(t.id);
    try {
      const { data, error } = await supabase.functions.invoke("generate-from-topic", {
        body: { topic_id: t.id },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Conteúdo gerado! Veja em Notícias.");
      load();
    } catch (e: any) {
      toast.error(`Falha: ${e.message || e}`);
    } finally {
      setGeneratingId(null);
    }
  };

  const toggleFormat = (key: string) => {
    if (!editing) return;
    const cur = editing.formats || [];
    setEditing({ ...editing, formats: cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key] });
  };

  const extractFromPdf = async () => {
    if (!pdfFile) { toast.error("Selecione um PDF"); return; }
    if (pdfFile.size > 10 * 1024 * 1024) { toast.error("PDF muito grande (máx 10 MB)"); return; }
    setPdfLoading(true);
    try {
      const buf = await pdfFile.arrayBuffer();
      const bytes = new Uint8Array(buf);
      // base64 em chunks pra não estourar call stack
      let binary = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
      const base64 = btoa(binary);
      const { data, error } = await supabase.functions.invoke("extract-topics-from-pdf", {
        body: { pdf_base64: base64, count: pdfCount },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const topics = (data as any)?.topics || [];
      if (topics.length === 0) { toast.error("Nenhuma pauta sugerida"); return; }
      setPdfSuggestions(topics);
      setPdfSelected(new Set(topics.map((_: any, i: number) => i)));
      toast.success(`${topics.length} pautas sugeridas`);
    } catch (e: any) {
      toast.error(`Falha: ${e.message || e}`);
    } finally {
      setPdfLoading(false);
    }
  };

  const importSelectedPautas = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const rows = pdfSuggestions
      .filter((_, i) => pdfSelected.has(i))
      .map(s => ({
        user_id: user.id,
        title: s.title,
        notes: s.notes || null,
        formats: (Array.isArray(s.formats) && s.formats.length ? s.formats : ["dica", "mini_aula"]),
        active: true,
      }));
    if (rows.length === 0) { toast.error("Selecione ao menos uma"); return; }
    const { error } = await supabase.from("content_topics").insert(rows);
    if (error) { toast.error(error.message); return; }
    toast.success(`${rows.length} pautas importadas`);
    setPdfOpen(false); setPdfFile(null); setPdfSuggestions([]); setPdfSelected(new Set());
    load();
  };

  // YouTube → pautas
  const extractFromYoutube = async () => {
    if (!ytUrl.trim()) { toast.error("Cole a URL do vídeo"); return; }
    setYtLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("extract-from-youtube", {
        body: { video_url: ytUrl.trim(), count: ytCount },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      const topics = (data as any)?.topics || [];
      if (topics.length === 0) { toast.error("Nenhuma pauta sugerida"); return; }
      setYtSuggestions(topics);
      setYtSelected(new Set(topics.map((_: any, i: number) => i)));
      toast.success(`${topics.length} pautas extraídas do vídeo`);
    } catch (e: any) {
      toast.error(`Falha: ${e.message || e}`);
    } finally { setYtLoading(false); }
  };

  const importYoutubePautas = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const rows = ytSuggestions.filter((_, i) => ytSelected.has(i)).map(s => ({
      user_id: user.id,
      title: s.title,
      notes: s.notes || null,
      formats: (Array.isArray(s.formats) && s.formats.length ? s.formats : ["dica", "mini_aula"]),
      active: true,
    }));
    if (rows.length === 0) { toast.error("Selecione ao menos uma"); return; }
    const { error } = await supabase.from("content_topics").insert(rows);
    if (error) { toast.error(error.message); return; }
    toast.success(`${rows.length} pautas importadas`);
    setYtOpen(false); setYtUrl(""); setYtSuggestions([]); setYtSelected(new Set());
    load();
  };

  // Geração avulsa por tema
  const quickGenerate = async () => {
    if (quickTheme.trim().length < 3) { toast.error("Digite um tema (mín. 3 caracteres)"); return; }
    setQuickLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-from-prompt", {
        body: { theme: quickTheme.trim(), format: quickFormat },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Post gerado! Veja em Notícias.");
      setQuickOpen(false); setQuickTheme("");
    } catch (e: any) {
      toast.error(`Falha: ${e.message || e}`);
    } finally { setQuickLoading(false); }
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-bold flex items-center gap-2"><BookOpen className="h-7 w-7" /> Pautas</h1>
          <p className="text-muted-foreground mt-1">Conteúdo perene (dicas, aulas, perguntas) gerado a partir de temas que você cadastra. Funciona em paralelo com as notícias.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => { setQuickOpen(true); setQuickTheme(""); }}>
            <Zap className="h-4 w-4 mr-2" /> Gerar avulso
          </Button>
          <Button variant="outline" onClick={() => { setYtOpen(true); setYtSuggestions([]); setYtUrl(""); }}>
            <Youtube className="h-4 w-4 mr-2" /> Importar de YouTube
          </Button>
          <Button variant="outline" onClick={() => { setPdfOpen(true); setPdfSuggestions([]); setPdfFile(null); }}>
            <FileUp className="h-4 w-4 mr-2" /> Importar de PDF
          </Button>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Nova pauta</Button>
        </div>
      </div>

      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Lightbulb className="h-4 w-4 text-primary" /> Geração automática</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="font-medium">Ativar geração diária a partir das pautas</p>
              <p className="text-sm text-muted-foreground">Desligado por padrão. Quando ligado, o sistema cria conteúdos automaticamente todos os dias.</p>
            </div>
            <Switch checked={enabled} disabled={savingSettings} onCheckedChange={(v) => { setEnabled(v); saveSettings(v, postsPerDay); }} />
          </div>
          {enabled && (
            <div className="flex items-center gap-3">
              <Label className="text-sm">Posts por dia (pautas):</Label>
              <Input type="number" min={1} max={5} value={postsPerDay} className="w-24"
                onChange={(e) => setPostsPerDay(Math.max(1, Math.min(5, parseInt(e.target.value) || 1)))}
                onBlur={() => saveSettings(enabled, postsPerDay)} />
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
      ) : topics.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>Nenhuma pauta cadastrada ainda.</p>
          <p className="text-sm mt-1">Adicione temas do seu nicho (ex: "Função do 2º grau", "Como economizar no mercado") e o sistema gera posts a partir deles.</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {topics.map(t => (
            <Card key={t.id} className={t.active ? "" : "opacity-60"}>
              <CardContent className="py-4 flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{t.title}</h3>
                    {!t.active && <Badge variant="secondary">Inativa</Badge>}
                    {t.instagram_account_id && (
                      <Badge variant="outline" className="text-xs">
                        @{igAccounts.find(a => a.id === t.instagram_account_id)?.username || "—"}
                      </Badge>
                    )}
                  </div>
                  {t.notes && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{t.notes}</p>}
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {t.formats.map(f => (
                      <Badge key={f} variant="secondary" className="text-xs">{FORMATS.find(x => x.key === f)?.label || f}</Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Usada {t.use_count}× {t.last_used_at && `· última: ${new Date(t.last_used_at).toLocaleDateString("pt-BR")}`}</p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => generateNow(t)} disabled={generatingId === t.id}>
                    {generatingId === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Sparkles className="h-4 w-4 mr-1" /> Gerar agora</>}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => openEdit(t)}><Edit className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing?.id ? "Editar pauta" : "Nova pauta"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Título da pauta *</Label>
              <Input value={editing?.title || ""} onChange={(e) => setEditing({ ...editing!, title: e.target.value })} placeholder="Ex: Função do 2º grau" />
            </div>
            <div>
              <Label>Contexto / observações (opcional)</Label>
              <Textarea value={editing?.notes || ""} onChange={(e) => setEditing({ ...editing!, notes: e.target.value })}
                placeholder="Ex: público de ensino médio, foco em ENEM, evitar fórmulas complexas..." rows={3} />
            </div>
            {igAccounts.length > 1 && (
              <div>
                <Label>Conta Instagram (opcional)</Label>
                <Select value={editing?.instagram_account_id || "all"} onValueChange={(v) => setEditing({ ...editing!, instagram_account_id: v === "all" ? null : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as contas</SelectItem>
                    {igAccounts.map(a => <SelectItem key={a.id} value={a.id}>@{a.username}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Formatos permitidos</Label>
              <div className="grid gap-2 mt-2">
                {FORMATS.map(f => (
                  <label key={f.key} className="flex items-start gap-3 p-2 rounded border border-border cursor-pointer hover:bg-secondary/50">
                    <input type="checkbox" className="mt-1" checked={(editing?.formats || []).includes(f.key)} onChange={() => toggleFormat(f.key)} />
                    <div>
                      <div className="font-medium text-sm">{f.label}</div>
                      <div className="text-xs text-muted-foreground">{f.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Pauta ativa</Label>
              <Switch checked={editing?.active !== false} onCheckedChange={(v) => setEditing({ ...editing!, active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pdfOpen} onOpenChange={setPdfOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5" /> Importar pautas de um PDF</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Faça upload de uma apostila, ebook ou material didático. A IA vai sugerir pautas relevantes que você pode importar com 1 clique.</p>
            <div>
              <Label>Arquivo PDF (até 10 MB, com texto selecionável)</Label>
              <Input type="file" accept="application/pdf" onChange={(e) => setPdfFile(e.target.files?.[0] || null)} />
            </div>
            <div className="flex items-center gap-3">
              <Label className="text-sm">Quantas pautas sugerir:</Label>
              <Input type="number" min={3} max={30} value={pdfCount} className="w-24"
                onChange={(e) => setPdfCount(Math.max(3, Math.min(30, parseInt(e.target.value) || 10)))} />
            </div>
            {pdfSuggestions.length === 0 ? (
              <Button className="w-full" disabled={!pdfFile || pdfLoading} onClick={extractFromPdf}>
                {pdfLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Analisando…</> : <><Sparkles className="h-4 w-4 mr-2" /> Analisar PDF</>}
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{pdfSuggestions.length} pautas sugeridas — selecione:</p>
                  <Button size="sm" variant="ghost" onClick={() => setPdfSelected(pdfSelected.size === pdfSuggestions.length ? new Set() : new Set(pdfSuggestions.map((_, i) => i)))}>
                    {pdfSelected.size === pdfSuggestions.length ? "Limpar" : "Todas"}
                  </Button>
                </div>
                <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                  {pdfSuggestions.map((s, i) => (
                    <label key={i} className="flex items-start gap-3 p-3 rounded border border-border cursor-pointer hover:bg-secondary/50">
                      <input type="checkbox" className="mt-1" checked={pdfSelected.has(i)} onChange={() => {
                        const next = new Set(pdfSelected);
                        if (next.has(i)) next.delete(i); else next.add(i);
                        setPdfSelected(next);
                      }} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{s.title}</div>
                        {s.notes && <div className="text-xs text-muted-foreground mt-1">{s.notes}</div>}
                        {s.formats && s.formats.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {s.formats.map(f => <Badge key={f} variant="secondary" className="text-xs">{FORMATS.find(x => x.key === f)?.label || f}</Badge>)}
                          </div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPdfOpen(false)}>Fechar</Button>
            {pdfSuggestions.length > 0 && (
              <Button onClick={importSelectedPautas}>Importar {pdfSelected.size} pauta(s)</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* YouTube → pautas */}
      <Dialog open={ytOpen} onOpenChange={setYtOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Youtube className="h-5 w-5" /> Importar pautas de um vídeo do YouTube</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Cole a URL de um vídeo (com legenda/transcrição automática disponível). A IA vai extrair pautas que você pode importar com 1 clique.</p>
            <div>
              <Label>URL do vídeo</Label>
              <Input value={ytUrl} onChange={(e) => setYtUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." />
            </div>
            <div className="flex items-center gap-3">
              <Label className="text-sm">Quantas pautas:</Label>
              <Input type="number" min={3} max={30} value={ytCount} className="w-24"
                onChange={(e) => setYtCount(Math.max(3, Math.min(30, parseInt(e.target.value) || 10)))} />
            </div>
            {ytSuggestions.length === 0 ? (
              <Button className="w-full" disabled={!ytUrl.trim() || ytLoading} onClick={extractFromYoutube}>
                {ytLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Lendo transcrição…</> : <><Sparkles className="h-4 w-4 mr-2" /> Analisar vídeo</>}
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">{ytSuggestions.length} pautas — selecione:</p>
                  <Button size="sm" variant="ghost" onClick={() => setYtSelected(ytSelected.size === ytSuggestions.length ? new Set() : new Set(ytSuggestions.map((_, i) => i)))}>
                    {ytSelected.size === ytSuggestions.length ? "Limpar" : "Todas"}
                  </Button>
                </div>
                <div className="space-y-2 max-h-[40vh] overflow-y-auto">
                  {ytSuggestions.map((s, i) => (
                    <label key={i} className="flex items-start gap-3 p-3 rounded border border-border cursor-pointer hover:bg-secondary/50">
                      <input type="checkbox" className="mt-1" checked={ytSelected.has(i)} onChange={() => {
                        const next = new Set(ytSelected);
                        if (next.has(i)) next.delete(i); else next.add(i);
                        setYtSelected(next);
                      }} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{s.title}</div>
                        {s.notes && <div className="text-xs text-muted-foreground mt-1">{s.notes}</div>}
                        {s.formats && s.formats.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {s.formats.map(f => <Badge key={f} variant="secondary" className="text-xs">{FORMATS.find(x => x.key === f)?.label || f}</Badge>)}
                          </div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setYtOpen(false)}>Fechar</Button>
            {ytSuggestions.length > 0 && (
              <Button onClick={importYoutubePautas}>Importar {ytSelected.size} pauta(s)</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Geração avulsa */}
      <Dialog open={quickOpen} onOpenChange={setQuickOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Zap className="h-5 w-5" /> Gerar post avulso</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Digite um tema livre e a IA gera o post na hora, sem precisar cadastrar pauta. Vai pra fila de Notícias pendentes pra você aprovar.</p>
            <div>
              <Label>Tema</Label>
              <Textarea value={quickTheme} onChange={(e) => setQuickTheme(e.target.value)}
                placeholder="Ex: 3 erros que iniciantes cometem ao começar a investir" rows={3} />
            </div>
            <div>
              <Label>Formato</Label>
              <Select value={quickFormat} onValueChange={setQuickFormat}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FORMATS.map(f => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setQuickOpen(false)}>Cancelar</Button>
            <Button onClick={quickGenerate} disabled={quickLoading}>
              {quickLoading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gerando…</> : <><Sparkles className="h-4 w-4 mr-2" /> Gerar agora</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
