import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Rss, Trash2, RefreshCw, Loader2, Pencil, Sparkles, Instagram, CheckCircle2, AlertTriangle, XCircle, Play, UserRound, Hash, Link as LinkIcon, Newspaper } from "lucide-react";
import { toast } from "sonner";
import { UpgradeModal } from "@/components/UpgradeModal";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type SourceMode = "rss" | "person" | "topic" | "url";

const sourceModeOptions: Array<{ value: SourceMode; label: string; description: string; icon: any }> = [
  { value: "rss", label: "RSS/Site", description: "Feed direto de notícia ou blog", icon: Rss },
  { value: "person", label: "Pessoa", description: "Famoso, atleta, político, artista", icon: UserRound },
  { value: "topic", label: "Tema", description: "Assunto, nicho ou palavra-chave", icon: Hash },
  { value: "url", label: "URL", description: "Monitorar um site ou página", icon: LinkIcon },
];

const googleNewsSearchUrl = (query: string) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(query.trim())}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;

const getHostname = (value: string) => {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

const isLikelyFeedUrl = (value: string) => {
  try {
    const url = new URL(value);
    return /rss|feed|xml/i.test(`${url.pathname}${url.search}`);
  } catch {
    return false;
  }
};

const cleanLabelPrefix = (value?: string | null) => {
  if (!value) return "";
  return value.replace(/^(Pessoa|Tema|URL|RSS):\s*/i, "");
};

export default function Sources() {
  const [sources, setSources] = useState<any[]>([]);
  const [translationEnabled, setTranslationEnabled] = useState(false);
  const [planName, setPlanName] = useState<string>("");
  const [igAccounts, setIgAccounts] = useState<any[]>([]);
  const [sourceIgMap, setSourceIgMap] = useState<Record<string, string[]>>({});
  const [open, setOpen] = useState(false);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoverNiche, setDiscoverNiche] = useState("");
  const [discoverIgIds, setDiscoverIgIds] = useState<string[]>([]);
  const [fetching, setFetching] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sourceMode, setSourceMode] = useState<SourceMode>("rss");
  const [smartInput, setSmartInput] = useState("");
  const [form, setForm] = useState({ name: "", url: "", niche: "", fetch_interval_minutes: 60, ig_ids: [] as string[], source_language: "auto", translate_to_pt: false, cultural_adaptation: false });
  const [upgrade, setUpgrade] = useState<{ open: boolean; used?: number; limit?: number }>({ open: false });
  const [validating, setValidating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [perSourceFetching, setPerSourceFetching] = useState<string | null>(null);

  const openEdit = (s: any) => {
    setEditingId(s.id);
    const niche = s.niche || "";
    if (/^Pessoa:/i.test(niche)) {
      setSourceMode("person");
      setSmartInput(cleanLabelPrefix(niche));
    } else if (/^Tema:/i.test(niche)) {
      setSourceMode("topic");
      setSmartInput(cleanLabelPrefix(niche));
    } else if (/^URL:/i.test(niche)) {
      setSourceMode("url");
      setSmartInput(s.url || "");
    } else {
      setSourceMode("rss");
      setSmartInput("");
    }
    setForm({
      name: s.name, url: s.url, niche: s.niche || "",
      fetch_interval_minutes: s.fetch_interval_minutes,
      ig_ids: sourceIgMap[s.id] || [],
      source_language: s.source_language || "auto",
      translate_to_pt: !!s.translate_to_pt,
      cultural_adaptation: !!s.cultural_adaptation,
    });
    setOpen(true);
  };

  const openNew = () => {
    setEditingId(null);
    setSourceMode("rss");
    setSmartInput("");
    setForm({ name: "", url: "", niche: "", fetch_interval_minutes: 60, ig_ids: igAccounts.length === 1 ? [igAccounts[0].id] : [], source_language: "auto", translate_to_pt: false, cultural_adaptation: false });
    setOpen(true);
  };

  const buildSourcePayload = () => {
    const base = {
      fetch_interval_minutes: form.fetch_interval_minutes,
      source_language: form.source_language,
      translate_to_pt: form.translate_to_pt,
      cultural_adaptation: form.cultural_adaptation,
    };

    if (sourceMode === "person") {
      const person = smartInput.trim();
      return {
        ...base,
        name: form.name.trim() || person,
        url: googleNewsSearchUrl(`"${person}"`),
        niche: `Pessoa: ${person}`,
      };
    }

    if (sourceMode === "topic") {
      const topic = smartInput.trim();
      return {
        ...base,
        name: form.name.trim() || topic,
        url: googleNewsSearchUrl(topic),
        niche: `Tema: ${topic}`,
      };
    }

    if (sourceMode === "url") {
      const url = form.url.trim();
      const host = getHostname(url);
      const generatedUrl = isLikelyFeedUrl(url) ? url : googleNewsSearchUrl(`site:${host || url}`);
      return {
        ...base,
        name: form.name.trim() || host || "Fonte por URL",
        url: generatedUrl,
        niche: `URL: ${host || url}`,
      };
    }

    return {
      ...base,
      name: form.name.trim(),
      url: form.url.trim(),
      niche: form.niche.trim() ? `RSS: ${form.niche.trim()}` : "",
    };
  };

  const syncLinks = async (sourceId: string, userId: string, igIds: string[]) => {
    await supabase.from("news_source_instagram_accounts").delete().eq("source_id", sourceId);
    if (igIds.length > 0) {
      await supabase.from("news_source_instagram_accounts").insert(
        igIds.map(ig => ({ source_id: sourceId, instagram_account_id: ig, user_id: userId }))
      );
    }
  };

  const save = async () => {
    if (sourceMode === "person" && !smartInput.trim()) return toast.error("Digite o nome da pessoa");
    if (sourceMode === "topic" && !smartInput.trim()) return toast.error("Digite o tema");
    if ((sourceMode === "rss" || sourceMode === "url") && !form.url.trim()) return toast.error("Preencha a URL");
    if (sourceMode === "rss" && !form.name.trim()) return toast.error("Preencha o nome da fonte");
    if (form.ig_ids.length === 0) return toast.error("Selecione pelo menos um Instagram");
    if (sourceMode === "url") {
      try {
        new URL(form.url.trim());
      } catch {
        return toast.error("Digite uma URL válida");
      }
    }
    const payload = buildSourcePayload();
    try {
      new URL(payload.url);
    } catch {
      return toast.error("URL inválida");
    }
    setValidating(true);
    const { data: validation, error: vErr } = await supabase.functions.invoke("fetch-rss", { body: { validate_url: payload.url } });
    setValidating(false);
    if (vErr) return toast.error("Não foi possível validar o feed: " + vErr.message);
    if (!validation?.valid) return toast.error("Fonte sem conteúdo captável: " + (validation?.error || "sem itens encontrados"));
    toast.success(`Fonte válida! ${validation.items_count} itens encontrados.`);

    const { data: { user } } = await supabase.auth.getUser();
    if (editingId) {
      const { error } = await supabase.from("news_sources").update({
        name: payload.name, url: payload.url, niche: payload.niche, fetch_interval_minutes: payload.fetch_interval_minutes,
        source_language: payload.source_language, translate_to_pt: payload.translate_to_pt, cultural_adaptation: payload.cultural_adaptation,
      }).eq("id", editingId);
      if (error) return toast.error(error.message);
      await syncLinks(editingId, user!.id, form.ig_ids);
      toast.success("Fonte atualizada");
    } else {
      const { data: check } = await supabase.rpc("can_create_resource", {
        _user_id: user!.id, _resource: "rss_source",
      });
      const c = check as any;
      if (c && !c.allowed) {
        setOpen(false);
        setUpgrade({ open: true, used: c.used, limit: c.limit });
        return;
      }
      const { data: inserted, error } = await supabase.from("news_sources").insert({
        name: payload.name, url: payload.url, niche: payload.niche, fetch_interval_minutes: payload.fetch_interval_minutes,
        source_language: payload.source_language, translate_to_pt: payload.translate_to_pt, cultural_adaptation: payload.cultural_adaptation,
        user_id: user!.id,
      }).select("id").single();
      if (error) return toast.error(error.message);
      await syncLinks(inserted.id, user!.id, form.ig_ids);
      toast.success("Fonte adicionada");
    }
    setOpen(false);
    setEditingId(null);
    setSourceMode("rss");
    setSmartInput("");
    setForm({ name: "", url: "", niche: "", fetch_interval_minutes: 60, ig_ids: [], source_language: "auto", translate_to_pt: false, cultural_adaptation: false });
    load();
  };

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [{ data: srcs }, { data: igs }, { data: links }, { data: limits }] = await Promise.all([
      supabase.from("news_sources").select("*").order("created_at", { ascending: false }),
      supabase.from("instagram_accounts").select("id, username, active").eq("active", true).order("created_at"),
      supabase.from("news_source_instagram_accounts").select("source_id, instagram_account_id"),
      supabase.rpc("get_user_plan_limits", { _user_id: user.id }),
    ]);
    setSources(srcs || []);
    setIgAccounts(igs || []);
    const map: Record<string, string[]> = {};
    (links || []).forEach((l: any) => {
      if (!map[l.source_id]) map[l.source_id] = [];
      map[l.source_id].push(l.instagram_account_id);
    });
    setSourceIgMap(map);
    const row: any = Array.isArray(limits) ? limits[0] : limits;
    setTranslationEnabled(!!row?.translation_enabled);
    setPlanName(row?.display_name || row?.plan || "");
  };
  useEffect(() => { load(); }, []);


  const toggle = async (id: string, active: boolean) => {
    await supabase.from("news_sources").update({ active }).eq("id", id);
    load();
  };

  const remove = async (id: string) => {
    await supabase.from("news_sources").delete().eq("id", id);
    toast.success("Removida");
    setConfirmDelete(null);
    load();
  };

  const updateInterval = async (id: string, minutes: number) => {
    const { error } = await supabase.from("news_sources").update({ fetch_interval_minutes: minutes }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Frequência: a cada ${minutes} min`);
    load();
  };

  const INTERVAL_OPTIONS = [5, 10, 15, 30, 60, 120, 180, 360, 720, 1440];

  const fetchNow = async () => {
    setFetching(true);
    const { data, error } = await supabase.functions.invoke("fetch-rss", { body: { force: true } });
    setFetching(false);
    if (error) return toast.error(error.message);
    toast.success(`${data?.fetched || 0} conteúdos captados`);
    load();
  };

  const fetchOne = async (sourceId: string) => {
    setPerSourceFetching(sourceId);
    const { data, error } = await supabase.functions.invoke("fetch-rss", { body: { force: true, source_id: sourceId } });
    setPerSourceFetching(null);
    if (error) return toast.error(error.message);
    toast.success(`${data?.fetched || 0} conteúdos captados desta fonte`);
    load();
  };

  // Saúde da fonte: ok / warning / error
  const sourceHealth = (s: any): { status: "ok" | "warning" | "error"; label: string } => {
    if (!s.active) return { status: "warning", label: "Inativa" };
    if (!s.last_fetched_at) return { status: "warning", label: "Nunca captada" };
    const ageMin = (Date.now() - new Date(s.last_fetched_at).getTime()) / 60000;
    const expected = (s.fetch_interval_minutes || 60) * 3;
    if (ageMin > 1440) return { status: "error", label: "Sem captar há +24h" };
    if (ageMin > expected) return { status: "warning", label: "Atrasada" };
    return { status: "ok", label: "Saudável" };
  };

  const sourceKind = (s: any): { label: string; icon: any } => {
    const niche = String(s.niche || "");
    if (/^Pessoa:/i.test(niche)) return { label: "Pessoa", icon: UserRound };
    if (/^Tema:/i.test(niche)) return { label: "Tema", icon: Hash };
    if (/^URL:/i.test(niche)) return { label: "URL", icon: LinkIcon };
    return { label: "RSS", icon: Rss };
  };

  const discover = async () => {
    if (!discoverNiche.trim()) return toast.error("Digite um nicho");
    if (discoverIgIds.length === 0) return toast.error("Selecione ao menos um IG para vincular");
    setDiscovering(true);
    const { data, error } = await supabase.functions.invoke("discover-rss", {
      body: { niche: discoverNiche.trim(), ig_ids: discoverIgIds },
    });
    setDiscovering(false);
    if (error) return toast.error(error.message);
    if (!data?.inserted) {
      toast.warning(`Nenhum feed novo encontrado (${data?.valid || 0} válidos, já cadastrados).`);
    } else {
      toast.success(`${data.inserted} fontes adicionadas automaticamente!`);
    }
    setDiscoverOpen(false);
    setDiscoverNiche("");
    setDiscoverIgIds([]);
    load();
  };

  const igPicker = (selected: string[], onChange: (ids: string[]) => void) => {
    if (igAccounts.length === 0) {
      return (
        <p className="text-sm text-muted-foreground p-3 bg-muted rounded">
          Você não tem nenhum Instagram conectado. Adicione um em <strong>Contas Instagram</strong> antes.
        </p>
      );
    }
    return (
      <div className="space-y-2 border rounded-md p-3 max-h-48 overflow-y-auto">
        {igAccounts.map(ig => {
          const checked = selected.includes(ig.id);
          return (
            <label key={ig.id} className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={checked}
                onCheckedChange={v => {
                  if (v) onChange([...selected, ig.id]);
                  else onChange(selected.filter(x => x !== ig.id));
                }}
              />
              <Instagram className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">@{ig.username}</span>
            </label>
          );
        })}
      </div>
    );
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-5xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold">Fontes de conteúdo</h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">RSS, sites, pessoas, temas e URLs. Cada fonte alimenta os IGs vinculados.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={fetchNow} disabled={fetching} className="flex-1 sm:flex-none">
            {fetching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Captar agora
          </Button>
          <Dialog open={discoverOpen} onOpenChange={(v) => { setDiscoverOpen(v); if (!v) setDiscoverIgIds([]); }}>
            <DialogTrigger asChild>
              <Button variant="secondary" className="flex-1 sm:flex-none">
                <Sparkles className="h-4 w-4 mr-2" /> Descobrir por nicho
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Descobrir RSS automaticamente</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Digite um nicho e a IA vai buscar e cadastrar os melhores feeds RSS brasileiros sobre o tema.
                </p>
                <div>
                  <Label>Nicho</Label>
                  <Input
                    value={discoverNiche}
                    onChange={e => setDiscoverNiche(e.target.value)}
                    placeholder="ex: tecnologia, economia, esportes, cripto..."
                    onKeyDown={e => e.key === "Enter" && !discovering && discover()}
                  />
                </div>
                <div>
                  <Label>Vincular aos Instagram</Label>
                  {igPicker(discoverIgIds, setDiscoverIgIds)}
                </div>
                <Button onClick={discover} disabled={discovering} className="w-full">
                  {discovering ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Buscando feeds...</> : <><Sparkles className="h-4 w-4 mr-2" /> Buscar e adicionar</>}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setSourceMode("rss"); setSmartInput(""); setForm({ name: "", url: "", niche: "", fetch_interval_minutes: 60, ig_ids: [], source_language: "auto", translate_to_pt: false, cultural_adaptation: false }); } }}>
            <DialogTrigger asChild><Button onClick={openNew} className="flex-1 sm:flex-none"><Plus className="h-4 w-4 mr-2" /> Nova fonte</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingId ? "Editar fonte" : "Adicionar fonte de conteúdo"}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Tipo de fonte</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {sourceModeOptions.map(option => {
                      const Icon = option.icon;
                      const active = sourceMode === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => {
                            setSourceMode(option.value);
                            setSmartInput("");
                            setForm({ ...form, name: "", url: "", niche: "" });
                          }}
                          className={`text-left rounded-lg border p-3 transition-colors ${active ? "border-primary bg-primary/10" : "hover:bg-muted/50"}`}
                        >
                          <div className="flex items-center gap-2 text-sm font-medium">
                            <Icon className="h-4 w-4" /> {option.label}
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">{option.description}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {sourceMode === "rss" && (
                  <>
                    <div><Label>Nome</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="G1 Tecnologia" /></div>
                    <div><Label>URL do feed RSS</Label><Input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://g1.globo.com/rss/g1/tecnologia/" /></div>
                    <div><Label>Nicho</Label><Input value={form.niche} onChange={e => setForm({ ...form, niche: e.target.value })} placeholder="tecnologia" /></div>
                  </>
                )}

                {sourceMode === "person" && (
                  <>
                    <div><Label>Nome da pessoa</Label><Input value={smartInput} onChange={e => setSmartInput(e.target.value)} placeholder="Virginia Fonseca, Neymar, Lula..." /></div>
                    <div><Label>Apelido da fonte</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="opcional, ex: Virginia Fonseca" /></div>
                    <p className="text-xs text-muted-foreground bg-muted/40 rounded-md p-3">O sistema vai monitorar notícias e conteúdos públicos sobre essa pessoa automaticamente.</p>
                  </>
                )}

                {sourceMode === "topic" && (
                  <>
                    <div><Label>Tema ou palavra-chave</Label><Input value={smartInput} onChange={e => setSmartInput(e.target.value)} placeholder="mercado financeiro, fofoca, futebol, tecnologia..." /></div>
                    <div><Label>Apelido da fonte</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="opcional, ex: Mercado Financeiro" /></div>
                    <p className="text-xs text-muted-foreground bg-muted/40 rounded-md p-3">Use temas amplos para captar novidades do nicho ou termos específicos para acompanhar um assunto.</p>
                  </>
                )}

                {sourceMode === "url" && (
                  <>
                    <div><Label>URL do site ou feed</Label><Input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://site.com/noticias ou https://site.com/feed" /></div>
                    <div><Label>Apelido da fonte</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="opcional, ex: Site de famosos" /></div>
                    <p className="text-xs text-muted-foreground bg-muted/40 rounded-md p-3">Se for um feed RSS, ele será usado direto. Se for um site comum, o sistema monitora conteúdos públicos desse domínio.</p>
                  </>
                )}

                <div><Label>Frequência (minutos)</Label><Input type="number" value={form.fetch_interval_minutes} onChange={e => setForm({ ...form, fetch_interval_minutes: +e.target.value })} /></div>

                {translationEnabled ? (
                <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                  <div className="flex items-center gap-2 text-sm font-medium">🌍 Tradução & Adaptação</div>
                  <div>
                    <Label className="text-xs">Idioma da fonte</Label>
                    <Select value={form.source_language} onValueChange={v => setForm({ ...form, source_language: v, translate_to_pt: v !== "pt" ? true : form.translate_to_pt })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pt">Português (sem tradução)</SelectItem>
                        <SelectItem value="auto">Detectar automaticamente</SelectItem>
                        <SelectItem value="en">Inglês</SelectItem>
                        <SelectItem value="es">Espanhol</SelectItem>
                        <SelectItem value="fr">Francês</SelectItem>
                        <SelectItem value="it">Italiano</SelectItem>
                        <SelectItem value="de">Alemão</SelectItem>
                        <SelectItem value="ja">Japonês</SelectItem>
                        <SelectItem value="zh">Chinês</SelectItem>
                        <SelectItem value="ko">Coreano</SelectItem>
                        <SelectItem value="ru">Russo</SelectItem>
                        <SelectItem value="ar">Árabe</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {form.source_language !== "pt" && (
                    <>
                      <label className="flex items-center justify-between gap-2 cursor-pointer">
                        <div>
                          <div className="text-sm font-medium">Traduzir para português</div>
                          <div className="text-xs text-muted-foreground">A IA traduz e reescreve em PT-BR</div>
                        </div>
                        <Switch checked={form.translate_to_pt} onCheckedChange={v => setForm({ ...form, translate_to_pt: v })} />
                      </label>
                      <label className="flex items-center justify-between gap-2 cursor-pointer">
                        <div>
                          <div className="text-sm font-medium">Adaptação cultural BR 🇧🇷</div>
                          <div className="text-xs text-muted-foreground">Converte $ → R$, explica referências, etc.</div>
                        </div>
                        <Switch checked={form.cultural_adaptation} onCheckedChange={v => setForm({ ...form, cultural_adaptation: v })} />
                      </label>
                    </>
                  )}
                </div>
                ) : (
                  <div className="border border-dashed rounded-lg p-3 bg-muted/20 space-y-2">
                    <div className="flex items-center gap-2 text-sm font-medium">🌍 Tradução & Adaptação <Badge variant="secondary" className="text-[10px]">Pro / Business</Badge></div>
                    <p className="text-xs text-muted-foreground">
                      Traduza fontes em outros idiomas para português e adapte referências culturais automaticamente. Disponível nos planos <strong>Pro</strong> e <strong>Business</strong>.
                      {planName && <> Seu plano atual: <strong>{planName}</strong>.</>}
                    </p>
                    <Button size="sm" variant="outline" onClick={() => window.location.assign("/pricing")} className="w-full">
                      Fazer upgrade
                    </Button>
                  </div>
                )}
                <div>
                  <Label>Publicar nestes Instagram <span className="text-destructive">*</span></Label>
                  {igPicker(form.ig_ids, ids => setForm({ ...form, ig_ids: ids }))}
                  <p className="text-xs text-muted-foreground mt-1">Cada IG marcado recebe uma cópia da notícia. Cada cópia consome 1 cota.</p>
                </div>
                <Button onClick={save} disabled={validating} className="w-full">
                  {validating ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Validando fonte...</> : (editingId ? "Salvar" : "Adicionar fonte")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {sources.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground border-dashed">
          <Newspaper className="h-10 w-10 mx-auto mb-3 opacity-50" />
          Nenhuma fonte. Adicione RSS, pessoa, tema ou URL para começar a captar conteúdos.
        </Card>
      ) : (
        <div className="grid gap-3">
          {sources.map(s => {
            const linkedIgs = (sourceIgMap[s.id] || [])
              .map(id => igAccounts.find(ig => ig.id === id))
              .filter(Boolean);
            const health = sourceHealth(s);
            const kind = sourceKind(s);
            const KindIcon = kind.icon;
            const HealthIcon = health.status === "ok" ? CheckCircle2 : health.status === "warning" ? AlertTriangle : XCircle;
            const healthColor = health.status === "ok" ? "text-green-600" : health.status === "warning" ? "text-yellow-600" : "text-destructive";
            return (
              <Card key={s.id} className={`p-4 md:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-4 ${!s.active ? "opacity-60" : ""}`}>
                <div className="flex items-center gap-3 md:gap-4 min-w-0">
                  <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center shrink-0"><KindIcon className="h-5 w-5 text-primary" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{s.name} {s.niche && <span className="text-xs text-muted-foreground ml-1">· {cleanLabelPrefix(s.niche)}</span>}</p>
                      <Badge variant="outline" className="text-xs gap-1">
                        <KindIcon className="h-3 w-3" /> {kind.label}
                      </Badge>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className={`inline-flex items-center gap-1 text-xs ${healthColor}`}>
                              <HealthIcon className="h-3.5 w-3.5" /> {health.label}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {health.status === "ok" && "Captação rodando dentro do esperado."}
                            {health.status === "warning" && "Sem capturas recentes — verifique a URL ou a frequência."}
                            {health.status === "error" && "Sem captação há mais de 24h. URL pode estar quebrada."}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{s.url}</p>
                    <p className="text-xs text-muted-foreground">A cada {s.fetch_interval_minutes} min · {s.last_fetched_at ? `Última: ${new Date(s.last_fetched_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : "Nunca captada"}</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {linkedIgs.length === 0 ? (
                        <Badge variant="destructive" className="text-xs">Sem IG vinculado</Badge>
                      ) : linkedIgs.map((ig: any) => (
                        <Badge key={ig.id} variant="secondary" className="text-xs">
                          <Instagram className="h-3 w-3 mr-1" />@{ig.username}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 md:gap-3 shrink-0 flex-wrap">
                  <Select value={String(s.fetch_interval_minutes)} onValueChange={v => updateInterval(s.id, +v)}>
                    <SelectTrigger className="w-[130px] md:w-[140px] h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {INTERVAL_OPTIONS.map(m => (
                        <SelectItem key={m} value={String(m)}>
                          {m < 60 ? `A cada ${m} min` : m === 60 ? "A cada 1h" : m < 1440 ? `A cada ${m / 60}h` : "A cada 24h"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Switch checked={s.active} onCheckedChange={v => toggle(s.id, v)} />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" onClick={() => fetchOne(s.id)} disabled={perSourceFetching === s.id || !s.active}>
                          {perSourceFetching === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Captar agora apenas desta fonte</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setConfirmDelete({ id: s.id, name: s.name })}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <UpgradeModal
        open={upgrade.open}
        onOpenChange={(o) => setUpgrade({ ...upgrade, open: o })}
        resource="fontes RSS"
        used={upgrade.used} limit={upgrade.limit}
      />
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover fonte?</AlertDialogTitle>
            <AlertDialogDescription>
              A fonte <strong>{confirmDelete?.name}</strong> será removida. Notícias já captadas dela não serão apagadas, mas nenhuma nova será buscada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDelete && remove(confirmDelete.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
