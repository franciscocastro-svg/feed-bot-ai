import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertTriangle,
  CheckCircle2,
  Hash,
  Instagram,
  Link as LinkIcon,
  Loader2,
  Newspaper,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Rss,
  SearchCheck,
  Sparkles,
  Trash2,
  UserRound,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { UpgradeModal } from "@/components/UpgradeModal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type SourceMode = "rss" | "person" | "topic" | "url";
type SourceKind = "rss" | "site" | "url" | "person" | "topic" | "google_news";
type WizardStep = 1 | 2 | 3;

type PreviewResult = {
  valid: boolean;
  url?: string;
  final_url?: string;
  parse_type?: string;
  items_count?: number;
  sample_items?: Array<{ title: string; url: string; published_at?: string | null; image?: string | null; score?: number }>;
  feed_candidates?: string[];
  diagnostics?: Record<string, any>;
  error?: string | null;
};

type DiscoverCandidate = {
  name: string;
  url: string;
  niche?: string;
  source_kind?: "rss" | "topic";
  query?: string | null;
  include_terms?: string[];
  discovery_method?: "ai_rss" | "curated_rss" | "topic_search";
  valid: boolean;
  error?: string;
  preview?: PreviewResult | null;
  quality_score?: number;
  relevance?: { total: number; matching: number; ratio: number; relevant: boolean };
};

const duplicateSourceMessage = (error: unknown) => {
  const record = error && typeof error === "object" ? error as Record<string, unknown> : {};
  const message = typeof record.message === "string" ? record.message : "";
  const text = `${record.code || ""} ${message} ${record.details || ""}`.toLowerCase();
  if (text.includes("idx_news_sources_unique_active_fingerprint") || text.includes("duplicate key")) {
    return "Essa fonte já existe ativa nesta conta. Edite a fonte existente e marque os Instagrams que devem receber esse conteúdo.";
  }
  return message || "Não foi possível salvar a fonte.";
};

const sourceModeOptions: Array<{ value: SourceMode; label: string; description: string; icon: any }> = [
  { value: "rss", label: "RSS/Site", description: "Feed ou página de notícias", icon: Rss },
  { value: "person", label: "Pessoa", description: "Famoso, atleta, político, artista", icon: UserRound },
  { value: "topic", label: "Tema", description: "Assunto, nicho ou palavra-chave", icon: Hash },
  { value: "url", label: "URL", description: "Monitorar página específica", icon: LinkIcon },
];

const sourceKindLabels: Record<SourceKind, string> = {
  rss: "RSS",
  site: "Site",
  url: "URL",
  person: "Pessoa",
  topic: "Tema",
  google_news: "Google News",
};

const googleNewsSearchUrl = (query: string, country = "BR", language = "pt-BR") => {
  const gl = country.toUpperCase();
  const ceidLang = gl === "BR" ? "pt-419" : language.split("-")[0] || "en";
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query.trim())}&hl=${encodeURIComponent(language)}&gl=${encodeURIComponent(gl)}&ceid=${encodeURIComponent(`${gl}:${ceidLang}`)}`;
};

const parseTerms = (value: string) =>
  value
    .split(/[,\n;]/)
    .map((term) => term.trim())
    .filter(Boolean);

const quoteSearchTerm = (term: string) => {
  const clean = term.trim();
  if (!clean) return "";
  if (/^".+"$/.test(clean)) return clean;
  return /\s/.test(clean) ? `"${clean}"` : clean;
};

const getHostname = (value: string) => {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
};

const cleanLabelPrefix = (value?: string | null) => {
  if (!value) return "";
  return value.replace(/^(Pessoa|Tema|URL|RSS):\s*/i, "");
};

const defaultForm = {
  name: "",
  url: "",
  niche: "",
  fetch_interval_minutes: 60,
  ig_ids: [] as string[],
  source_language: "auto",
  translate_to_pt: false,
  cultural_adaptation: false,
  query: "",
  include_terms_text: "",
  exclude_terms_text: "",
  country: "BR",
  language: "pt-BR",
};

export default function Sources() {
  const [sources, setSources] = useState<any[]>([]);
  const [translationEnabled, setTranslationEnabled] = useState(false);
  const [planName, setPlanName] = useState<string>("");
  const [igAccounts, setIgAccounts] = useState<any[]>([]);
  const [sourceIgMap, setSourceIgMap] = useState<Record<string, string[]>>({});
  const [open, setOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [discoverOpen, setDiscoverOpen] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoverSaving, setDiscoverSaving] = useState(false);
  const [discoverNiche, setDiscoverNiche] = useState("");
  const [discoverIgIds, setDiscoverIgIds] = useState<string[]>([]);
  const [discoverCandidates, setDiscoverCandidates] = useState<DiscoverCandidate[]>([]);
  const [selectedDiscoverUrls, setSelectedDiscoverUrls] = useState<string[]>([]);
  const [fetching, setFetching] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sourceMode, setSourceMode] = useState<SourceMode>("rss");
  const [smartInput, setSmartInput] = useState("");
  const [form, setForm] = useState(defaultForm);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [upgrade, setUpgrade] = useState<{ open: boolean; used?: number; limit?: number }>({ open: false });
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [perSourceFetching, setPerSourceFetching] = useState<string | null>(null);

  const includeTerms = useMemo(() => parseTerms(form.include_terms_text), [form.include_terms_text]);
  const excludeTerms = useMemo(() => parseTerms(form.exclude_terms_text), [form.exclude_terms_text]);

  const resetForm = () => {
    setEditingId(null);
    setSourceMode("rss");
    setSmartInput("");
    setPreview(null);
    setWizardStep(1);
    setForm({ ...defaultForm, ig_ids: igAccounts.length === 1 ? [igAccounts[0].id] : [] });
  };

  const inferMode = (s: any): SourceMode => {
    const kind = s.source_kind as SourceKind | undefined;
    if (kind === "person") return "person";
    if (kind === "topic" || kind === "google_news") return "topic";
    if (kind === "url") return "url";
    const niche = String(s.niche || "");
    if (/^Pessoa:/i.test(niche)) return "person";
    if (/^Tema:/i.test(niche)) return "topic";
    if (/^URL:/i.test(niche)) return "url";
    return "rss";
  };

  const openEdit = (s: any) => {
    const mode = inferMode(s);
    setEditingId(s.id);
    setSourceMode(mode);
    setSmartInput(s.query || cleanLabelPrefix(s.niche) || "");
    setPreview(null);
    setWizardStep(1);
    setForm({
      name: s.name || "",
      url: s.url || "",
      niche: cleanLabelPrefix(s.niche) || "",
      fetch_interval_minutes: s.fetch_interval_minutes || 60,
      ig_ids: sourceIgMap[s.id] || [],
      source_language: s.source_language || "auto",
      translate_to_pt: !!s.translate_to_pt,
      cultural_adaptation: !!s.cultural_adaptation,
      query: s.query || "",
      include_terms_text: Array.isArray(s.include_terms) ? s.include_terms.join(", ") : "",
      exclude_terms_text: Array.isArray(s.exclude_terms) ? s.exclude_terms.join(", ") : "",
      country: s.country || "BR",
      language: s.language || "pt-BR",
    });
    setOpen(true);
  };

  const openNew = () => {
    resetForm();
    setOpen(true);
  };

  const buildSearchQuery = () => {
    const base = (sourceMode === "person" || sourceMode === "topic") ? smartInput.trim() : form.query.trim();
    const pieces: string[] = [];
    if (base) pieces.push(sourceMode === "person" ? quoteSearchTerm(base) : base);
    includeTerms.forEach((term) => pieces.push(quoteSearchTerm(term)));
    excludeTerms.forEach((term) => pieces.push(`-${quoteSearchTerm(term)}`));
    return pieces.join(" ").replace(/\s+/g, " ").trim();
  };

  const buildSourcePayload = () => {
    const base = {
      fetch_interval_minutes: form.fetch_interval_minutes,
      source_language: form.source_language,
      translate_to_pt: form.translate_to_pt,
      cultural_adaptation: form.cultural_adaptation,
      include_terms: includeTerms,
      exclude_terms: excludeTerms,
      country: form.country,
      language: form.language,
    };

    if (sourceMode === "person") {
      const person = smartInput.trim();
      const query = person;
      return {
        ...base,
        name: form.name.trim() || person,
        url: googleNewsSearchUrl(buildSearchQuery(), form.country, form.language),
        source_kind: "person" as SourceKind,
        query,
        niche: `Pessoa: ${person}`,
        source_config: { mode: "person", aliases: includeTerms, preview },
      };
    }

    if (sourceMode === "topic") {
      const topic = smartInput.trim();
      return {
        ...base,
        name: form.name.trim() || topic,
        url: googleNewsSearchUrl(buildSearchQuery(), form.country, form.language),
        source_kind: "topic" as SourceKind,
        query: topic,
        niche: `Tema: ${topic}`,
        source_config: { mode: "topic", preview },
      };
    }

    if (sourceMode === "url") {
      const url = form.url.trim();
      const host = getHostname(url);
      return {
        ...base,
        name: form.name.trim() || host || "Fonte por URL",
        url,
        source_kind: "url" as SourceKind,
        query: form.query.trim() || null,
        niche: `URL: ${host || url}${form.niche.trim() ? ` | ${form.niche.trim()}` : ""}`,
        source_config: { mode: "url", preview },
      };
    }

    const selectedUrl = preview?.valid && preview.url ? preview.url : form.url.trim();
    const resolvedQuery = typeof preview?.diagnostics?.resolved_query === "string" ? preview.diagnostics.resolved_query : "";
    const sourceKind = selectedUrl.includes("news.google.com/rss/search")
      ? "google_news"
      : preview?.parse_type === "html"
        ? "site"
        : "rss";
    return {
      ...base,
      name: form.name.trim(),
      url: selectedUrl,
      source_kind: sourceKind as SourceKind,
      query: resolvedQuery || form.query.trim() || null,
      niche: form.niche.trim() ? `RSS: ${form.niche.trim()}` : "",
      source_config: { mode: "rss", original_url: form.url.trim(), preview, feed_candidates: preview?.feed_candidates || [] },
    };
  };

  const validateConfig = () => {
    if (sourceMode === "person" && !smartInput.trim()) return "Digite o nome da pessoa";
    if (sourceMode === "topic" && !smartInput.trim()) return "Digite o tema";
    if ((sourceMode === "rss" || sourceMode === "url") && !form.url.trim()) return "Preencha a URL";
    if (sourceMode === "rss" && !form.name.trim()) return "Preencha o nome da fonte";
    if (sourceMode === "url") {
      try {
        new URL(form.url.trim());
      } catch {
        return "Digite uma URL válida";
      }
    }
    return "";
  };

  const previewCurrent = async (advance = true): Promise<PreviewResult | null> => {
    const validationError = validateConfig();
    if (validationError) {
      toast.error(validationError);
      return null;
    }
    const payload = buildSourcePayload();
    setPreviewing(true);
    const { data, error } = await supabase.functions.invoke("preview-source", { body: payload });
    setPreviewing(false);
    if (error) {
      toast.error("Não foi possível gerar prévia: " + error.message);
      return null;
    }
    setPreview(data as PreviewResult);
    if (!data?.valid) {
      toast.warning(data?.error || data?.diagnostics?.warnings?.[0] || "Nenhum item aproveitável encontrado");
    } else {
      toast.success(`${data.sample_items?.length || 0} exemplos prontos para revisar`);
    }
    if (advance) setWizardStep(2);
    return data as PreviewResult;
  };

  const syncLinks = async (sourceId: string, userId: string, igIds: string[]) => {
    const { error: deleteError } = await supabase.from("news_source_instagram_accounts").delete().eq("source_id", sourceId);
    if (deleteError) throw deleteError;
    if (igIds.length > 0) {
      const { error: insertError } = await supabase.from("news_source_instagram_accounts").insert(
        igIds.map((ig) => ({ source_id: sourceId, instagram_account_id: ig, user_id: userId })),
      );
      if (insertError) throw insertError;
    }
  };

  const save = async () => {
    if (form.ig_ids.length === 0) return toast.error("Selecione pelo menos um Instagram");
    setSaving(true);
    const currentPreview = preview?.valid ? preview : await previewCurrent(false);
    if (!currentPreview?.valid) {
      setSaving(false);
      return toast.error("Revise a fonte: ela ainda não tem conteúdo aproveitável.");
    }

    const payload = buildSourcePayload();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      return toast.error("Sessão expirada");
    }

    if (editingId) {
      const { error } = await supabase.from("news_sources").update({
        name: payload.name,
        url: payload.url,
        niche: payload.niche,
        source_kind: payload.source_kind,
        query: payload.query,
        include_terms: payload.include_terms,
        exclude_terms: payload.exclude_terms,
        country: payload.country,
        language: payload.language,
        source_config: payload.source_config,
        quality_score: currentPreview.valid ? 70 : 0,
        fetch_interval_minutes: payload.fetch_interval_minutes,
        source_language: payload.source_language,
        translate_to_pt: payload.translate_to_pt,
        cultural_adaptation: payload.cultural_adaptation,
      }).eq("id", editingId);
      if (error) {
        setSaving(false);
        return toast.error(duplicateSourceMessage(error));
      }
      try {
        await syncLinks(editingId, user.id, form.ig_ids);
      } catch (error: unknown) {
        setSaving(false);
        return toast.error(error instanceof Error ? error.message : "Não foi possível atualizar os Instagrams da fonte.");
      }
      toast.success("Fonte atualizada");
    } else {
      const { data: check } = await supabase.rpc("can_create_resource", {
        _user_id: user.id,
        _resource: "rss_source",
      });
      const c = check as any;
      if (c && !c.allowed) {
        setOpen(false);
        setSaving(false);
        setUpgrade({ open: true, used: c.used, limit: c.limit });
        return;
      }
      const { data: inserted, error } = await supabase.from("news_sources").insert({
        name: payload.name,
        url: payload.url,
        niche: payload.niche,
        source_kind: payload.source_kind,
        query: payload.query,
        include_terms: payload.include_terms,
        exclude_terms: payload.exclude_terms,
        country: payload.country,
        language: payload.language,
        source_config: payload.source_config,
        quality_score: currentPreview.valid ? 70 : 0,
        fetch_interval_minutes: payload.fetch_interval_minutes,
        source_language: payload.source_language,
        translate_to_pt: payload.translate_to_pt,
        cultural_adaptation: payload.cultural_adaptation,
        user_id: user.id,
      }).select("id").single();
      if (error) {
        setSaving(false);
        return toast.error(duplicateSourceMessage(error));
      }
      try {
        await syncLinks(inserted.id, user.id, form.ig_ids);
      } catch (error: unknown) {
        await supabase.from("news_sources").delete().eq("id", inserted.id);
        setSaving(false);
        return toast.error(error instanceof Error ? error.message : "Não foi possível vincular os Instagrams à fonte.");
      }
      toast.success("Fonte adicionada");
    }

    setSaving(false);
    setOpen(false);
    resetForm();
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
    const { error } = await supabase.from("news_sources").update({ active }).eq("id", id);
    if (error) return toast.error(active ? duplicateSourceMessage(error) : error.message);
    load();
  };

  const remove = async (id: string) => {
    const { error: linkError } = await supabase.from("news_source_instagram_accounts").delete().eq("source_id", id);
    if (linkError) return toast.error(linkError.message);
    const { error } = await supabase.from("news_sources").delete().eq("id", id);
    if (error) return toast.error(error.message);
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

  const sourceHealth = (s: any): { status: "ok" | "warning" | "error"; label: string; detail: string } => {
    if (!s.active) return { status: "warning", label: "Inativa", detail: "A captação está pausada para esta fonte." };
    const lastSuccess = s.last_success_at || s.last_fetched_at;
    const errorIsCurrent = !!s.last_error && !!s.last_error_at
      && (!lastSuccess || new Date(s.last_error_at).getTime() > new Date(lastSuccess).getTime());
    if (errorIsCurrent) return { status: "error", label: "Falha na captação", detail: s.last_error };
    if (!lastSuccess) return { status: "warning", label: "Nunca captada", detail: "Execute a primeira captação para testar esta fonte." };
    const ageMin = (Date.now() - new Date(lastSuccess).getTime()) / 60000;
    const expected = (s.fetch_interval_minutes || 60) * 3;
    if (ageMin > 1440) return { status: "error", label: "Sem resposta há +24h", detail: "A fonte não conclui uma leitura há mais de 24 horas." };
    if (ageMin > expected) return { status: "warning", label: "Atrasada", detail: "A última leitura está fora da frequência esperada." };
    const found = Number(s.last_items_found || 0);
    return {
      status: "ok",
      label: found > 0 ? "Saudável" : "Saudável, sem conteúdo",
      detail: found > 0 ? "A última leitura encontrou conteúdos." : "A fonte respondeu, mas não apresentou itens nessa leitura.",
    };
  };

  const sourceKind = (s: any): { label: string; icon: any } => {
    const kind = (s.source_kind || "") as SourceKind;
    if (kind && sourceKindLabels[kind]) {
      if (kind === "person") return { label: sourceKindLabels[kind], icon: UserRound };
      if (kind === "topic" || kind === "google_news") return { label: sourceKindLabels[kind], icon: Hash };
      if (kind === "url") return { label: sourceKindLabels[kind], icon: LinkIcon };
      return { label: sourceKindLabels[kind], icon: Rss };
    }
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
    setDiscoverCandidates([]);
    setSelectedDiscoverUrls([]);
    const { data, error } = await supabase.functions.invoke("discover-rss", {
      body: { niche: discoverNiche.trim(), ig_ids: discoverIgIds },
    });
    setDiscovering(false);
    if (error) return toast.error(error.message);
    const candidates = (data?.feeds || []) as DiscoverCandidate[];
    setDiscoverCandidates(candidates);
    setSelectedDiscoverUrls(candidates.filter((c) => c.valid).map((c) => c.url));
    if (!candidates.some((c) => c.valid)) toast.warning("Nenhuma fonte aproveitável encontrada.");
    else toast.success(`${candidates.filter((c) => c.valid).length} fontes prontas para revisão`);
  };

  const addDiscovered = async () => {
    if (selectedDiscoverUrls.length === 0) return toast.error("Selecione ao menos uma fonte válida");
    setDiscoverSaving(true);
    const { data, error } = await supabase.functions.invoke("discover-rss", {
      body: {
        niche: discoverNiche.trim(),
        ig_ids: discoverIgIds,
        insert: true,
        selected_feeds: discoverCandidates
          .filter((candidate) => selectedDiscoverUrls.includes(candidate.url))
          .map(({ name, url, source_kind, query, include_terms, discovery_method }) => ({
            name,
            url,
            source_kind,
            query,
            include_terms,
            discovery_method,
          })),
      },
    });
    setDiscoverSaving(false);
    if (error) return toast.error(error.message);
    const inserted = Number(data?.inserted || 0);
    const linked = Number(data?.linked_existing || 0);
    if (!inserted && linked) toast.success(`${linked} fonte(s) já existiam e foram vinculadas aos Instagrams escolhidos`);
    else if (!inserted) toast.warning("Nenhuma fonte nova foi adicionada. Talvez elas já existam.");
    else toast.success(`${inserted} fontes adicionadas${linked ? ` e ${linked} já existentes vinculadas` : ""}`);
    setDiscoverOpen(false);
    setDiscoverNiche("");
    setDiscoverIgIds([]);
    setDiscoverCandidates([]);
    setSelectedDiscoverUrls([]);
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
        {igAccounts.length > 1 && (
          <div className="flex gap-2 pb-2 border-b">
            <Button type="button" size="sm" variant="outline" onClick={() => onChange(igAccounts.map((ig) => ig.id))} className="h-8">
              Marcar todos
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => onChange([])} className="h-8">
              Limpar
            </Button>
          </div>
        )}
        {igAccounts.map((ig) => {
          const checked = selected.includes(ig.id);
          return (
            <label key={ig.id} className="flex items-center gap-2 cursor-pointer">
              <Checkbox
                checked={checked}
                onCheckedChange={(v) => {
                  if (v) onChange([...selected, ig.id]);
                  else onChange(selected.filter((x) => x !== ig.id));
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

  const PreviewPanel = ({ result }: { result: PreviewResult | null }) => {
    if (!result) {
      return (
        <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground text-center">
          Gere uma prévia para confirmar se a fonte entrega notícias aproveitáveis.
        </div>
      );
    }
    const diagnostics = result.diagnostics || {};
    const relaxedPreview = Boolean(diagnostics.relaxed_preview);
    const routeLabel = diagnostics.resolved_provider === "bing_news"
      ? "busca alternativa"
      : diagnostics.resolved_via === "domain_search"
      ? "google news"
      : diagnostics.resolved_via === "search_variant"
        ? "busca extra"
        : result.parse_type || "sem parser";
    return (
      <div className="space-y-3">
        <div className={`rounded-lg border p-3 ${result.valid ? "border-green-500/30 bg-green-500/5" : "border-destructive/30 bg-destructive/5"}`}>
          <div className="flex items-center gap-2 font-medium">
            {result.valid ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <XCircle className="h-4 w-4 text-destructive" />}
            {result.valid ? "Fonte com conteúdo aproveitável" : "Fonte sem conteúdo aproveitável"}
          </div>
          <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-muted-foreground">
            <span>{Number(diagnostics.items_found || result.items_count || 0)} encontrados</span>
            <span>{Number(diagnostics.items_after_freshness || 0)} {relaxedPreview ? "exemplos" : "recentes"}</span>
            <span>{Number(diagnostics.items_after_relevance || 0)} {relaxedPreview ? "válidos" : "relevantes"}</span>
            <span>{routeLabel}</span>
          </div>
          {diagnostics.warnings?.[0] && <p className="text-xs text-muted-foreground mt-2">{diagnostics.warnings[0]}</p>}
        </div>

        {(result.feed_candidates?.length || 0) > 0 && (
          <div className="rounded-lg border p-3 bg-muted/30">
            <p className="text-sm font-medium">Feeds candidatos encontrados</p>
            <div className="mt-2 space-y-1">
              {result.feed_candidates?.slice(0, 3).map((url) => (
                <p key={url} className="text-xs text-muted-foreground truncate">{url}</p>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2">
          {(result.sample_items || []).map((item) => (
            <div key={item.url} className="rounded-lg border p-3">
              <div className="flex min-w-0 items-start gap-3">
                {item.image && (
                  <img
                    src={item.image}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-20 w-24 shrink-0 rounded-md border bg-muted object-cover sm:h-24 sm:w-32"
                    onError={(event) => {
                      event.currentTarget.style.display = "none";
                    }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-medium">{item.title}</p>
                  <p className="break-all text-xs text-muted-foreground">{item.url}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {item.published_at && <Badge variant="outline" className="text-xs">{new Date(item.published_at).toLocaleString("pt-BR")}</Badge>}
                    <Badge variant="secondary" className="text-xs">Score {item.score || 0}</Badge>
                    {item.image ? <Badge variant="secondary" className="text-xs">Com imagem</Badge> : <Badge variant="outline" className="text-xs">Sem imagem</Badge>}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {result.valid && (result.sample_items || []).length === 0 && (
            <p className="text-sm text-muted-foreground">A fonte respondeu, mas não retornou exemplos na prévia.</p>
          )}
        </div>
      </div>
    );
  };

  const renderStepOne = () => (
    <div className="space-y-4">
      <div>
        <Label>Tipo de fonte</Label>
        <div className="mt-2 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
          {sourceModeOptions.map((option) => {
            const Icon = option.icon;
            const active = sourceMode === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setSourceMode(option.value);
                  setSmartInput("");
                  setPreview(null);
                  setForm({ ...form, name: "", url: "", niche: "", query: "", include_terms_text: "", exclude_terms_text: "" });
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
          <div><Label>Nome</Label><Input value={form.name} onChange={(e) => { setPreview(null); setForm({ ...form, name: e.target.value }); }} placeholder="G1 Tecnologia" /></div>
          <div><Label>URL do feed ou página</Label><Input value={form.url} onChange={(e) => { setPreview(null); setForm({ ...form, url: e.target.value }); }} placeholder="https://site.com/feed ou https://site.com/noticias" /></div>
          <div><Label>Nicho</Label><Input value={form.niche} onChange={(e) => { setPreview(null); setForm({ ...form, niche: e.target.value }); }} placeholder="tecnologia" /></div>
        </>
      )}

      {sourceMode === "person" && (
        <>
          <div><Label>Nome da pessoa</Label><Input value={smartInput} onChange={(e) => { setPreview(null); setSmartInput(e.target.value); }} placeholder="Virginia Fonseca, Neymar, Lula..." /></div>
          <div><Label>Apelido da fonte</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="opcional" /></div>
          <div><Label>Apelidos ou termos de foco</Label><Input value={form.include_terms_text} onChange={(e) => { setPreview(null); setForm({ ...form, include_terms_text: e.target.value }); }} placeholder="ex: nome artístico, clube, partido" /></div>
          <div><Label>Termos para bloquear</Label><Input value={form.exclude_terms_text} onChange={(e) => { setPreview(null); setForm({ ...form, exclude_terms_text: e.target.value }); }} placeholder="ex: homônimo, assunto indesejado" /></div>
        </>
      )}

      {sourceMode === "topic" && (
        <>
          <div><Label>Tema ou palavra-chave</Label><Input value={smartInput} onChange={(e) => { setPreview(null); setSmartInput(e.target.value); }} placeholder="mercado financeiro, fofoca, futebol..." /></div>
          <div><Label>Apelido da fonte</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="opcional" /></div>
          <div><Label>Termos de foco</Label><Input value={form.include_terms_text} onChange={(e) => { setPreview(null); setForm({ ...form, include_terms_text: e.target.value }); }} placeholder="ex: famosos, novela, influencer" /></div>
          <div><Label>Termos para bloquear</Label><Input value={form.exclude_terms_text} onChange={(e) => { setPreview(null); setForm({ ...form, exclude_terms_text: e.target.value }); }} placeholder="ex: política, BBB, cripto" /></div>
        </>
      )}

      {sourceMode === "url" && (
        <>
          <div><Label>URL do site ou página</Label><Input value={form.url} onChange={(e) => { setPreview(null); setForm({ ...form, url: e.target.value }); }} placeholder="https://site.com/noticias" /></div>
          <div><Label>Apelido da fonte</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="opcional" /></div>
          <div><Label>Nicho</Label><Input value={form.niche} onChange={(e) => { setPreview(null); setForm({ ...form, niche: e.target.value }); }} placeholder="fofoca, esportes, tecnologia..." /></div>
        </>
      )}

      {(sourceMode === "person" || sourceMode === "topic") && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>País</Label>
            <Select value={form.country} onValueChange={(v) => { setPreview(null); setForm({ ...form, country: v }); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="BR">Brasil</SelectItem>
                <SelectItem value="US">Estados Unidos</SelectItem>
                <SelectItem value="PT">Portugal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Idioma da busca</Label>
            <Select value={form.language} onValueChange={(v) => { setPreview(null); setForm({ ...form, language: v }); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pt-BR">Português BR</SelectItem>
                <SelectItem value="en-US">Inglês</SelectItem>
                <SelectItem value="es">Espanhol</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );

  const renderStepThree = () => (
    <div className="space-y-4">
      <div><Label>Frequência (minutos)</Label><Input type="number" min={5} max={1440} step={5} value={form.fetch_interval_minutes} onChange={(e) => setForm({ ...form, fetch_interval_minutes: Math.min(1440, Math.max(5, +e.target.value || 5)) })} /></div>

      {translationEnabled ? (
        <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
          <div className="flex items-center gap-2 text-sm font-medium">Tradução & Adaptação</div>
          <div>
            <Label className="text-xs">Idioma da fonte</Label>
            <Select value={form.source_language} onValueChange={(v) => setForm({ ...form, source_language: v, translate_to_pt: v !== "pt" ? true : form.translate_to_pt })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pt">Português</SelectItem>
                <SelectItem value="auto">Detectar automaticamente</SelectItem>
                <SelectItem value="en">Inglês</SelectItem>
                <SelectItem value="es">Espanhol</SelectItem>
                <SelectItem value="fr">Francês</SelectItem>
                <SelectItem value="it">Italiano</SelectItem>
                <SelectItem value="de">Alemão</SelectItem>
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
                <Switch checked={form.translate_to_pt} onCheckedChange={(v) => setForm({ ...form, translate_to_pt: v })} />
              </label>
              <label className="flex items-center justify-between gap-2 cursor-pointer">
                <div>
                  <div className="text-sm font-medium">Adaptação cultural BR</div>
                  <div className="text-xs text-muted-foreground">Converte valores e explica referências</div>
                </div>
                <Switch checked={form.cultural_adaptation} onCheckedChange={(v) => setForm({ ...form, cultural_adaptation: v })} />
              </label>
            </>
          )}
        </div>
      ) : (
        <div className="border border-dashed rounded-lg p-3 bg-muted/20 space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">Tradução & Adaptação <Badge variant="secondary" className="text-[10px]">Pro / Business</Badge></div>
          <p className="text-xs text-muted-foreground">
            Tradução automática fica disponível nos planos Pro e Business.
            {planName && <> Seu plano atual: <strong>{planName}</strong>.</>}
          </p>
          <Button size="sm" variant="outline" onClick={() => window.location.assign("/pricing")} className="w-full">Fazer upgrade</Button>
        </div>
      )}

      <div>
        <Label>Publicar nestes Instagram <span className="text-destructive">*</span></Label>
        {igPicker(form.ig_ids, (ids) => setForm({ ...form, ig_ids: ids }))}
        <p className="text-xs text-muted-foreground mt-1">Cada Instagram marcado recebe uma cópia da notícia.</p>
      </div>
    </div>
  );

  return (
    <div className="mx-auto w-full min-w-0 max-w-5xl space-y-6 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] md:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold">Fontes de conteúdo</h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">RSS, sites, pessoas, temas e URLs com prévia e diagnóstico.</p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <Button variant="outline" onClick={fetchNow} disabled={fetching} className="w-full sm:w-auto">
            {fetching ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Captar agora
          </Button>
          <Dialog open={discoverOpen} onOpenChange={(v) => {
            setDiscoverOpen(v);
            if (!v) {
              setDiscoverIgIds([]);
              setDiscoverCandidates([]);
              setSelectedDiscoverUrls([]);
            }
          }}>
            <DialogTrigger asChild>
              <Button variant="secondary" className="h-auto min-h-10 w-full whitespace-normal py-2 sm:w-auto">
                <Sparkles className="h-4 w-4 mr-2" /> Descobrir por nicho
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader className="pr-9">
                <DialogTitle>Descobrir fontes por nicho</DialogTitle>
                <DialogDescription>Busque, revise e vincule fontes compatíveis com seus perfis.</DialogDescription>
              </DialogHeader>
              <div className="min-w-0 space-y-4">
                <div>
                  <Label>Nicho</Label>
                  <Input
                    value={discoverNiche}
                    onChange={(e) => setDiscoverNiche(e.target.value)}
                    placeholder="ex: tecnologia, economia, esportes, cripto..."
                    onKeyDown={(e) => e.key === "Enter" && !discovering && discover()}
                  />
                </div>
                <div>
                  <Label>Vincular aos Instagram</Label>
                  {igPicker(discoverIgIds, setDiscoverIgIds)}
                </div>
                <Button onClick={discover} disabled={discovering} className="w-full">
                  {discovering ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Validando fontes...</> : <><SearchCheck className="h-4 w-4 mr-2" /> Buscar prévias</>}
                </Button>

                {discoverCandidates.length > 0 && (
                  <div className="space-y-2">
                    {discoverCandidates.map((candidate) => {
                      const checked = selectedDiscoverUrls.includes(candidate.url);
                      return (
                        <div key={candidate.url} className={`rounded-lg border p-3 ${candidate.valid ? "" : "opacity-60"}`}>
                          <div className="flex items-start gap-2">
                            <Checkbox
                              checked={checked}
                              disabled={!candidate.valid}
                              onCheckedChange={(v) => {
                                if (v) setSelectedDiscoverUrls([...selectedDiscoverUrls, candidate.url]);
                                else setSelectedDiscoverUrls(selectedDiscoverUrls.filter((url) => url !== candidate.url));
                              }}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="min-w-0 break-words font-medium">{candidate.name}</p>
                                {candidate.valid ? <Badge variant="secondary">Válida</Badge> : <Badge variant="outline">Sem prévia</Badge>}
                                {candidate.discovery_method === "topic_search" && <Badge variant="outline">Busca temática</Badge>}
                                {candidate.discovery_method === "curated_rss" && <Badge variant="outline">Catálogo verificado</Badge>}
                                {candidate.discovery_method === "ai_rss" && <Badge variant="outline">Sugestão por IA</Badge>}
                              </div>
                              <p className="break-all text-xs text-muted-foreground">{candidate.url}</p>
                              {candidate.preview?.sample_items?.[0] && (
                                <p className="text-xs text-muted-foreground mt-2">Exemplo: {candidate.preview.sample_items[0].title}</p>
                              )}
                              {candidate.valid && candidate.relevance && (
                                <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
                                  {candidate.relevance.matching} de {candidate.relevance.total} exemplos correspondem ao nicho
                                </p>
                              )}
                              {!candidate.valid && candidate.error && <p className="mt-2 text-xs text-destructive">{candidate.error}</p>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <Button onClick={addDiscovered} disabled={discoverSaving || selectedDiscoverUrls.length === 0} className="h-auto min-h-10 w-full whitespace-normal py-2">
                      {discoverSaving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Adicionando...</> : `Adicionar ${selectedDiscoverUrls.length} fonte(s) selecionada(s)`}
                    </Button>
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>
          <Dialog open={open} onOpenChange={(v) => {
            setOpen(v);
            if (!v) resetForm();
          }}>
            <DialogTrigger asChild><Button onClick={openNew} className="w-full sm:w-auto"><Plus className="h-4 w-4 mr-2" /> Nova fonte</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader className="pr-9">
                <DialogTitle>{editingId ? "Editar fonte" : "Adicionar fonte de conteúdo"}</DialogTitle>
                <DialogDescription>Configure a fonte, valide a prévia e escolha onde o conteúdo será publicado.</DialogDescription>
              </DialogHeader>
              <div className="min-w-0 space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { step: 1 as WizardStep, label: "Configurar" },
                    { step: 2 as WizardStep, label: "Prévia" },
                    { step: 3 as WizardStep, label: "Publicação" },
                  ].map((item) => (
                    <button
                      key={item.step}
                      type="button"
                      onClick={() => setWizardStep(item.step)}
                      className={`rounded-md border px-2 py-2 text-xs font-medium ${wizardStep === item.step ? "border-primary bg-primary/10" : "text-muted-foreground"}`}
                    >
                      {item.step}. {item.label}
                    </button>
                  ))}
                </div>

                {wizardStep === 1 && renderStepOne()}
                {wizardStep === 2 && <PreviewPanel result={preview} />}
                {wizardStep === 3 && renderStepThree()}

                <div className="flex flex-col gap-2 pt-2 min-[420px]:flex-row">
                  {wizardStep > 1 && <Button variant="outline" onClick={() => setWizardStep((wizardStep - 1) as WizardStep)} className="flex-1">Voltar</Button>}
                  {wizardStep === 1 && (
                    <Button onClick={() => previewCurrent(true)} disabled={previewing} className="flex-1">
                      {previewing ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Gerando prévia...</> : <><SearchCheck className="h-4 w-4 mr-2" /> Gerar prévia</>}
                    </Button>
                  )}
                  {wizardStep === 2 && (
                    <>
                      <Button variant="outline" onClick={() => previewCurrent(false)} disabled={previewing} className="flex-1">
                        {previewing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Atualizar prévia"}
                      </Button>
                      <Button onClick={() => setWizardStep(3)} disabled={!preview?.valid} className="flex-1">Continuar</Button>
                    </>
                  )}
                  {wizardStep === 3 && (
                    <Button onClick={save} disabled={saving || previewing} className="flex-1">
                      {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Salvando...</> : (editingId ? "Salvar fonte" : "Adicionar fonte")}
                    </Button>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {sources.length === 0 ? (
        <Card className="border-dashed p-6 text-center text-muted-foreground md:p-12">
          <Newspaper className="h-10 w-10 mx-auto mb-3 opacity-50" />
          Nenhuma fonte. Adicione RSS, pessoa, tema ou URL para começar.
        </Card>
      ) : (
        <div className="grid gap-3">
          {sources.map((s) => {
            const linkedIgs = (sourceIgMap[s.id] || [])
              .map((id) => igAccounts.find((ig) => ig.id === id))
              .filter(Boolean);
            const health = sourceHealth(s);
            const kind = sourceKind(s);
            const KindIcon = kind.icon;
            const HealthIcon = health.status === "ok" ? CheckCircle2 : health.status === "warning" ? AlertTriangle : XCircle;
            const healthColor = health.status === "ok" ? "text-green-600" : health.status === "warning" ? "text-yellow-600" : "text-destructive";
            const summary = s.last_run_summary || {};
            return (
              <Card key={s.id} className={`flex min-w-0 flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between md:gap-4 md:p-5 ${!s.active ? "opacity-60" : ""}`}>
                <div className="flex min-w-0 items-start gap-3 md:items-center md:gap-4">
                  <div className="h-10 w-10 rounded-lg bg-secondary flex items-center justify-center shrink-0"><KindIcon className="h-5 w-5 text-primary" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <p className="max-w-full break-words font-medium">{s.name} {s.niche && <span className="ml-1 text-xs text-muted-foreground">· {cleanLabelPrefix(s.niche)}</span>}</p>
                      <Badge variant="outline" className="text-xs gap-1"><KindIcon className="h-3 w-3" /> {kind.label}</Badge>
                      {Number(s.quality_score || 0) > 0 && <Badge variant="secondary" className="text-xs">Qualidade {Number(s.quality_score || 0).toFixed(0)}</Badge>}
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className={`inline-flex items-center gap-1 text-xs ${healthColor}`}>
                              <HealthIcon className="h-3.5 w-3.5" /> {health.label}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs">{health.detail}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <p className="break-all text-xs text-muted-foreground">{s.url}</p>
                    <p className="text-xs text-muted-foreground">
                      A cada {s.fetch_interval_minutes} min · {(s.last_success_at || s.last_fetched_at) ? `Última leitura: ${new Date(s.last_success_at || s.last_fetched_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : "Nunca captada"}
                    </p>
                    {(s.last_success_at || s.last_error_at) && (
                      <p className={`mt-1 break-words text-xs ${health.status === "error" ? "text-destructive" : "text-muted-foreground"}`}>
                        {health.status === "error"
                          ? `Erro: ${s.last_error || "não identificado"}`
                          : `${Number(summary.items_found ?? s.last_items_found ?? 0)} encontrados · ${Number(summary.items_after_relevance ?? 0)} relevantes · ${Number(summary.items_distributed ?? s.last_items_created ?? 0)} distribuídos · ${Number(summary.items_duplicates ?? 0)} duplicados · ${Number(s.last_items_created || 0)} novos`}
                      </p>
                    )}
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
                <div className="flex w-full shrink-0 flex-wrap items-center gap-2 md:w-auto md:flex-nowrap md:gap-3">
                  <Select value={String(s.fetch_interval_minutes)} onValueChange={(v) => updateInterval(s.id, +v)}>
                    <SelectTrigger className="h-10 min-w-[130px] flex-1 md:h-9 md:w-[140px] md:flex-none"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INTERVAL_OPTIONS.map((m) => (
                        <SelectItem key={m} value={String(m)}>
                          {m < 60 ? `A cada ${m} min` : m === 60 ? "A cada 1h" : m < 1440 ? `A cada ${m / 60}h` : "A cada 24h"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Switch checked={s.active} onCheckedChange={(v) => toggle(s.id, v)} />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Captar agora ${s.name}`} onClick={() => fetchOne(s.id)} disabled={perSourceFetching === s.id || !s.active}>
                          {perSourceFetching === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Captar agora apenas desta fonte</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <Button variant="ghost" size="icon" aria-label={`Editar ${s.name}`} onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label={`Remover ${s.name}`} onClick={() => setConfirmDelete({ id: s.id, name: s.name })}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
        used={upgrade.used}
        limit={upgrade.limit}
      />
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover fonte?</AlertDialogTitle>
            <AlertDialogDescription>
              A fonte <strong>{confirmDelete?.name}</strong> será removida. Notícias já captadas dela não serão apagadas.
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
