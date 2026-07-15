import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { Upload, Star, Trash2, Plus, Image as ImageIcon, Check, Newspaper, Camera, Film, Eye, Heart, MessageCircle, Send, Bookmark, MoreHorizontal, Search, Home, PlusSquare, User, Music2, Info, TrendingUp, Trophy, Sparkles, Scale, Stethoscope, Cpu, Church, Layers, ShieldCheck, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { resolveTemplateGradient, templateGradientCss } from "../../../supabase/functions/_shared/template-gradients.js";
import {
  getDefaultTemplateConfig,
  getPresetTemplateLayout,
  getTemplateLayoutOptions,
  normalizeTemplateConfig,
} from "../../../supabase/functions/_shared/template-layouts.js";
import { resolveAccountTemplateDefaults, type TemplateFormat } from "@/lib/templateDefaults";
import { materializeTemplateVersion } from "../../../supabase/functions/_shared/template-versioning.js";
import type { Json } from "@/integrations/supabase/types";
import {
  PROFESSIONAL_TEMPLATE_NICHES,
  PROFESSIONAL_TEMPLATE_PRESETS,
  PROFESSIONAL_TEMPLATE_STYLES,
  buildProfessionalTemplateConfig,
  filterProfessionalTemplates,
  type ProfessionalTemplatePreset,
  type ProfessionalTemplateStyle,
} from "@/lib/professionalTemplateCatalog";

type PostFormat = TemplateFormat;
const GLOBAL_SCOPE = "__global";

type InstagramAccount = { id: string; username: string; active: boolean };
type TemplateSettings = {
  user_id?: string;
  instagram_account_id?: string;
  default_template_id?: string | null;
  default_feed_template_id?: string | null;
  default_story_template_id?: string | null;
  default_reel_template_id?: string | null;
  brand_handle?: string | null;
  brand_name?: string | null;
  brand_logo_url?: string | null;
};

type Template = {
  id: string;
  name: string;
  kind: "custom" | "preset";
  preset_key: string | null;
  background_url: string | null;
  config: any;
  is_default: boolean;
  format: PostFormat;
};

type TemplateVersionSnapshot = {
  id: string;
  template_id: string;
  user_id: string;
  instagram_account_id: string;
  format: PostFormat;
  version_number: number;
  status: "draft" | "published" | "archived";
  name: string;
  kind: "custom" | "preset";
  preset_key: string | null;
  background_url: string | null;
  config: Record<string, unknown>;
};

type TemplateVersionState = {
  format: PostFormat;
  published_version_id: string | null;
  draft_version_id: string | null;
  published: TemplateVersionSnapshot | null;
  draft: TemplateVersionSnapshot | null;
  history?: TemplateVersionSnapshot[];
};

type DynamicRpcResult = { data: unknown; error: { message: string } | null };
const callDynamicRpc = supabase.rpc.bind(supabase) as unknown as (
  name: string,
  args: Record<string, unknown>,
) => Promise<DynamicRpcResult>;

type BrandTextElement = {
  id: string;
  type: "text";
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  color: string;
  fontWeight: number;
  align: "left" | "center" | "right";
  opacity: number;
};

type BrandImageElement = {
  id: string;
  type: "image";
  name: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
};

type BrandElement = BrandTextElement | BrandImageElement;

function templateBrandElements(config: any): BrandElement[] {
  return Array.isArray(config?.brandElements) ? config.brandElements.slice(0, 12) : [];
}

const FORMATS: { key: PostFormat; label: string; icon: any; description: string; aspect: string }[] = [
  { key: "feed", label: "Feed", icon: Newspaper, description: "Posts quadrados 1080×1080", aspect: "aspect-square" },
  { key: "stories", label: "Stories", icon: Camera, description: "Vertical 1080×1920 — 24h", aspect: "aspect-[9/16]" },
  { key: "reels", label: "Reels", icon: Film, description: "Capa de vídeo vertical 1080×1920", aspect: "aspect-[9/16]" },
];

const TEMPLATE_REQUIREMENTS: Record<PostFormat, { width: number; height: number; label: string }> = {
  feed: { width: 1080, height: 1080, label: "1080x1080" },
  stories: { width: 1080, height: 1920, label: "1080x1920" },
  reels: { width: 1080, height: 1920, label: "1080x1920" },
};

const DEFAULT_COLUMN_BY_FORMAT: Record<PostFormat, string> = {
  feed: "default_feed_template_id",
  stories: "default_story_template_id",
  reels: "default_reel_template_id",
};

const NICHE_ICONS: Record<string, typeof Newspaper> = {
  noticias: Newspaper,
  economia: TrendingUp,
  futebol: Trophy,
  fofoca: Sparkles,
  advogados: Scale,
  medicos: Stethoscope,
  tecnologia: Cpu,
  religiao: Church,
};

function wrapPreviewText(text: string, maxChars: number, maxLines: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    } else {
      current = candidate;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines.join("\n");
}

export default function Templates() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [defaultIds, setDefaultIds] = useState<Record<PostFormat, string | null>>({ feed: null, stories: null, reels: null });
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState(GLOBAL_SCOPE);
  const [globalSettings, setGlobalSettings] = useState<TemplateSettings | null>(null);
  const [accountSettings, setAccountSettings] = useState<TemplateSettings[]>([]);
  const [versionStates, setVersionStates] = useState<TemplateVersionState[]>([]);
  const [editing, setEditing] = useState<Template | null>(null);
  const [previewing, setPreviewing] = useState<Template | null>(null);
  const [brand, setBrand] = useState<{ handle?: string; name?: string; logo?: string }>({});
  const [uploading, setUploading] = useState(false);
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createFormat, setCreateFormat] = useState<PostFormat>("feed");
  const [selectedNiche, setSelectedNiche] = useState<string>(PROFESSIONAL_TEMPLATE_NICHES[0].key);
  const [templateSearch, setTemplateSearch] = useState("");
  const [selectedStyle, setSelectedStyle] = useState<"all" | ProfessionalTemplateStyle>("all");
  const [catalogPreview, setCatalogPreview] = useState<{ preset: ProfessionalTemplatePreset; format: PostFormat } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    if (!user) return;
    const [{ data: tpls }, settingsRes, { data: igAccounts }, { data: overrides }] = await Promise.all([
      supabase.from("post_templates").select("*").order("created_at", { ascending: false }),
      supabase
        .from("user_settings")
        .select("default_template_id, default_feed_template_id, default_story_template_id, default_reel_template_id, brand_handle, brand_name, brand_logo_url")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase.from("instagram_accounts").select("id, username, active").order("username"),
      supabase.from("account_settings").select("user_id, instagram_account_id, default_template_id, default_feed_template_id, default_story_template_id, default_reel_template_id, brand_handle, brand_name, brand_logo_url"),
    ]);
    let settings = settingsRes.data;
    if (!settings) {
      const { data: created } = await supabase
        .from("user_settings")
        .insert({ user_id: user.id })
        .select("default_template_id, default_feed_template_id, default_story_template_id, default_reel_template_id, brand_handle, brand_name, brand_logo_url")
        .single();
      settings = created;
    }
    setTemplates((tpls || []) as Template[]);
    setGlobalSettings(settings as TemplateSettings);
    setAccounts((igAccounts || []) as InstagramAccount[]);
    setAccountSettings((overrides || []) as TemplateSettings[]);
    if (selectedAccountId === GLOBAL_SCOPE && (igAccounts || []).length > 0) {
      setSelectedAccountId(igAccounts![0].id);
    }
    setBrand({ handle: settings?.brand_handle ?? undefined, name: settings?.brand_name ?? undefined, logo: settings?.brand_logo_url ?? undefined });
  }
  useEffect(() => { load(); }, [user]);

  async function loadVersionStates(accountId = selectedAccountId) {
    if (!user || accountId === GLOBAL_SCOPE) {
      setVersionStates([]);
      return;
    }
    const { data, error } = await callDynamicRpc("get_account_template_states", {
      _account_id: accountId,
    });
    // The UI stays compatible while the migration is still pending deployment.
    if (error) {
      setVersionStates([]);
      return;
    }
    setVersionStates(Array.isArray(data) ? data as TemplateVersionState[] : []);
  }

  useEffect(() => { loadVersionStates(); }, [selectedAccountId, user]);

  function stateFor(format: PostFormat) {
    return versionStates.find(state => state.format === format) || null;
  }

  function accountTemplateSnapshot(template: Template, preferDraft = false): Template {
    if (selectedAccountId === GLOBAL_SCOPE) return template;
    const state = stateFor(template.format || "feed");
    const candidates = preferDraft ? [state?.draft, state?.published] : [state?.published, state?.draft];
    const version = candidates.find(candidate => candidate?.template_id === template.id);
    if (!version) return template;
    return { ...template, ...(materializeTemplateVersion(version) || {}), is_default: template.is_default } as Template;
  }

  useEffect(() => {
    if (!globalSettings) return;
    const override = selectedAccountId === GLOBAL_SCOPE
      ? null
      : accountSettings.find(item => item.instagram_account_id === selectedAccountId) || null;
    const resolved = resolveAccountTemplateDefaults(templates, globalSettings, override, selectedAccountId !== GLOBAL_SCOPE);
    setDefaultIds(resolved.ids);

    if (selectedAccountId === GLOBAL_SCOPE) {
      setBrand({ handle: globalSettings.brand_handle ?? undefined, name: globalSettings.brand_name ?? undefined, logo: globalSettings.brand_logo_url ?? undefined });
    } else {
      setBrand({
        handle: override?.brand_handle || globalSettings.brand_handle || undefined,
        name: override?.brand_name || globalSettings.brand_name || undefined,
        logo: override?.brand_logo_url || globalSettings.brand_logo_url || undefined,
      });
    }
  }, [selectedAccountId, templates, globalSettings, accountSettings]);

  async function setDefault(id: string, format: PostFormat) {
    const column = DEFAULT_COLUMN_BY_FORMAT[format];
    const update: Record<string, string> = { [column]: id };
    if (format === "feed") update.default_template_id = id;
    if (selectedAccountId === GLOBAL_SCOPE) {
      const { error } = await supabase.from("user_settings").update(update as any).eq("user_id", user!.id);
      if (error) return toast.error(error.message);
      setGlobalSettings(current => current ? { ...current, ...update } : current);
      toast.success(`Padrão global de ${format === "feed" ? "Feed" : format === "stories" ? "Stories" : "Reels"} definido`);
    } else {
      const { data, error } = await supabase.rpc("set_account_template_default", {
        _account_id: selectedAccountId,
        _format: format,
        _template_id: id,
      });
      if (error) return toast.error(error.message);
      setAccountSettings(current => [
        ...current.filter(item => item.instagram_account_id !== selectedAccountId),
        data as TemplateSettings,
      ]);
      await loadVersionStates(selectedAccountId);
      const account = accounts.find(item => item.id === selectedAccountId);
      toast.success(`Template de ${format === "feed" ? "Feed" : format === "stories" ? "Stories" : "Reels"} aplicado somente em @${account?.username || "conta"}`);
    }
  }

  function getImageSize(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Não consegui ler as dimensões da imagem."));
      };
      img.src = url;
    });
  }

  async function validateTemplateFile(file: File, format: PostFormat) {
    const req = TEMPLATE_REQUIREMENTS[format];
    if (!["image/png", "image/jpeg"].includes(file.type)) {
      throw new Error("Use apenas PNG ou JPG.");
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error("O arquivo precisa ter até 5 MB.");
    }
    const size = await getImageSize(file);
    if (size.width !== req.width || size.height !== req.height) {
      throw new Error(`Este formato precisa ser ${req.label}. Sua imagem tem ${size.width}x${size.height}.`);
    }
  }

  async function ensureTemplateLimit() {
    const { data, error } = await supabase.rpc("can_create_resource", { _user_id: user!.id, _resource: "template" });
    if (error) throw error;
    const result = data as any;
    if (result && result.allowed === false) {
      throw new Error(`Seu plano permite ${result.limit} template(s). Remova um template antigo ou ajuste o plano.`);
    }
  }

  async function addPreset(p: ProfessionalTemplatePreset, format: PostFormat) {
    try {
      await ensureTemplateLimit();
    } catch (e: any) {
      return toast.error(e.message);
    }
    const mergedConfig = buildProfessionalTemplateConfig(p, format);
    const { data, error } = await supabase.from("post_templates").insert({
      user_id: user!.id, name: p.name, kind: "preset", preset_key: p.key, config: mergedConfig as unknown as Json, format,
    }).select().single();
    if (error) return toast.error(error.message);
    setTemplates(t => [data as Template, ...t]);
    setCatalogPreview(null);
    setEditing(data as Template);
    toast.success(`${p.name} adicionado. Personalize e salve o rascunho antes de publicar.`);
  }

  const uploadFormatRef = useRef<PostFormat>("feed");
  async function uploadBackground(file: File) {
    if (!user) return;
    setUploading(true);
    let uploadedPath: string | null = null;
    try {
      await ensureTemplateLimit();
      await validateTemplateFile(file, uploadFormatRef.current);
      const ext = file.name.split(".").pop() || "png";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("template-backgrounds").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      uploadedPath = path;
      const { data: { publicUrl } } = supabase.storage.from("template-backgrounds").getPublicUrl(path);
      const config = {
        ...getDefaultTemplateConfig(uploadFormatRef.current),
        overlayOpacity: 0,
        ...(uploadFormatRef.current === "feed" ? {} : { showPhoto: false }),
      };
      const { data, error } = await supabase.from("post_templates").insert({
        user_id: user.id, name: file.name.replace(/\.[^.]+$/, ""), kind: "custom",
        background_url: publicUrl, config, format: uploadFormatRef.current,
      }).select().single();
      if (error) throw error;
      uploadedPath = null;
      setTemplates(t => [data as Template, ...t]);
      toast.success("Template enviado e validado");
      setEditing(data as Template);
    } catch (e: any) {
      if (uploadedPath) await supabase.storage.from("template-backgrounds").remove([uploadedPath]);
      toast.error(e.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  function triggerUpload(format: PostFormat) {
    uploadFormatRef.current = format;
    setCreateOpen(false);
    fileRef.current?.click();
  }

  function openCreate(format: PostFormat) {
    setCreateFormat(format);
    setCreateOpen(true);
  }

  function startBlankTemplate(format: PostFormat) {
    const config = {
      ...getDefaultTemplateConfig(format),
      backgroundGradient: {
        angle: 135,
        stops: [
          { color: "#18111b", position: 0 },
          { color: "#34132d", position: 1 },
        ],
      },
    };
    const label = FORMATS.find(item => item.key === format)?.label || "Template";
    setCreateOpen(false);
    setEditing({
      id: `new-${crypto.randomUUID()}`,
      name: `Novo template de ${label}`,
      kind: "custom",
      preset_key: null,
      background_url: null,
      config,
      is_default: false,
      format,
    });
  }

  async function remove(template: Template) {
    let usageCount = 0;
    const usageResult = await callDynamicRpc("get_template_account_usage_count", { _template_id: template.id });
    if (!usageResult.error && typeof usageResult.data === "number") usageCount = usageResult.data;
    const warning = usageCount > 0
      ? `Este template está ligado a ${usageCount} conta/formato(s). A exclusão removerá essas versões. Deseja continuar?`
      : "Remover este template?";
    if (!confirm(warning)) return;
    const { error } = await supabase.from("post_templates").delete().eq("id", template.id);
    if (error) return toast.error(error.message);

    if (template.background_url) {
      try {
        const marker = "/storage/v1/object/public/template-backgrounds/";
        const pathname = new URL(template.background_url).pathname;
        const storagePath = pathname.includes(marker) ? decodeURIComponent(pathname.split(marker)[1]) : null;
        if (storagePath) await supabase.storage.from("template-backgrounds").remove([storagePath]);
      } catch {
        // The database row is already gone; an invalid legacy URL must not block deletion.
      }
    }

    setTemplates(current => current.filter(item => item.id !== template.id));
    setDefaultIds(current => current[template.format] === template.id ? { ...current, [template.format]: null } : current);
    if (editing?.id === template.id) setEditing(null);
    if (previewing?.id === template.id) setPreviewing(null);
    toast.success("Template removido");
  }

  async function saveConfig(t: Template) {
    if (t.id.startsWith("new-")) {
      try {
        await ensureTemplateLimit();
      } catch (e: any) {
        return toast.error(e.message);
      }
      const { data, error } = await supabase.from("post_templates").insert({
        user_id: user!.id,
        name: t.name,
        kind: "custom",
        preset_key: null,
        background_url: null,
        config: t.config,
        format: t.format,
      }).select().single();
      if (error) return toast.error(error.message);
      setTemplates(list => [data as Template, ...list]);
      if (selectedAccountId !== GLOBAL_SCOPE) {
        const { error: draftError } = await callDynamicRpc("save_account_template_draft", {
          _account_id: selectedAccountId,
          _template_id: data.id,
          _name: t.name,
          _config: t.config,
          _background_url: null,
          _preset_key: null,
          _kind: "custom",
        });
        if (draftError) return toast.error(draftError.message);
        await loadVersionStates(selectedAccountId);
      }
      setEditing(null);
      toast.success(selectedAccountId === GLOBAL_SCOPE ? "Template criado com sucesso" : "Template criado como rascunho desta conta");
      return;
    }
    if (selectedAccountId !== GLOBAL_SCOPE) {
      const { error } = await callDynamicRpc("save_account_template_draft", {
        _account_id: selectedAccountId,
        _template_id: t.id,
        _name: t.name,
        _config: t.config,
        _background_url: t.background_url,
        _preset_key: t.preset_key,
        _kind: t.kind,
      });
      if (error) return toast.error(error.message);
      await loadVersionStates(selectedAccountId);
      setEditing(null);
      toast.success("Rascunho salvo somente para esta conta");
      return;
    }
    const { error } = await supabase.from("post_templates").update({
      name: t.name, config: t.config,
    }).eq("id", t.id);
    if (error) return toast.error(error.message);
    setTemplates(list => list.map(x => x.id === t.id ? t : x));
    setEditing(null);
    toast.success("Salvo");
  }

  async function publishDraft(format: PostFormat) {
    if (selectedAccountId === GLOBAL_SCOPE) return;
    const { data: rawData, error } = await callDynamicRpc("publish_account_template_draft", {
      _account_id: selectedAccountId,
      _format: format,
    });
    if (error) return toast.error(error.message);
    const data = rawData && typeof rawData === "object" ? rawData as Record<string, unknown> : null;
    const templateId = typeof data?.template_id === "string" ? data.template_id : undefined;
    if (templateId) {
      const column = DEFAULT_COLUMN_BY_FORMAT[format];
      setDefaultIds(current => ({ ...current, [format]: templateId }));
      setAccountSettings(current => current.map(item => item.instagram_account_id === selectedAccountId
        ? { ...item, [column]: templateId }
        : item));
    }
    await loadVersionStates(selectedAccountId);
    toast.success("Nova versão publicada somente nesta conta");
  }

  async function discardDraft(format: PostFormat) {
    if (selectedAccountId === GLOBAL_SCOPE || !confirm("Descartar o rascunho desta conta?")) return;
    const { error } = await callDynamicRpc("discard_account_template_draft", {
      _account_id: selectedAccountId,
      _format: format,
    });
    if (error) return toast.error(error.message);
    await loadVersionStates(selectedAccountId);
    toast.success("Rascunho descartado");
  }

  async function restorePreviousVersion(format: PostFormat) {
    if (selectedAccountId === GLOBAL_SCOPE) return;
    const previous = stateFor(format)?.history?.[0];
    if (!previous?.id || !confirm(`Restaurar a versão ${previous.version_number} nesta conta?`)) return;
    const { error } = await callDynamicRpc("restore_account_template_version", {
      _account_id: selectedAccountId,
      _version_id: previous.id,
    });
    if (error) return toast.error(error.message);
    const column = DEFAULT_COLUMN_BY_FORMAT[format];
    setDefaultIds(current => ({ ...current, [format]: previous.template_id }));
    setAccountSettings(current => current.map(item => item.instagram_account_id === selectedAccountId
      ? { ...item, [column]: previous.template_id }
      : item));
    await loadVersionStates(selectedAccountId);
    toast.success("Versão anterior restaurada somente nesta conta");
  }

  const catalogPreviewTemplate: Template | null = catalogPreview ? {
    id: `catalog-${catalogPreview.preset.key}-${catalogPreview.format}`,
    name: catalogPreview.preset.name,
    kind: "preset",
    preset_key: catalogPreview.preset.key,
    background_url: null,
    config: buildProfessionalTemplateConfig(catalogPreview.preset, catalogPreview.format),
    is_default: false,
    format: catalogPreview.format,
  } : null;

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-display font-bold">Templates</h1>
          <p className="text-muted-foreground mt-1">
            Organize seus templates por formato de postagem: Feed, Stories e Reels. Cada formato tem seus próprios modelos prontos e artes personalizadas.
          </p>
        </div>
        <Button variant="outline" onClick={() => setCriteriaOpen(true)}>
          <Info className="h-4 w-4 mr-2" /> Critérios do template
        </Button>
      </div>

      <Card className="p-4 border-primary/20 bg-primary/5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">Templates ativos para</p>
            <p className="text-xs text-muted-foreground">
              Escolha uma conta antes de definir o padrão. Alterar uma conta não modifica as demais.
            </p>
          </div>
          <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
            <SelectTrigger className="w-full sm:w-[280px] bg-background">
              <SelectValue placeholder="Selecione uma conta" />
            </SelectTrigger>
            <SelectContent>
              {accounts.length === 0 && <SelectItem value={GLOBAL_SCOPE}>Padrão global</SelectItem>}
              {accounts.map(account => (
                <SelectItem key={account.id} value={account.id}>
                  @{account.username}{account.active ? "" : " (inativa)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Dialog open={criteriaOpen} onOpenChange={setCriteriaOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Critérios para um template que funciona</DialogTitle>
            <DialogDescription>
              Siga estas regras para garantir que sua arte suba sem erros e gere posts bonitos no Instagram.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 text-sm">
            <section>
              <h3 className="font-semibold text-base mb-2">📐 Dimensões obrigatórias</h3>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li><strong>Feed:</strong> 1080 × 1080 px (quadrado)</li>
                <li><strong>Stories / Reels (capa):</strong> 1080 × 1920 px (vertical 9:16)</li>
                <li>Fora dessas dimensões o Instagram corta ou borra a imagem.</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-base mb-2">🖼️ Formato do arquivo</h3>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>Use <strong>PNG</strong> (preferível) ou <strong>JPG</strong> de alta qualidade.</li>
                <li>Tamanho máximo: <strong>5 MB</strong>.</li>
                <li>RGB (não CMYK). Sem transparência se for JPG.</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-base mb-2">🎨 Áreas seguras (zonas livres)</h3>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>Deixe uma <strong>área limpa no topo</strong> (~150 px) para o @ da conta e logo.</li>
                <li>Deixe uma <strong>área central/meio</strong> livre para o título da notícia (até 4 linhas).</li>
                <li>Deixe espaço embaixo para subtítulo e badge "LEIA A LEGENDA".</li>
                <li>Evite elementos importantes nas <strong>bordas</strong> (margem de 60 px).</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-base mb-2">🌑 Contraste e legibilidade</h3>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>Se o texto for <strong>branco</strong>, use fundo escuro ou overlay escuro.</li>
                <li>Se o texto for <strong>preto</strong>, use fundo claro ou área branca para o título.</li>
                <li>Nada de fundo cheio de detalhes na zona do texto — atrapalha leitura no celular.</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-base mb-2">🅰️ Tipografia (configurada no editor)</h3>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>Título: 56–72 px, negrito, máx. 22 caracteres por linha.</li>
                <li>Subtítulo: 22–28 px, médio.</li>
                <li>Use cores que combinem com a marca (configurável no editor).</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-base mb-2">🏷️ Identidade visual</h3>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>Inclua sua <strong>logo</strong> e <strong>@usuário</strong> (configurado em Configurações).</li>
                <li>Mantenha a paleta de cores consistente com seu perfil.</li>
                <li>Reserve um espaço para a <strong>foto da notícia</strong> (se o template usar foto).</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-base mb-2">✅ Checklist antes de subir</h3>
              <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
                <li>Arquivo na dimensão correta (1080×1080 ou 1080×1920).</li>
                <li>PNG ou JPG ≤ 5 MB.</li>
                <li>Áreas livres para texto, logo e foto.</li>
                <li>Contraste suficiente para ler no celular.</li>
                <li>Sem texto importante muito perto das bordas.</li>
                <li>Testou pré-visualizando após subir.</li>
              </ul>
            </section>

            <section className="bg-muted/50 rounded-lg p-3">
              <h3 className="font-semibold text-base mb-1">💡 Dica</h3>
              <p className="text-muted-foreground">
                Após subir, clique em <strong>"Editar"</strong> para ajustar posição do título, foto e badge. E em <strong>"Pré-visualizar"</strong> para ver como ficará uma postagem real.
              </p>
            </section>
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={() => setCriteriaOpen(false)}>Entendi</Button>
          </div>
        </DialogContent>
      </Dialog>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg"
        hidden
        onChange={e => e.target.files?.[0] && uploadBackground(e.target.files[0])}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Criar template de {FORMATS.find(item => item.key === createFormat)?.label}</DialogTitle>
            <DialogDescription>
              Escolha um ponto de partida. O template só será usado depois que você ajustar os blocos, conferir a prévia e defini-lo como padrão.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => startBlankTemplate(createFormat)}
              className="group rounded-xl border border-border bg-card p-5 text-left transition hover:border-primary hover:bg-primary/5"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Plus className="h-5 w-5" />
              </div>
              <div className="font-semibold">Começar do zero</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Monte o fundo e posicione título, subtítulo, foto, selo e identificação da marca no editor.
              </p>
              <div className="mt-4 text-xs font-medium text-primary">Abrir editor em branco →</div>
            </button>

            <button
              type="button"
              onClick={() => triggerUpload(createFormat)}
              disabled={uploading}
              className="group rounded-xl border border-border bg-card p-5 text-left transition hover:border-primary hover:bg-primary/5 disabled:opacity-50"
            >
              <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Upload className="h-5 w-5" />
              </div>
              <div className="font-semibold">Usar arte como base</div>
              <p className="mt-1 text-sm text-muted-foreground">
                Envie um PNG ou JPG validado e depois marque exatamente onde cada conteúdo automático deve aparecer.
              </p>
              <div className="mt-4 text-xs font-medium text-primary">
                {TEMPLATE_REQUIREMENTS[createFormat].label} · até 5 MB →
              </div>
            </button>
          </div>

          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-muted-foreground">
            <strong className="text-foreground">Importante:</strong> enviar uma arte não publica a imagem diretamente. Ela vira o fundo do template e será combinada com os textos e fotos de cada notícia.
          </div>
        </DialogContent>
      </Dialog>

      {FORMATS.map(fmt => {
        const Icon = fmt.icon;
        const list = templates.filter(t => (t.format || "feed") === fmt.key);
        const activeDefaultId = defaultIds[fmt.key];
        const catalogItems = filterProfessionalTemplates({
          niche: selectedNiche === "all" || templateSearch.trim() ? undefined : selectedNiche,
          style: selectedStyle,
          query: templateSearch,
        });
        return (
          <section key={fmt.key} className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap border-b border-border pb-2">
              <div className="flex items-center gap-2">
                <Icon className="h-5 w-5 text-primary" />
                <h2 className="text-xl font-semibold">{fmt.label}</h2>
                <Badge variant="outline" className="text-xs">{list.length}</Badge>
                <span className="text-xs text-muted-foreground hidden sm:inline">— {fmt.description}</span>
                {activeDefaultId ? (
                  <Badge variant="outline" className="gap-1 border-emerald-500/30 text-emerald-400">
                    <ShieldCheck className="h-3 w-3" />
                    {selectedAccountId === GLOBAL_SCOPE
                      ? "Padrão global"
                      : "Padrão desta conta"}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 border-amber-500/30 text-amber-400">
                    <AlertTriangle className="h-3 w-3" /> Sem padrão
                  </Badge>
                )}
              </div>
              <Button size="sm" onClick={() => openCreate(fmt.key)} disabled={uploading}>
                <Plus className="h-4 w-4 mr-2" /> Criar template
              </Button>
            </div>

            {/* Biblioteca profissional de modelos */}
            <div className="rounded-xl border border-border bg-gradient-to-br from-background to-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Layers className="h-4 w-4 text-primary" />
                    Biblioteca profissional
                    <Badge variant="secondary">{PROFESSIONAL_TEMPLATE_PRESETS.length} modelos</Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Visualize com a marca da conta selecionada. Nenhum modelo é ativado sem sua confirmação.
                  </p>
                </div>
                <Badge variant="outline">{catalogItems.length} disponíveis em {fmt.label}</Badge>
              </div>

              <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_210px]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={templateSearch}
                    onChange={event => setTemplateSearch(event.target.value)}
                    placeholder="Buscar por nome, nicho ou estilo"
                    className="pl-9"
                    aria-label="Buscar modelos profissionais"
                  />
                </div>
                <Select value={selectedStyle} onValueChange={value => setSelectedStyle(value as "all" | ProfessionalTemplateStyle)}>
                  <SelectTrigger aria-label="Filtrar modelos por estilo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROFESSIONAL_TEMPLATE_STYLES.map(style => (
                      <SelectItem key={style.key} value={style.key}>{style.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
                <button
                  type="button"
                  onClick={() => setSelectedNiche("all")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-all ${selectedNiche === "all" ? "border-primary bg-primary text-primary-foreground" : "bg-card border-border text-muted-foreground hover:text-foreground"}`}
                >
                  <Layers className="h-3.5 w-3.5" /> Todos
                </button>
                {PROFESSIONAL_TEMPLATE_NICHES.map(n => {
                  const NIcon = NICHE_ICONS[n.key] || Layers;
                  const active = selectedNiche === n.key;
                  return (
                    <button
                      type="button"
                      key={n.key}
                      onClick={() => setSelectedNiche(n.key)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border transition-all ${
                        active
                          ? "text-white border-transparent shadow-sm"
                          : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
                      }`}
                      style={active ? { background: n.accent } : undefined}
                    >
                      <NIcon className="h-3.5 w-3.5" />
                      {n.label}
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                {catalogItems.map(p => {
                  const preview = buildProfessionalTemplateConfig(p, fmt.key);
                  const previewH = fmt.key === "feed" ? 1080 : 1920;
                  return (
                  <button
                    type="button"
                    key={p.key}
                    onClick={() => setCatalogPreview({ preset: p, format: fmt.key })}
                    className="group text-left rounded-lg border border-border bg-card p-2 hover:border-primary hover:shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    aria-label={`Visualizar modelo ${p.name} para ${fmt.label}`}
                  >
                    <div className={`${fmt.aspect} rounded-md mb-2 relative overflow-hidden`} style={{ background: templateGradientCss(p.key, p.config) }}>
                      <div className="absolute border border-white/20 bg-black/10" style={{ left: `${preview.photoX / 10.8}%`, top: `${preview.photoY / previewH * 100}%`, width: `${preview.photoW / 10.8}%`, height: `${preview.photoH / previewH * 100}%` }} />
                      <div className="absolute text-[8px] font-black uppercase leading-tight" style={{ left: `${preview.titleX / 10.8}%`, top: `${(preview.titleY - preview.titleSize) / previewH * 100}%`, width: `${preview.titleW / 10.8}%`, color: preview.titleColor, textAlign: preview.titleAlign }}>
                        Título da<br />notícia
                      </div>
                      <div className="absolute px-1.5 py-0.5 text-[6px] font-bold rounded-sm truncate" style={{ left: `${preview.badgeX / 10.8}%`, top: `${preview.badgeY / previewH * 100}%`, width: `${preview.badgeW / 10.8}%`, background: preview.badgeBg, color: preview.badgeColor }}>
                        {preview.badgeText}
                      </div>
                    </div>
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0 font-semibold text-xs truncate">{p.name}</div>
                      {p.popular && <Badge className="h-4 px-1 text-[8px]">Popular</Badge>}
                    </div>
                    <div className="text-[10px] text-muted-foreground line-clamp-2 min-h-7">{p.description}</div>
                    <div className="mt-1.5 flex items-center justify-between gap-1 text-[10px]">
                      <span className="capitalize text-muted-foreground">{p.style}</span>
                      <span className="flex items-center gap-1 font-medium text-primary">
                        <Eye className="h-3 w-3" /> Visualizar
                      </span>
                    </div>
                  </button>
                  );
                })}
              </div>
              {catalogItems.length === 0 && (
                <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                  Nenhum modelo corresponde aos filtros. Limpe a busca ou escolha outro estilo.
                </div>
              )}
            </div>

            {/* Templates do usuário */}
            <div>
              <div className="text-sm text-muted-foreground mb-2">Meus templates</div>
              {list.length === 0 ? (
                <Card className="p-6 text-center text-muted-foreground text-sm">
                  <ImageIcon className="h-6 w-6 mx-auto mb-2 opacity-50" />
                  Nenhum template de {fmt.label} ainda.
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {list.map(t => {
                    const rendered = accountTemplateSnapshot(t);
                    const versionState = stateFor(fmt.key);
                    const draft = versionState?.draft?.template_id === t.id ? versionState.draft : null;
                    const draftPreview = draft ? accountTemplateSnapshot(t, true) : rendered;
                    return (
                    <Card key={t.id} className="overflow-hidden">
                      <div className={`${fmt.aspect} bg-muted relative`}>
                        {rendered.background_url ? (
                          <img src={rendered.background_url} alt={rendered.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full" style={{ background: templateGradientCss(rendered.preset_key, rendered.config) }} />
                        )}
                        {activeDefaultId === t.id && (
                          <Badge className="absolute top-2 left-2 bg-primary"><Star className="h-3 w-3 mr-1" />Padrão</Badge>
                        )}
                        {draft && (
                          <Badge variant="secondary" className="absolute top-2 right-2">Rascunho</Badge>
                        )}
                      </div>
                      <div className="p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium truncate">{rendered.name}</div>
                          <Badge variant="outline" className="text-xs">{rendered.kind === "custom" ? "Custom" : "Preset"}</Badge>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <Button size="sm" variant="outline" className="flex-1 min-w-[80px]" onClick={() => setEditing(draftPreview)}>Ajustar</Button>
                          <Button size="sm" variant="secondary" className="flex-1 min-w-[80px]" onClick={() => setPreviewing(draftPreview)}>
                            <Eye className="h-4 w-4 mr-1" /> Prévia
                          </Button>
                          {activeDefaultId !== t.id && (
                            <Button size="sm" variant="ghost" title={`Definir como padrão de ${fmt.label}`} onClick={() => setDefault(t.id, fmt.key)}>
                              <Check className="h-4 w-4 mr-1" />
                              {selectedAccountId === GLOBAL_SCOPE ? "Usar globalmente" : "Usar nesta conta"}
                            </Button>
                          )}
                          {draft && selectedAccountId !== GLOBAL_SCOPE && (
                            <>
                              <Button size="sm" onClick={() => publishDraft(fmt.key)}>Publicar versão</Button>
                              <Button size="sm" variant="ghost" onClick={() => discardDraft(fmt.key)}>Descartar</Button>
                            </>
                          )}
                          {activeDefaultId === t.id && !draft && selectedAccountId !== GLOBAL_SCOPE && (versionState?.history?.length || 0) > 0 && (
                            <Button size="sm" variant="ghost" onClick={() => restorePreviousVersion(fmt.key)}>Restaurar anterior</Button>
                          )}
                          <Button size="sm" variant="ghost" title="Remover template" onClick={() => remove(t)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        );
      })}

      {editing && (
        <EditorPanel
          template={editing}
          brand={brand}
          onClose={() => setEditing(null)}
          onSave={saveConfig}
          isNew={editing.id.startsWith("new-")}
        />
      )}

      <InstagramPreviewDialog
        template={catalogPreviewTemplate}
        brand={brand}
        onClose={() => setCatalogPreview(null)}
        onUse={catalogPreview ? () => addPreset(catalogPreview.preset, catalogPreview.format) : undefined}
        useLabel={catalogPreview ? `Usar ${catalogPreview.preset.name}` : undefined}
      />

      <InstagramPreviewDialog
        template={previewing}
        brand={brand}
        onClose={() => setPreviewing(null)}
      />
    </div>
  );
}

function InstagramPreviewDialog({ template, brand, onClose, onUse, useLabel }: {
  template: Template | null;
  brand: { handle?: string; name?: string; logo?: string };
  onClose: () => void;
  onUse?: () => unknown | Promise<unknown>;
  useLabel?: string;
}) {
  const [samplePhoto, setSamplePhoto] = useState<string>(
    "https://images.unsplash.com/photo-1495020689067-958852a7765e?w=900&q=80"
  );
  const [sampleTitle, setSampleTitle] = useState("TÍTULO DA NOTÍCIA EM DESTAQUE");
  const [sampleSub, setSampleSub] = useState("Subtítulo curto explicando o contexto da notícia.");
  const sampleFileRef = useRef<HTMLInputElement>(null);

  if (!template) return null;
  const fmt = template.format || "feed";
  const handle = (brand.handle || brand.name || "suamarca").replace(/^@/, "").toLowerCase();
  const sampleCaption = `${sampleTitle.charAt(0) + sampleTitle.slice(1).toLowerCase()}. ${sampleSub} #news #atualidades`;

  // Para Feed = 1080x1080; Stories/Reels = 1080x1920. Posições do template (px) são em base 1080 horizontal.
  const CANVAS_W = 1080;
  const CANVAS_H = fmt === "feed" ? 1080 : 1920;

  const TemplateArt = ({ aspect }: { aspect: string }) => {
    const cfg = normalizeTemplateConfig(template.config, fmt);
    const xP = (px: number) => `${(px / CANVAS_W) * 100}%`;
    const yP = (px: number) => `${(px / CANVAS_H) * 100}%`;
    const wP = (px: number) => `${(px / CANVAS_W) * 100}%`;
    const hP = (px: number) => `${(px / CANVAS_H) * 100}%`;
    const fontPct = (px: number) => `${(px / CANVAS_W) * 100}cqw`;

    return (
      <div
        className={`relative w-full ${aspect} overflow-hidden bg-zinc-900`}
        style={{ containerType: "inline-size" }}
      >
        {/* Fundo do template */}
        {template.background_url ? (
          <img src={template.background_url} className="absolute inset-0 w-full h-full object-cover" alt="" />
        ) : (
          <div className="absolute inset-0" style={{ background: templateGradientCss(template.preset_key, template.config) }} />
        )}

        {/* Foto real de exemplo da notícia */}
        {cfg.showPhoto && samplePhoto && (
          <img
            src={samplePhoto}
            alt="exemplo"
            className="absolute object-cover"
            style={{ left: xP(cfg.photoX), top: yP(cfg.photoY), width: wP(cfg.photoW), height: hP(cfg.photoH) }}
          />
        )}

        {cfg.overlayOpacity > 0 && (
          <div className="absolute inset-0 pointer-events-none" style={{ background: `rgba(0,0,0,${cfg.overlayOpacity})` }} />
        )}

        {cfg.showHandle && (
          <div className="absolute font-mono font-bold tracking-wider"
            style={{ left: xP(cfg.handleX), top: yP(cfg.handleY - cfg.handleSize), color: cfg.handleColor, fontSize: fontPct(cfg.handleSize) }}>
            @{handle.toUpperCase()}
          </div>
        )}

        <div className="absolute whitespace-pre-line font-black uppercase leading-[1.05]"
          style={{ left: xP(cfg.titleX), width: wP(cfg.titleW), top: yP(cfg.titleY - cfg.titleSize * 0.8), color: cfg.titleColor, fontSize: fontPct(cfg.titleSize), textAlign: cfg.titleAlign }}>
          {wrapPreviewText(sampleTitle, cfg.titleMaxChars, cfg.titleMaxLines)}
        </div>

        <div className="absolute whitespace-pre-line leading-snug"
          style={{ left: xP(cfg.subtitleX), width: wP(cfg.subtitleW), top: yP(cfg.subtitleY - cfg.subtitleSize * 0.8), color: cfg.subtitleColor, fontSize: fontPct(cfg.subtitleSize), textAlign: cfg.subtitleAlign }}>
          {wrapPreviewText(sampleSub, Math.floor(cfg.titleMaxChars * 2.2), cfg.subtitleMaxLines)}
        </div>

        {cfg.showBadge && (
          <div className="absolute font-bold"
            style={{
              left: xP(cfg.badgeX), top: yP(cfg.badgeY), width: wP(cfg.badgeW), height: hP(cfg.badgeH),
              background: cfg.badgeBg, color: cfg.badgeColor,
              fontSize: fontPct(cfg.badgeSize), display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 4,
            }}>
            {cfg.badgeText}
          </div>
        )}

        {templateBrandElements(cfg).map(element => element.type === "image" ? (
          <img
            key={element.id}
            src={element.url}
            alt={element.name || "Elemento de marca"}
            className="absolute object-contain"
            style={{
              left: xP(element.x), top: yP(element.y), width: wP(element.width), height: hP(element.height),
              opacity: element.opacity ?? 1,
            }}
          />
        ) : (
          <div
            key={element.id}
            className="absolute whitespace-pre-line leading-tight"
            style={{
              left: xP(element.x), top: yP(element.y), width: wP(element.width), color: element.color,
              fontSize: fontPct(element.fontSize), fontWeight: element.fontWeight, textAlign: element.align,
              opacity: element.opacity ?? 1,
            }}
          >
            {element.text}
          </div>
        ))}
      </div>
    );
  };

  const Avatar = () => (
    <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 p-[2px]">
      <div className="h-full w-full rounded-full bg-white overflow-hidden flex items-center justify-center">
        {brand.logo ? <img src={brand.logo} className="h-full w-full object-cover" alt="" /> : <span className="text-[10px] font-bold text-black">{handle.charAt(0).toUpperCase()}</span>}
      </div>
    </div>
  );

  const handleSampleUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setSamplePhoto(reader.result as string);
    reader.readAsDataURL(file);
  };


  return (
    <Dialog open={!!template} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl p-0 bg-white text-black overflow-hidden border-0 max-h-[95vh]">
        <DialogTitle className="sr-only">Prévia no Instagram — {fmt}</DialogTitle>

        <div className="grid md:grid-cols-[1fr_360px] max-h-[95vh]">
          {/* Painel de controle do sample */}
          <div className="bg-zinc-50 border-r border-zinc-200 p-4 space-y-4 overflow-y-auto order-2 md:order-1">
            <div>
              <h3 className="font-semibold text-sm text-zinc-900">Personalize a prévia</h3>
              <p className="text-xs text-zinc-500 mt-0.5">Use seu próprio título, subtítulo e foto para ver como ficará na vida real.</p>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Foto da notícia (exemplo)</Label>
              <div className="aspect-video w-full rounded-md overflow-hidden bg-zinc-200 border border-zinc-300">
                {samplePhoto && <img src={samplePhoto} alt="" className="w-full h-full object-cover" />}
              </div>
              <input
                ref={sampleFileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={e => e.target.files?.[0] && handleSampleUpload(e.target.files[0])}
              />
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="flex-1" onClick={() => sampleFileRef.current?.click()}>
                  <Upload className="h-3 w-3 mr-1" /> Subir foto
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSamplePhoto("https://images.unsplash.com/photo-1495020689067-958852a7765e?w=900&q=80")}>
                  Reset
                </Button>
              </div>
              <div className="grid grid-cols-4 gap-1.5 pt-1">
                {[
                  "https://images.unsplash.com/photo-1495020689067-958852a7765e?w=600&q=80",
                  "https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&q=80",
                  "https://images.unsplash.com/photo-1542222024-c39e2281f121?w=600&q=80",
                  "https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=600&q=80",
                ].map(u => (
                  <button key={u} onClick={() => setSamplePhoto(u)} className="aspect-square rounded overflow-hidden border border-zinc-300 hover:border-primary">
                    <img src={u} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Título de exemplo</Label>
              <Input value={sampleTitle} onChange={e => setSampleTitle(e.target.value)} className="text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Subtítulo de exemplo</Label>
              <Input value={sampleSub} onChange={e => setSampleSub(e.target.value)} className="text-sm" />
            </div>

            <div className="text-[11px] text-zinc-500 border-t border-zinc-200 pt-3">
              Para mover o título, foto, badge ou trocar cores, use o botão <strong>Ajustar</strong> do template.
            </div>
            {onUse && (
              <div className="sticky bottom-0 -mx-4 -mb-4 space-y-2 border-t border-zinc-200 bg-white p-4 shadow-[0_-8px_20px_rgba(0,0,0,0.06)]">
                <Button className="w-full" onClick={() => void onUse()}>{useLabel || "Usar este modelo"}</Button>
                <p className="text-center text-[10px] text-zinc-500">
                  Será adicionado à sua coleção para personalização. O modelo ativo não será alterado.
                </p>
              </div>
            )}
          </div>

          {/* Mock do Instagram */}
          <div className="overflow-y-auto order-1 md:order-2">
            {/* IG Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-200 bg-white sticky top-0 z-20">
              <div className="font-display text-xl tracking-tight" style={{ fontFamily: "cursive" }}>Instagram</div>
              <div className="flex gap-3 text-zinc-700">
                <Heart className="h-5 w-5" />
                <Send className="h-5 w-5" />
              </div>
            </div>


        {fmt === "feed" && (
          <>
            {/* Post header */}
            <div className="flex items-center justify-between px-3 py-2">
              <div className="flex items-center gap-2">
                <Avatar />
                <div className="text-sm font-semibold">{handle}</div>
                <span className="text-zinc-400 text-xs">• 2 min</span>
              </div>
              <MoreHorizontal className="h-5 w-5 text-zinc-700" />
            </div>
            <TemplateArt aspect="aspect-square" />
            {/* Action bar */}
            <div className="flex items-center justify-between px-3 py-2">
              <div className="flex gap-4 text-zinc-900">
                <Heart className="h-6 w-6" />
                <MessageCircle className="h-6 w-6" />
                <Send className="h-6 w-6" />
              </div>
              <Bookmark className="h-6 w-6 text-zinc-900" />
            </div>
            <div className="px-3 pb-3 text-sm space-y-1">
              <div className="font-semibold">1.247 curtidas</div>
              <div><span className="font-semibold mr-1">{handle}</span>{sampleCaption}</div>
              <div className="text-zinc-500 text-xs">Ver todos os 84 comentários</div>
            </div>
          </>
        )}

        {fmt === "stories" && (
          <div className="relative bg-black">
            {/* progress bar */}
            <div className="absolute top-2 left-2 right-2 z-10 flex gap-1">
              <div className="h-0.5 flex-1 bg-white/40 rounded-full overflow-hidden">
                <div className="h-full w-1/2 bg-white" />
              </div>
            </div>
            <div className="absolute top-5 left-3 right-3 z-10 flex items-center gap-2">
              <Avatar />
              <div className="text-white text-sm font-semibold">{handle}</div>
              <span className="text-white/70 text-xs">2 min</span>
            </div>
            <TemplateArt aspect="aspect-[9/16]" />
            <div className="absolute bottom-3 left-3 right-3 z-10 flex items-center gap-2">
              <div className="flex-1 h-9 rounded-full border border-white/60 px-3 flex items-center text-white/80 text-xs">Enviar mensagem</div>
              <Heart className="h-6 w-6 text-white" />
              <Send className="h-6 w-6 text-white" />
            </div>
          </div>
        )}

        {fmt === "reels" && (
          <div className="relative bg-black">
            <TemplateArt aspect="aspect-[9/16]" />
            {/* right rail */}
            <div className="absolute right-2 bottom-20 z-10 flex flex-col items-center gap-4 text-white">
              <div className="flex flex-col items-center"><Heart className="h-7 w-7" /><span className="text-[10px]">12,4k</span></div>
              <div className="flex flex-col items-center"><MessageCircle className="h-7 w-7" /><span className="text-[10px]">320</span></div>
              <div className="flex flex-col items-center"><Send className="h-7 w-7" /><span className="text-[10px]">Enviar</span></div>
              <Bookmark className="h-7 w-7" />
              <MoreHorizontal className="h-7 w-7" />
            </div>
            {/* bottom info */}
            <div className="absolute left-3 right-16 bottom-12 z-10 text-white space-y-1">
              <div className="flex items-center gap-2">
                <Avatar />
                <div className="text-sm font-semibold">{handle}</div>
                <button className="text-xs border border-white px-2 py-0.5 rounded">Seguir</button>
              </div>
              <div className="text-xs line-clamp-2">{sampleCaption}</div>
              <div className="flex items-center gap-1 text-[11px]"><Music2 className="h-3 w-3" /> {handle} · Áudio original</div>
            </div>
          </div>
        )}

            {/* IG bottom nav */}
            <div className="flex items-center justify-around px-4 py-2 border-t border-zinc-200 bg-white">
              <Home className="h-5 w-5" />
              <Search className="h-5 w-5" />
              <PlusSquare className="h-5 w-5" />
              <Film className="h-5 w-5" />
              <User className="h-5 w-5" />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditorPanel({ template, brand, onClose, onSave, isNew = false }: {
  template: Template;
  brand: { handle?: string; name?: string; logo?: string };
  onClose: () => void;
  onSave: (t: Template) => void;
  isNew?: boolean;
}) {
  const { user } = useAuth();
  const [draft, setDraft] = useState<Template>(() => ({
    ...template,
    config: { ...normalizeTemplateConfig(template.config, template.format || "feed") },
  }));
  const [finalPreviewOpen, setFinalPreviewOpen] = useState(false);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [elementUploading, setElementUploading] = useState(false);
  const elementFileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const fmt = draft.format || "feed";
  const canvasH = fmt === "feed" ? 1080 : 1920;
  const aspectClass = fmt === "feed" ? "aspect-square" : "aspect-[9/16]";
  const cfg = normalizeTemplateConfig(draft.config, fmt);
  const update = (patch: any) => setDraft(current => {
    const currentFmt = current.format || "feed";
    const currentCfg = normalizeTemplateConfig(current.config, currentFmt);
    return { ...current, config: { ...currentCfg, ...patch } };
  });
  const elements = templateBrandElements(cfg);
  const selectedElement = elements.find(element => element.id === selectedElementId) || null;
  const updateElements = (next: BrandElement[]) => update({ brandElements: next.slice(0, 12) });
  const patchElement = (id: string, patch: Partial<BrandElement>) => {
    updateElements(elements.map(element => element.id === id ? { ...element, ...patch } as BrandElement : element));
  };
  const addTextElement = () => {
    if (elements.length >= 12) return toast.error("Cada template pode ter até 12 elementos de marca.");
    const element: BrandTextElement = {
      id: crypto.randomUUID(),
      type: "text",
      text: "NOME DA EDITORIA",
      x: 70,
      y: canvasH - 180,
      width: 420,
      fontSize: 34,
      color: "#FFFFFF",
      fontWeight: 700,
      align: "left",
      opacity: 1,
    };
    updateElements([...elements, element]);
    setSelectedElementId(element.id);
  };
  const uploadBrandElement = async (file: File) => {
    if (!user) return;
    if (elements.length >= 12) return toast.error("Cada template pode ter até 12 elementos de marca.");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      return toast.error("Use PNG, JPG ou WebP. Para logotipos, prefira PNG transparente.");
    }
    if (file.size > 2 * 1024 * 1024) return toast.error("O elemento precisa ter até 2 MB.");
    setElementUploading(true);
    try {
      const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const image = new Image();
        image.onload = () => {
          URL.revokeObjectURL(objectUrl);
          resolve({ width: image.naturalWidth, height: image.naturalHeight });
        };
        image.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("Não consegui ler esta imagem."));
        };
        image.src = objectUrl;
      });
      const extension = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${user.id}/elements/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from("template-backgrounds").upload(path, file, {
        upsert: false,
        contentType: file.type,
      });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from("template-backgrounds").getPublicUrl(path);
      const width = Math.min(420, Math.max(120, dimensions.width));
      const height = Math.min(320, Math.max(60, Math.round(width * dimensions.height / dimensions.width)));
      const element: BrandImageElement = {
        id: crypto.randomUUID(),
        type: "image",
        name: file.name.replace(/\.[^.]+$/, ""),
        url: publicUrl,
        x: Math.round((1080 - width) / 2),
        y: Math.max(40, canvasH - height - 80),
        width,
        height,
        opacity: 1,
      };
      updateElements([...elements, element]);
      setSelectedElementId(element.id);
      toast.success("Elemento adicionado ao template");
    } catch (error: any) {
      toast.error(error.message || "Não foi possível enviar o elemento.");
    } finally {
      setElementUploading(false);
      if (elementFileRef.current) elementFileRef.current.value = "";
    }
  };
  const layouts = getTemplateLayoutOptions(fmt);
  const gradient = resolveTemplateGradient(draft.preset_key, cfg);
  const updateGradient = (patch: { angle?: number; first?: string; last?: string }) => {
    const stops = gradient.stops.map((stop: any) => ({ ...stop }));
    if (patch.first) stops[0].color = patch.first;
    if (patch.last) stops[stops.length - 1].color = patch.last;
    update({ backgroundGradient: { angle: patch.angle ?? gradient.angle, stops } });
  };
  const beginDrag = (
    event: ReactPointerEvent,
    xKey: string,
    yKey: string,
    startX: number,
    startY: number,
    width: number,
    height: number,
  ) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    const pointerX = event.clientX;
    const pointerY = event.clientY;
    const move = (moveEvent: PointerEvent) => {
      const nextX = Math.max(0, Math.min(1080 - width, Math.round(startX + (moveEvent.clientX - pointerX) * 1080 / rect.width)));
      const nextY = Math.max(0, Math.min(canvasH - height, Math.round(startY + (moveEvent.clientY - pointerY) * canvasH / rect.height)));
      update({ [xKey]: nextX, [yKey]: nextY });
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };
  const beginElementDrag = (event: ReactPointerEvent, element: BrandElement) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    setSelectedElementId(element.id);
    const pointerX = event.clientX;
    const pointerY = event.clientY;
    const elementHeight = element.type === "image" ? element.height : element.fontSize * 1.4;
    const move = (moveEvent: PointerEvent) => patchElement(element.id, {
      x: Math.max(0, Math.min(1080 - element.width, Math.round(element.x + (moveEvent.clientX - pointerX) * 1080 / rect.width))),
      y: Math.max(0, Math.min(canvasH - elementHeight, Math.round(element.y + (moveEvent.clientY - pointerY) * canvasH / rect.height))),
    });
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  };
  const sampleTitle = "TÍTULO DA NOTÍCIA EM DESTAQUE AQUI";
  const sampleSub = "Subtítulo curto explicando o contexto da notícia";
  const hasChanges = isNew || JSON.stringify({ name: template.name, config: normalizeTemplateConfig(template.config, fmt) }) !== JSON.stringify({ name: draft.name, config: cfg });
  const canSave = draft.name.trim().length > 0 && hasChanges;

  return (
    <>
    <Dialog open={!!template} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden p-0">
        <DialogHeader>
          <div className="border-b border-border px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle>{isNew ? "Criar template" : "Ajustar template"} — {draft.name || template.name}</DialogTitle>
                <DialogDescription>{isNew ? "Comece pela composição, posicione cada bloco e confira a prévia antes de criar." : "Edite como rascunho, confira a prévia final e salve apenas quando estiver pronto."}</DialogDescription>
              </div>
              <Badge variant={hasChanges ? "default" : "outline"} className={hasChanges ? "bg-primary text-primary-foreground" : ""}>
                {hasChanges ? "Rascunho não salvo" : "Sem alterações"}
              </Badge>
            </div>
          </div>
        </DialogHeader>
      <div className="grid max-h-[calc(92vh-73px)] grid-cols-1 overflow-hidden lg:grid-cols-[minmax(360px,0.95fr)_minmax(420px,1fr)]">
        {/* Preview */}
        <div className="border-b border-border bg-muted/20 p-4 lg:border-b-0 lg:border-r lg:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <Label className="text-xs uppercase text-muted-foreground">Prévia técnica ({fmt === "feed" ? "1080×1080" : "1080×1920"})</Label>
              <p className="mt-1 text-xs text-muted-foreground">Ajuste os blocos. Use “Prévia final” para ver como aparece no Instagram.</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setFinalPreviewOpen(true)}>
              <Eye className="mr-2 h-4 w-4" /> Prévia final
            </Button>
          </div>
          <div className="flex max-h-[calc(92vh-160px)] min-h-[420px] items-start justify-center overflow-auto rounded-xl border border-border bg-background/60 p-3">
          <div ref={canvasRef} className={`${aspectClass} w-full max-w-[360px] relative overflow-hidden rounded-lg border border-border bg-zinc-900 shadow-card select-none`} style={{ containerType: "inline-size", touchAction: "none" }}>
            {draft.background_url ? (
              <img src={draft.background_url} className="absolute inset-0 w-full h-full object-cover" alt="" />
            ) : (
              <div className="absolute inset-0" style={{ background: templateGradientCss(draft.preset_key, draft.config) }} />
            )}
            {cfg.showPhoto && (
              <div onPointerDown={e => beginDrag(e, "photoX", "photoY", cfg.photoX, cfg.photoY, cfg.photoW, cfg.photoH)} className="absolute z-[1] bg-black/40 border-2 border-dashed border-yellow-400 flex cursor-move items-center justify-center text-yellow-300 text-[10px] font-bold uppercase tracking-wider"
                style={{
                  left: `${(cfg.photoX / 1080) * 100}%`,
                  top: `${(cfg.photoY / canvasH) * 100}%`,
                  width: `${(cfg.photoW / 1080) * 100}%`,
                  height: `${(cfg.photoH / canvasH) * 100}%`,
                }}>
                FOTO DA NOTÍCIA
              </div>
            )}
            {cfg.overlayOpacity > 0 && (
              <div className="pointer-events-none absolute inset-0 z-[2]" style={{ background: `rgba(0,0,0,${cfg.overlayOpacity})` }} />
            )}
            {cfg.showHandle && (
              <div onPointerDown={e => beginDrag(e, "handleX", "handleY", cfg.handleX, cfg.handleY, 260, 0)} className="absolute z-10 cursor-move font-mono font-bold tracking-wider outline outline-1 outline-transparent hover:outline-primary"
                style={{ left: `${(cfg.handleX / 1080) * 100}%`, top: `${((cfg.handleY - cfg.handleSize) / canvasH) * 100}%`, color: cfg.handleColor, fontSize: `${(cfg.handleSize / 1080) * 100}cqw` }}>
                @SUAMARCA
              </div>
            )}
            <div onPointerDown={e => beginDrag(e, "titleX", "titleY", cfg.titleX, cfg.titleY, cfg.titleW, 0)} className="absolute z-10 cursor-move whitespace-pre-line font-black uppercase leading-[1.05] outline outline-1 outline-transparent hover:outline-primary"
              style={{ left: `${(cfg.titleX / 1080) * 100}%`, width: `${(cfg.titleW / 1080) * 100}%`, top: `${((cfg.titleY - cfg.titleSize * 0.8) / canvasH) * 100}%`, color: cfg.titleColor, fontSize: `${(cfg.titleSize / 1080) * 100}cqw`, textAlign: cfg.titleAlign }}>
              {wrapPreviewText(sampleTitle, cfg.titleMaxChars, cfg.titleMaxLines)}
            </div>
            <div onPointerDown={e => beginDrag(e, "subtitleX", "subtitleY", cfg.subtitleX, cfg.subtitleY, cfg.subtitleW, 0)} className="absolute z-10 cursor-move whitespace-pre-line leading-[1.3] outline outline-1 outline-transparent hover:outline-primary"
              style={{ left: `${(cfg.subtitleX / 1080) * 100}%`, width: `${(cfg.subtitleW / 1080) * 100}%`, top: `${((cfg.subtitleY - cfg.subtitleSize * 0.8) / canvasH) * 100}%`, color: cfg.subtitleColor, fontSize: `${(cfg.subtitleSize / 1080) * 100}cqw`, textAlign: cfg.subtitleAlign }}>
              {wrapPreviewText(sampleSub, Math.floor(cfg.titleMaxChars * 2.2), cfg.subtitleMaxLines)}
            </div>
            {cfg.showBadge && (
              <div onPointerDown={e => beginDrag(e, "badgeX", "badgeY", cfg.badgeX, cfg.badgeY, cfg.badgeW, cfg.badgeH)} className="absolute z-10 flex cursor-move items-center justify-center overflow-hidden px-2 font-bold outline outline-1 outline-transparent hover:outline-primary"
                style={{ left: `${(cfg.badgeX / 1080) * 100}%`, top: `${(cfg.badgeY / canvasH) * 100}%`, width: `${(cfg.badgeW / 1080) * 100}%`, height: `${(cfg.badgeH / canvasH) * 100}%`, background: cfg.badgeBg, color: cfg.badgeColor, fontSize: `${(cfg.badgeSize / 1080) * 100}cqw` }}>
                {cfg.badgeText}
              </div>
            )}
            {elements.map(element => element.type === "image" ? (
              <img
                key={element.id}
                src={element.url}
                alt={element.name}
                onClick={() => setSelectedElementId(element.id)}
                onPointerDown={event => beginElementDrag(event, element)}
                className={`absolute z-[15] cursor-move object-contain outline outline-2 ${selectedElementId === element.id ? "outline-primary" : "outline-transparent hover:outline-primary/60"}`}
                style={{
                  left: `${(element.x / 1080) * 100}%`, top: `${(element.y / canvasH) * 100}%`,
                  width: `${(element.width / 1080) * 100}%`, height: `${(element.height / canvasH) * 100}%`,
                  opacity: element.opacity ?? 1,
                }}
              />
            ) : (
              <div
                key={element.id}
                onClick={() => setSelectedElementId(element.id)}
                onPointerDown={event => beginElementDrag(event, element)}
                className={`absolute z-[15] cursor-move whitespace-pre-line leading-tight outline outline-2 ${selectedElementId === element.id ? "outline-primary" : "outline-transparent hover:outline-primary/60"}`}
                style={{
                  left: `${(element.x / 1080) * 100}%`, top: `${(element.y / canvasH) * 100}%`,
                  width: `${(element.width / 1080) * 100}%`, color: element.color,
                  fontSize: `${(element.fontSize / 1080) * 100}cqw`, fontWeight: element.fontWeight,
                  textAlign: element.align, opacity: element.opacity ?? 1,
                }}
              >
                {element.text}
              </div>
            ))}
            <div className="pointer-events-none absolute inset-[5.5%] z-20 border border-white/20" />
          </div>
          </div>
        </div>

        {/* Controles */}
        <div className="flex min-h-0 flex-col">
        <div className="space-y-4 overflow-auto px-5 py-4">
          <div>
            <Label>Nome</Label>
            <Input value={draft.name} onChange={e => setDraft(current => ({ ...current, name: e.target.value }))} />
          </div>

          <Section title="Composicao profissional">
            <p className="text-xs text-muted-foreground">Escolha uma estrutura inicial e depois arraste os blocos diretamente na arte.</p>
            <div className="grid grid-cols-2 gap-2">
              {layouts.map(layout => (
                <Button key={layout.index} type="button" size="sm" variant="outline" onClick={() => update(layout.values)}>
                  {layout.name}
                </Button>
              ))}
            </div>
            <Button type="button" size="sm" variant="ghost" className="w-full" onClick={() => update({ ...getDefaultTemplateConfig(fmt), ...getPresetTemplateLayout(draft.preset_key, fmt) })}>
              Restaurar composicao do modelo
            </Button>
          </Section>

          <Section title="Elementos de marca">
            <p className="text-xs text-muted-foreground">
              Adicione editorias, chamadas fixas, logotipos, selos ou imagens transparentes. Esses elementos permanecem em todas as publicações deste template.
            </p>
            <input
              ref={elementFileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              hidden
              onChange={event => event.target.files?.[0] && uploadBrandElement(event.target.files[0])}
            />
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" size="sm" variant="outline" onClick={addTextElement}>
                <Plus className="mr-2 h-4 w-4" /> Adicionar texto
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={elementUploading} onClick={() => elementFileRef.current?.click()}>
                <ImageIcon className="mr-2 h-4 w-4" /> {elementUploading ? "Enviando..." : "Logo ou imagem"}
              </Button>
            </div>

            {elements.length === 0 ? (
              <div className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
                Nenhum elemento de marca adicionado.
              </div>
            ) : (
              <div className="space-y-2">
                {elements.map((element, index) => (
                  <button
                    key={element.id}
                    type="button"
                    onClick={() => setSelectedElementId(element.id)}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition ${selectedElementId === element.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                  >
                    <span className="truncate">
                      {index + 1}. {element.type === "text" ? element.text || "Texto sem conteúdo" : element.name || "Imagem"}
                    </span>
                    <Badge variant="outline" className="ml-2 text-[10px]">{element.type === "text" ? "Texto" : "Imagem"}</Badge>
                  </button>
                ))}
              </div>
            )}

            {selectedElement && (
              <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">Editar elemento</div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-8 text-destructive hover:text-destructive"
                    onClick={() => {
                      updateElements(elements.filter(element => element.id !== selectedElement.id));
                      setSelectedElementId(null);
                    }}
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Remover
                  </Button>
                </div>

                {selectedElement.type === "text" ? (
                  <>
                    <div><Label>Texto fixo</Label><Input value={selectedElement.text} maxLength={80} onChange={event => patchElement(selectedElement.id, { text: event.target.value })} /></div>
                    <RangeRow label="Largura" value={selectedElement.width} min={100} max={1080} onChange={value => patchElement(selectedElement.id, { width: value })} />
                    <RangeRow label="Tamanho" value={selectedElement.fontSize} min={14} max={140} onChange={value => patchElement(selectedElement.id, { fontSize: value })} />
                    <RangeRow label="Peso" value={selectedElement.fontWeight} min={300} max={900} onChange={value => patchElement(selectedElement.id, { fontWeight: value })} />
                    <AlignRow label="Alinhamento" value={selectedElement.align} onChange={value => patchElement(selectedElement.id, { align: value })} />
                    <ColorRow label="Cor" value={selectedElement.color} onChange={value => patchElement(selectedElement.id, { color: value })} />
                  </>
                ) : (
                  <>
                    <div><Label>Nome do elemento</Label><Input value={selectedElement.name} maxLength={80} onChange={event => patchElement(selectedElement.id, { name: event.target.value })} /></div>
                    <RangeRow label="Largura" value={selectedElement.width} min={40} max={1080} onChange={value => patchElement(selectedElement.id, { width: value })} />
                    <RangeRow label="Altura" value={selectedElement.height} min={30} max={canvasH} onChange={value => patchElement(selectedElement.id, { height: value })} />
                  </>
                )}
                <RangeRow label="Posição horizontal" value={selectedElement.x} min={0} max={1080} onChange={value => patchElement(selectedElement.id, { x: value })} />
                <RangeRow label="Posição vertical" value={selectedElement.y} min={0} max={canvasH} onChange={value => patchElement(selectedElement.id, { y: value })} />
                <RangeRow label="Opacidade" value={Math.round((selectedElement.opacity ?? 1) * 100)} min={10} max={100} onChange={value => patchElement(selectedElement.id, { opacity: value / 100 })} />
              </div>
            )}
          </Section>

          <Section title="Título">
            <RangeRow label="Posição horizontal" value={cfg.titleX} min={0} max={1000} onChange={v => update({ titleX: v })} />
            <RangeRow label="Posição vertical" value={cfg.titleY} min={50} max={canvasH - 80} onChange={v => update({ titleY: v })} />
            <RangeRow label="Largura da caixa" value={cfg.titleW} min={180} max={1080} onChange={v => update({ titleW: v })} />
            <RangeRow label="Tamanho" value={cfg.titleSize} min={32} max={120} onChange={v => update({ titleSize: v })} />
            <RangeRow label="Caracteres por linha" value={cfg.titleMaxChars} min={12} max={40} onChange={v => update({ titleMaxChars: v })} />
            <RangeRow label="Máximo de linhas" value={cfg.titleMaxLines} min={1} max={7} onChange={v => update({ titleMaxLines: v })} />
            <AlignRow label="Alinhamento" value={cfg.titleAlign} onChange={v => update({ titleAlign: v })} />
            <ColorRow label="Cor" value={cfg.titleColor} onChange={v => update({ titleColor: v })} />
          </Section>

          <Section title="Subtítulo">
            <RangeRow label="Posição horizontal" value={cfg.subtitleX} min={0} max={1000} onChange={v => update({ subtitleX: v })} />
            <RangeRow label="Posição vertical" value={cfg.subtitleY} min={50} max={canvasH - 40} onChange={v => update({ subtitleY: v })} />
            <RangeRow label="Largura da caixa" value={cfg.subtitleW} min={180} max={1080} onChange={v => update({ subtitleW: v })} />
            <RangeRow label="Tamanho" value={cfg.subtitleSize} min={16} max={48} onChange={v => update({ subtitleSize: v })} />
            <RangeRow label="Máximo de linhas" value={cfg.subtitleMaxLines} min={1} max={5} onChange={v => update({ subtitleMaxLines: v })} />
            <AlignRow label="Alinhamento" value={cfg.subtitleAlign} onChange={v => update({ subtitleAlign: v })} />
            <ColorRow label="Cor" value={cfg.subtitleColor} onChange={v => update({ subtitleColor: v })} />
          </Section>

          <Section title="Handle (@marca)">
            <Toggle label="Mostrar handle" value={cfg.showHandle} onChange={v => update({ showHandle: v })} />
            {cfg.showHandle && <>
              <RangeRow label="Posição horizontal" value={cfg.handleX} min={0} max={900} onChange={v => update({ handleX: v })} />
              <RangeRow label="Posição vertical" value={cfg.handleY} min={20} max={canvasH - 20} onChange={v => update({ handleY: v })} />
              <RangeRow label="Tamanho" value={cfg.handleSize} min={14} max={54} onChange={v => update({ handleSize: v })} />
              <ColorRow label="Cor" value={cfg.handleColor} onChange={v => update({ handleColor: v })} />
            </>}
          </Section>

          <Section title="Badge / Selo">
            <Toggle label="Mostrar selo" value={cfg.showBadge} onChange={v => update({ showBadge: v })} />
            {cfg.showBadge && <>
              <div><Label>Texto</Label><Input value={cfg.badgeText} onChange={e => update({ badgeText: e.target.value })} /></div>
              <RangeRow label="Posição horizontal" value={cfg.badgeX} min={0} max={1000} onChange={v => update({ badgeX: v })} />
              <RangeRow label="Posição vertical" value={cfg.badgeY} min={20} max={canvasH - 40} onChange={v => update({ badgeY: v })} />
              <RangeRow label="Largura" value={cfg.badgeW} min={160} max={1080} onChange={v => update({ badgeW: v })} />
              <RangeRow label="Altura" value={cfg.badgeH} min={36} max={160} onChange={v => update({ badgeH: v })} />
              <RangeRow label="Tamanho do texto" value={cfg.badgeSize} min={12} max={48} onChange={v => update({ badgeSize: v })} />
              <ColorRow label="Fundo" value={cfg.badgeBg} onChange={v => update({ badgeBg: v })} />
              <ColorRow label="Cor texto" value={cfg.badgeColor} onChange={v => update({ badgeColor: v })} />
            </>}
          </Section>

          <Section title="Caixa da foto da notícia">
            <Toggle label="Mostrar foto da notícia" value={cfg.showPhoto} onChange={v => update({ showPhoto: v })} />
            {cfg.showPhoto && <>
              <p className="text-xs text-muted-foreground">Encaixe a caixa amarela no espaço do template onde a foto deve aparecer (ex: a área da câmera).</p>
              <RangeRow label="Posição X (esquerda)" value={cfg.photoX} min={0} max={1080} onChange={v => update({ photoX: v })} />
              <RangeRow label="Posição Y (topo)" value={cfg.photoY} min={0} max={canvasH} onChange={v => update({ photoY: v })} />
              <RangeRow label="Largura" value={cfg.photoW} min={100} max={1080} onChange={v => update({ photoW: v })} />
              <RangeRow label="Altura" value={cfg.photoH} min={100} max={canvasH} onChange={v => update({ photoH: v })} />
            </>}
          </Section>

          <Section title="Escurecimento de fundo">
            <RangeRow label="Opacidade" value={Math.round(cfg.overlayOpacity * 100)} min={0} max={90} onChange={v => update({ overlayOpacity: v / 100 })} />
          </Section>

          {!draft.background_url && (
            <Section title="Fundo em gradiente">
              <RangeRow label="Direção" value={Math.round(gradient.angle)} min={0} max={360} onChange={v => updateGradient({ angle: v })} />
              <ColorRow label="Cor inicial" value={gradient.stops[0].color} onChange={v => updateGradient({ first: v })} />
              <ColorRow label="Cor final" value={gradient.stops[gradient.stops.length - 1].color} onChange={v => updateGradient({ last: v })} />
            </Section>
          )}
        </div>
          <div className="grid gap-2 border-t border-border bg-card p-4 sm:grid-cols-[1fr_auto_auto]">
            <Button onClick={() => setFinalPreviewOpen(true)} variant="outline" className="sm:order-2">
              <Eye className="mr-2 h-4 w-4" /> Prévia final
            </Button>
            <Button variant="outline" onClick={onClose} className="sm:order-3">Cancelar</Button>
            <Button onClick={() => onSave({ ...draft, name: draft.name.trim(), config: cfg })} disabled={!canSave} className="sm:order-1">
              {isNew ? "Criar template" : "Salvar alterações"}
            </Button>
          </div>
        </div>
      </div>
      </DialogContent>
    </Dialog>
    <InstagramPreviewDialog
      template={finalPreviewOpen ? { ...draft, config: cfg } : null}
      brand={brand}
      onClose={() => setFinalPreviewOpen(false)}
    />
    </>
  );
}

function Section({ title, children }: { title: string; children: any }) {
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{title}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
function RangeRow({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="flex justify-between text-xs"><span>{label}</span><span className="tabular-nums text-muted-foreground">{value}</span></div>
      <Slider value={[value]} min={min} max={max} step={1} onValueChange={([v]) => onChange(v)} />
    </div>
  );
}
function ColorRow({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-xs">{label}</Label>
      <input type="color" value={value} onChange={e => onChange(e.target.value)} className="h-8 w-14 rounded border border-border bg-transparent" />
    </div>
  );
}
function AlignRow({ label, value, onChange }: { label: string; value: string; onChange: (v: "left" | "center" | "right") => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label className="text-xs">{label}</Label>
      <div className="flex overflow-hidden rounded-md border border-border">
        {(["left", "center", "right"] as const).map(option => (
          <button key={option} type="button" onClick={() => onChange(option)} className={`px-3 py-1 text-xs ${value === option ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:text-foreground"}`}>
            {option === "left" ? "Esq." : option === "center" ? "Centro" : "Dir."}
          </button>
        ))}
      </div>
    </div>
  );
}
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 cursor-pointer">
      <span className="text-xs">{label}</span>
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} className="h-4 w-4 accent-primary" />
    </label>
  );
}
