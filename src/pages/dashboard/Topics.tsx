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
import {
  buildStarterTopicRows,
  type CreatorPackDefinition,
} from "@/lib/starterTopics";
import {
  Plus,
  Trash2,
  Sparkles,
  Edit,
  Loader2,
  BookOpen,
  Lightbulb,
  FileUp,
  FileText,
  Youtube,
  Zap,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Layers3,
  MessageCircle,
  PlayCircle,
  Target,
  Wand2,
  Search,
  Rocket,
} from "lucide-react";

const FORMATS = [
  { key: "dica", label: "Dica rápida", desc: "Lista de 3-5 dicas práticas" },
  { key: "mini_aula", label: "Mini-aula", desc: "Conceito explicado com exemplo" },
  { key: "pergunta", label: "Pergunta de engajamento", desc: "Gera comentários" },
  { key: "carrossel", label: "Carrossel", desc: "5-7 slides estruturados" },
  { key: "frase", label: "Frase / Citação", desc: "Frase impactante + explicação" },
  { key: "bastidor", label: "Bastidor", desc: "Processo, rotina e aprendizados reais" },
  { key: "lista", label: "Lista prática", desc: "Conteúdo escaneável e acionável" },
  { key: "mito_verdade", label: "Mito ou verdade", desc: "Quebra uma crença comum do nicho" },
  { key: "estudo_caso", label: "Estudo de caso", desc: "Contexto, decisão, resultado e lição" },
  { key: "oferta", label: "Oferta", desc: "Benefício, objeção e chamada para ação" },
  { key: "roteiro_reel", label: "Roteiro de Reel", desc: "Gancho, cenas curtas e CTA" },
];

const OBJECTIVES = [
  { value: "educar", label: "Educar" },
  { value: "engajar", label: "Engajar" },
  { value: "autoridade", label: "Gerar autoridade" },
  { value: "vender", label: "Vender" },
  { value: "entreter", label: "Entreter" },
  { value: "comunidade", label: "Fortalecer comunidade" },
];

const FUNNEL_STAGES = [
  { value: "descoberta", label: "Descoberta" },
  { value: "consideracao", label: "Consideração" },
  { value: "conversao", label: "Conversão" },
  { value: "retencao", label: "Retenção" },
];

const WEEK_DAYS = [
  { value: 1, label: "Seg" }, { value: 2, label: "Ter" }, { value: 3, label: "Qua" },
  { value: 4, label: "Qui" }, { value: 5, label: "Sex" }, { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];

const CREATOR_PACKS = [
  { key: "personal", title: "Marca pessoal", desc: "Autoridade, opinião e bastidores", topics: [
    ["Minha visão sobre uma tendência do nicho", "Autoridade", "autoridade", ["roteiro_reel", "carrossel"]],
    ["Erro que cometi e o que aprendi", "Bastidores", "comunidade", ["bastidor", "roteiro_reel"]],
    ["Método que uso no meu trabalho", "Educação", "educar", ["mini_aula", "carrossel"]],
  ] },
  { key: "business", title: "Negócio local", desc: "Confiança, prova e vendas locais", topics: [
    ["Dúvida mais comum antes de comprar", "Dúvidas", "educar", ["pergunta", "roteiro_reel"]],
    ["Como funciona nosso atendimento", "Bastidores", "autoridade", ["bastidor", "carrossel"]],
    ["Transformação entregue ao cliente", "Prova", "vender", ["estudo_caso", "oferta"]],
  ] },
  { key: "commerce", title: "Loja e e-commerce", desc: "Produtos, objeções e conversão", topics: [
    ["Como escolher o produto certo", "Guia de compra", "educar", ["lista", "carrossel"]],
    ["Produto em uso: benefício principal", "Produto", "vender", ["roteiro_reel", "oferta"]],
    ["Mito ou verdade sobre o produto", "Objeções", "engajar", ["mito_verdade", "pergunta"]],
  ] },
  { key: "expert", title: "Professor ou especialista", desc: "Aulas, método e autoridade", topics: [
    ["Conceito essencial explicado do zero", "Fundamentos", "educar", ["mini_aula", "carrossel"]],
    ["Exercício prático para aplicar hoje", "Prática", "engajar", ["lista", "roteiro_reel"]],
    ["Erro frequente dos iniciantes", "Erros", "autoridade", ["mito_verdade", "mini_aula"]],
  ] },
  { key: "creator", title: "Entretenimento e creator", desc: "Reação, opinião e comunidade", topics: [
    ["Opinião que divide o meu nicho", "Opinião", "engajar", ["pergunta", "roteiro_reel"]],
    ["Bastidores que o público não vê", "Bastidores", "comunidade", ["bastidor", "roteiro_reel"]],
    ["Lista dos meus favoritos do momento", "Curadoria", "entreter", ["lista", "carrossel"]],
  ] },
  { key: "service", title: "Prestador de serviço", desc: "Educação, casos e captação", topics: [
    ["Sinais de que a pessoa precisa deste serviço", "Diagnóstico", "educar", ["lista", "carrossel"]],
    ["Caso real: problema, solução e aprendizado", "Resultados", "autoridade", ["estudo_caso", "roteiro_reel"]],
    ["O que está incluso no atendimento", "Oferta", "vender", ["oferta", "carrossel"]],
  ] },
] as const satisfies readonly CreatorPackDefinition[];

const QUICK_STARTS = [
  {
    title: "Ideias rápidas",
    desc: "Crie um post único para testar um tema agora.",
    icon: Zap,
    action: "quick",
  },
  {
    title: "Vídeo vira pauta",
    desc: "Transforme um YouTube em vários conteúdos.",
    icon: Youtube,
    action: "youtube",
  },
  {
    title: "Material vira calendário",
    desc: "Importe PDF, aula, ebook ou apostila.",
    icon: FileText,
    action: "pdf",
  },
  {
    title: "Pauta recorrente",
    desc: "Cadastre um tema para o piloto reutilizar.",
    icon: CalendarDays,
    action: "topic",
  },
] as const;

const CONTENT_LANES = [
  { label: "Dicas", value: "dica", icon: Lightbulb },
  { label: "Mini-aulas", value: "mini_aula", icon: BookOpen },
  { label: "Perguntas", value: "pergunta", icon: MessageCircle },
  { label: "Carrosséis", value: "carrossel", icon: Layers3 },
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
  content_pillar: string | null;
  objective: string;
  target_audience: string | null;
  funnel_stage: string;
  tone: string | null;
  call_to_action: string | null;
  keywords: string[];
  frequency_per_week: number;
  preferred_days: number[];
  priority: number;
  evergreen: boolean;
  source_type: string;
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
  const [search, setSearch] = useState("");
  const [objectiveFilter, setObjectiveFilter] = useState("all");
  const [accountFilter, setAccountFilter] = useState("all");
  const [planOpen, setPlanOpen] = useState(false);
  const [selectedPack, setSelectedPack] = useState(CREATOR_PACKS[0].key as string);
  const [planAudience, setPlanAudience] = useState("");
  const [planTone, setPlanTone] = useState("");
  const [planAccount, setPlanAccount] = useState("all");
  const [planLoading, setPlanLoading] = useState(false);

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

  const openNew = () => { setEditing({
    title: "", notes: "", formats: ["dica", "mini_aula", "roteiro_reel"], active: true,
    instagram_account_id: null, content_pillar: "", objective: "educar", target_audience: "",
    funnel_stage: "descoberta", tone: "", call_to_action: "", keywords: [],
    frequency_per_week: 1, preferred_days: [], priority: 3, evergreen: true, source_type: "manual",
  }); setOpen(true); };
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
      content_pillar: editing.content_pillar?.trim() || null,
      objective: editing.objective || "educar",
      target_audience: editing.target_audience?.trim() || null,
      funnel_stage: editing.funnel_stage || "descoberta",
      tone: editing.tone?.trim() || null,
      call_to_action: editing.call_to_action?.trim() || null,
      keywords: editing.keywords || [],
      frequency_per_week: Math.max(1, Math.min(7, editing.frequency_per_week || 1)),
      preferred_days: editing.preferred_days || [],
      priority: Math.max(1, Math.min(5, editing.priority || 3)),
      evergreen: editing.evergreen !== false,
      source_type: editing.source_type || "manual",
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

  const toggleDay = (day: number) => {
    if (!editing) return;
    const current = editing.preferred_days || [];
    setEditing({ ...editing, preferred_days: current.includes(day) ? current.filter(d => d !== day) : [...current, day] });
  };

  const createStarterPlan = async () => {
    const pack = CREATOR_PACKS.find(item => item.key === selectedPack);
    if (!pack) return;
    setPlanLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirada");
      const rows = buildStarterTopicRows(pack.topics, {
        userId: user.id,
        targetAudience: planAudience.trim() || null,
        tone: planTone.trim() || null,
        instagramAccountId: planAccount === "all" ? null : planAccount,
      });
      const { error } = await supabase.from("content_topics").insert(rows);
      if (error) throw error;
      toast.success(`Plano criado com ${rows.length} pautas`);
      setPlanOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message || "Não foi possível criar o plano");
    } finally {
      setPlanLoading(false);
    }
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
    const { error } = await supabase.from("content_topics").insert(rows.map(row => ({ ...row, source_type: "pdf" })));
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
    const { error } = await supabase.from("content_topics").insert(rows.map(row => ({ ...row, source_type: "youtube" })));
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

  const activeTopics = topics.filter(t => t.active);
  const usedTopics = topics.filter(t => (t.use_count || 0) > 0);
  const nextTopic = activeTopics
    .slice()
    .sort((a, b) => new Date(a.last_used_at || 0).getTime() - new Date(b.last_used_at || 0).getTime())[0];
  const formatCounts = CONTENT_LANES.map(lane => ({
    ...lane,
    count: topics.filter(t => (t.formats || []).includes(lane.value)).length,
  }));
  const filteredTopics = topics.filter(topic => {
    const term = search.trim().toLowerCase();
    const matchesText = !term || [topic.title, topic.notes, topic.content_pillar, ...(topic.keywords || [])]
      .filter(Boolean).some(value => String(value).toLowerCase().includes(term));
    const matchesObjective = objectiveFilter === "all" || topic.objective === objectiveFilter;
    const matchesAccount = accountFilter === "all" ||
      (accountFilter === "shared" ? !topic.instagram_account_id : topic.instagram_account_id === accountFilter);
    return matchesText && matchesObjective && matchesAccount;
  });
  const runQuickStart = (action: typeof QUICK_STARTS[number]["action"]) => {
    if (action === "quick") {
      setQuickOpen(true);
      setQuickTheme("");
    } else if (action === "youtube") {
      setYtOpen(true);
      setYtSuggestions([]);
      setYtUrl("");
    } else if (action === "pdf") {
      setPdfOpen(true);
      setPdfSuggestions([]);
      setPdfFile(null);
    } else {
      openNew();
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="max-w-3xl">
          <Badge variant="outline" className="mb-3 border-primary/40 bg-primary/10 text-primary">
            <Sparkles className="h-3.5 w-3.5 mr-1" /> Central de conteúdo perene
          </Badge>
          <h1 className="text-3xl md:text-4xl font-display font-bold flex items-center gap-2">
            <BookOpen className="h-8 w-8 text-primary" /> Pautas
          </h1>
          <p className="text-muted-foreground mt-2 text-base">
            Planeje ideias que não dependem de notícia do dia: dicas, aulas, perguntas, bastidores e conteúdos de autoridade para alimentar o piloto automático.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => runQuickStart("quick")}>
            <Zap className="h-4 w-4 mr-2" /> Gerar avulso
          </Button>
          <Button variant="outline" onClick={() => setPlanOpen(true)}>
            <Rocket className="h-4 w-4 mr-2" /> Criar plano inicial
          </Button>
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Nova pauta</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {QUICK_STARTS.map(item => {
          const Icon = item.icon;
          return (
            <button
              key={item.title}
              type="button"
              onClick={() => runQuickStart(item.action)}
              className="group min-w-0 rounded-lg border border-border bg-card p-4 text-left transition hover:border-primary/50 hover:bg-primary/5"
            >
              <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="h-5 w-5" />
              </span>
              <span className="block break-words font-semibold leading-snug">{item.title}</span>
              <span className="mt-1 block break-words text-sm leading-snug text-muted-foreground">{item.desc}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card className="border-primary/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between gap-3 text-base">
              <span className="flex items-center gap-2"><Lightbulb className="h-4 w-4 text-primary" /> Geração automática</span>
              <Badge variant={enabled ? "default" : "secondary"}>{enabled ? "Ativa" : "Manual"}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="font-medium">Gerar conteúdos todos os dias</p>
                <p className="text-sm text-muted-foreground">Quando ligado, o autopiloto usa as pautas ativas sem misturar com a fila de notícias.</p>
              </div>
              <Switch checked={enabled} disabled={savingSettings} onCheckedChange={(v) => { setEnabled(v); saveSettings(v, postsPerDay); }} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border border-border bg-background/60 p-3">
                <p className="text-xs text-muted-foreground">Pautas ativas</p>
                <p className="mt-1 text-2xl font-bold">{activeTopics.length}</p>
              </div>
              <div className="rounded-md border border-border bg-background/60 p-3">
                <p className="text-xs text-muted-foreground">Posts por dia</p>
                <div className="mt-1 flex items-center gap-2">
                  <Input type="number" min={1} max={5} value={postsPerDay} className="h-9 w-20"
                    onChange={(e) => setPostsPerDay(Math.max(1, Math.min(5, parseInt(e.target.value) || 1)))}
                    onBlur={() => saveSettings(enabled, postsPerDay)} />
                </div>
              </div>
              <div className="rounded-md border border-border bg-background/60 p-3">
                <p className="text-xs text-muted-foreground">Próxima ideia</p>
                <p className="mt-1 truncate text-sm font-semibold">{nextTopic?.title || "Cadastre uma pauta"}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Target className="h-4 w-4 text-primary" /> Cobertura de formatos</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {formatCounts.map(item => {
              const Icon = item.icon;
              return (
                <div key={item.value} className="rounded-md border border-border bg-background/60 p-3">
                  <div className="flex items-center justify-between">
                    <Icon className="h-4 w-4 text-primary" />
                    <span className="text-lg font-bold">{item.count}</span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{item.label}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
      ) : topics.length === 0 ? (
        <Card className="overflow-hidden">
          <CardContent className="grid gap-6 p-0 md:grid-cols-[0.9fr_1.1fr]">
            <div className="bg-primary/10 p-6 md:p-8">
              <div className="flex h-14 w-14 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Wand2 className="h-7 w-7" />
              </div>
              <h2 className="mt-5 text-2xl font-bold">Monte sua primeira esteira de conteúdo</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Comece com um tema, um vídeo ou um PDF. Depois o Flux & Feed transforma isso em posts para aprovação.
              </p>
            </div>
            <div className="grid gap-3 p-6 md:grid-cols-2">
              {QUICK_STARTS.map(item => {
                const Icon = item.icon;
                return (
                  <Button key={item.title} variant="outline" className="h-auto min-w-0 justify-start gap-3 whitespace-normal p-4 text-left" onClick={() => runQuickStart(item.action)}>
                    <Icon className="h-5 w-5 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-semibold leading-snug">{item.title}</span>
                      <span className="block break-words text-xs font-normal leading-snug text-muted-foreground">{item.desc}</span>
                    </span>
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">Biblioteca de pautas</h2>
                <p className="text-sm text-muted-foreground">{topics.length} tema(s) cadastrados para reaproveitar.</p>
              </div>
              <Button variant="outline" onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Adicionar</Button>
            </div>
            <div className="grid gap-2 md:grid-cols-[1fr_190px_190px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} className="pl-9" placeholder="Buscar tema, pilar ou palavra-chave" />
              </div>
              <Select value={objectiveFilter} onValueChange={setObjectiveFilter}>
                <SelectTrigger><SelectValue placeholder="Objetivo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os objetivos</SelectItem>
                  {OBJECTIVES.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={accountFilter} onValueChange={setAccountFilter}>
                <SelectTrigger><SelectValue placeholder="Conta" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as contas</SelectItem>
                  <SelectItem value="shared">Pautas compartilhadas</SelectItem>
                  {igAccounts.map(a => <SelectItem key={a.id} value={a.id}>@{a.username}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {filteredTopics.length === 0 && (
              <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma pauta encontrada com esses filtros.</div>
            )}
            {filteredTopics.map(t => (
              <Card key={t.id} className={t.active ? "overflow-hidden" : "overflow-hidden opacity-60"}>
                <CardContent className="p-0">
                  <div className="flex items-stretch">
                    <div className="hidden w-1.5 bg-primary/70 sm:block" />
                    <div className="flex flex-1 flex-col gap-4 p-4 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold">{t.title}</h3>
                          <Badge variant={t.active ? "default" : "secondary"}>{t.active ? "Ativa" : "Inativa"}</Badge>
                          {t.content_pillar && <Badge variant="outline">{t.content_pillar}</Badge>}
                          <Badge variant="secondary">{OBJECTIVES.find(item => item.value === t.objective)?.label || t.objective}</Badge>
                          {t.instagram_account_id && (
                            <Badge variant="outline" className="text-xs">
                              @{igAccounts.find(a => a.id === t.instagram_account_id)?.username || "—"}
                            </Badge>
                          )}
                        </div>
                        {t.notes && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{t.notes}</p>}
                        <div className="flex gap-1 mt-3 flex-wrap">
                          {t.formats.map(f => (
                            <Badge key={f} variant="secondary" className="text-xs">{FORMATS.find(x => x.key === f)?.label || f}</Badge>
                          ))}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Usada {t.use_count || 0}x</span>
                          <span className="flex items-center gap-1"><Clock3 className="h-3.5 w-3.5" /> {t.last_used_at ? new Date(t.last_used_at).toLocaleDateString("pt-BR") : "Ainda não usada"}</span>
                          <span>{t.frequency_per_week || 1}x por semana</span>
                          <span>Prioridade {t.priority || 3}/5</span>
                        </div>
                      </div>
                      <div className="flex gap-2 md:justify-end">
                        <Button size="sm" onClick={() => generateNow(t)} disabled={generatingId === t.id}>
                          {generatingId === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><PlayCircle className="h-4 w-4 mr-1" /> Gerar</>}
                        </Button>
                        <Button size="icon" variant="outline" onClick={() => openEdit(t)}><Edit className="h-4 w-4" /></Button>
                        <Button size="icon" variant="outline" onClick={() => remove(t.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4 text-primary" /> Esteira da semana</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">Modo atual</p>
                  <p className="font-semibold">{enabled ? `${postsPerDay} pauta(s) por dia` : "Geração manual"}</p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">Pautas já testadas</p>
                  <p className="font-semibold">{usedTopics.length} de {topics.length}</p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs text-muted-foreground">Próximo tema sugerido</p>
                  <p className="line-clamp-2 font-semibold">{nextTopic?.title || "Cadastre uma pauta ativa"}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4 text-primary" /> Ações rápidas</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                <Button variant="outline" className="justify-start" onClick={() => runQuickStart("youtube")}>
                  <Youtube className="h-4 w-4 mr-2" /> Importar vídeo
                </Button>
                <Button variant="outline" className="justify-start" onClick={() => runQuickStart("pdf")}>
                  <FileUp className="h-4 w-4 mr-2" /> Importar PDF
                </Button>
                <Button variant="outline" className="justify-start" onClick={() => runQuickStart("quick")}>
                  <Zap className="h-4 w-4 mr-2" /> Gerar tema avulso
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Pilar de conteúdo</Label>
                <Input value={editing?.content_pillar || ""} onChange={e => setEditing({ ...editing!, content_pillar: e.target.value })} placeholder="Ex: Educação, bastidores, produto" />
              </div>
              <div>
                <Label>Objetivo</Label>
                <Select value={editing?.objective || "educar"} onValueChange={value => setEditing({ ...editing!, objective: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{OBJECTIVES.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Etapa do funil</Label>
                <Select value={editing?.funnel_stage || "descoberta"} onValueChange={value => setEditing({ ...editing!, funnel_stage: value })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{FUNNEL_STAGES.map(item => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Público específico</Label>
                <Input value={editing?.target_audience || ""} onChange={e => setEditing({ ...editing!, target_audience: e.target.value })} placeholder="Ex: mães de primeira viagem" />
              </div>
              <div>
                <Label>Tom desta pauta</Label>
                <Input value={editing?.tone || ""} onChange={e => setEditing({ ...editing!, tone: e.target.value })} placeholder="Ex: direto, acolhedor, bem-humorado" />
              </div>
              <div>
                <Label>Chamada para ação</Label>
                <Input value={editing?.call_to_action || ""} onChange={e => setEditing({ ...editing!, call_to_action: e.target.value })} placeholder="Ex: comente sua dúvida" />
              </div>
            </div>
            <div>
              <Label>Palavras-chave</Label>
              <Input value={(editing?.keywords || []).join(", ")} onChange={e => setEditing({ ...editing!, keywords: e.target.value.split(",").map(v => v.trim()).filter(Boolean) })} placeholder="marketing, vendas, instagram" />
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
              <div className="grid gap-2 mt-2 sm:grid-cols-2">
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
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Frequência semanal</Label>
                <Input type="number" min={1} max={7} value={editing?.frequency_per_week || 1}
                  onChange={e => setEditing({ ...editing!, frequency_per_week: Math.max(1, Math.min(7, Number(e.target.value) || 1)) })} />
              </div>
              <div>
                <Label>Prioridade (1 a 5)</Label>
                <Input type="number" min={1} max={5} value={editing?.priority || 3}
                  onChange={e => setEditing({ ...editing!, priority: Math.max(1, Math.min(5, Number(e.target.value) || 3)) })} />
              </div>
            </div>
            <div>
              <Label>Dias preferidos <span className="font-normal text-muted-foreground">(vazio = qualquer dia)</span></Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {WEEK_DAYS.map(day => (
                  <Button key={day.value} type="button" size="sm" variant={(editing?.preferred_days || []).includes(day.value) ? "default" : "outline"} onClick={() => toggleDay(day.value)}>
                    {day.label}
                  </Button>
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

      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Rocket className="h-5 w-5 text-primary" /> Criar plano inicial de conteúdo</DialogTitle>
          </DialogHeader>
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">Escolha o tipo de criador. O sistema cria uma base editável de pautas para começar — você pode misturar modelos e adicionar quantas ideias quiser.</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {CREATOR_PACKS.map(pack => (
                <button key={pack.key} type="button" onClick={() => setSelectedPack(pack.key)}
                  className={`rounded-lg border p-4 text-left transition ${selectedPack === pack.key ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"}`}>
                  <p className="font-semibold">{pack.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{pack.desc}</p>
                  <p className="mt-3 text-xs text-primary">{pack.topics.length} pautas iniciais</p>
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Quem você quer alcançar?</Label>
                <Input value={planAudience} onChange={e => setPlanAudience(e.target.value)} placeholder="Ex: pequenos empresários iniciantes" />
              </div>
              <div>
                <Label>Tom de voz</Label>
                <Input value={planTone} onChange={e => setPlanTone(e.target.value)} placeholder="Ex: simples, próximo e confiante" />
              </div>
            </div>
            {igAccounts.length > 0 && (
              <div>
                <Label>Aplicar o plano em</Label>
                <Select value={planAccount} onValueChange={setPlanAccount}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as contas</SelectItem>
                    {igAccounts.map(a => <SelectItem key={a.id} value={a.id}>@{a.username}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="rounded-lg border bg-secondary/30 p-4">
              <p className="text-sm font-semibold">Prévia das pautas</p>
              <div className="mt-2 space-y-2">
                {CREATOR_PACKS.find(pack => pack.key === selectedPack)?.topics.map((topic) => {
                  const [title, pillar, objective] = topic;
                  return (
                    <div key={title} className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="flex-1">{title}</span>
                      <Badge variant="outline">{pillar}</Badge>
                      <Badge variant="secondary">{OBJECTIVES.find(item => item.value === objective)?.label || objective}</Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPlanOpen(false)}>Cancelar</Button>
            <Button onClick={createStarterPlan} disabled={planLoading}>
              {planLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />} Criar plano
            </Button>
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
