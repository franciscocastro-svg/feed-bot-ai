import { useEffect, useRef, useState } from "react";
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
import { resolveTemplateGradient, templateGradientCss } from "../../../supabase/functions/_shared/template-gradients.js";

type PostFormat = "feed" | "stories" | "reels";

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

type NichePreset = {
  key: string;
  name: string;
  description: string;
  config: Record<string, any>;
};

type Niche = {
  key: string;
  label: string;
  icon: any;
  accent: string;
  presets: NichePreset[];
};

// Biblioteca profissional de templates organizados por nicho.
// Cada preset traz paleta e selo apropriados ao tema — tudo editável depois.
const NICHES: Niche[] = [
  {
    key: "noticias", label: "Notícias", icon: Newspaper, accent: "#DC2626",
    presets: [
      { key: "news_minimal", name: "Minimal Editorial", description: "Header branco, foto embaixo, selo amarelo",
        config: { titleColor: "#0A0A0A", subtitleColor: "#52525B", badgeBg: "#FFD400", badgeColor: "#000000", badgeText: "LEIA A LEGENDA →", overlayOpacity: 0 } },
      { key: "news_breaking", name: "Breaking News", description: "Vermelho urgente, fundo escuro",
        config: { titleColor: "#FFFFFF", subtitleColor: "#FCA5A5", badgeBg: "#DC2626", badgeColor: "#FFFFFF", badgeText: "URGENTE", overlayOpacity: 0.55 } },
      { key: "news_classic", name: "Jornal Clássico", description: "Bege papel, ar de autoridade",
        config: { titleColor: "#1F2937", subtitleColor: "#6B7280", badgeBg: "#1F2937", badgeColor: "#F5F1E8", badgeText: "EDIÇÃO DE HOJE", overlayOpacity: 0.3 } },
      { key: "news_yellow", name: "Bold Stripe", description: "Faixa amarela no topo, título grande",
        config: { titleColor: "#000000", subtitleColor: "#27272A", badgeBg: "#000000", badgeColor: "#FFD400", badgeText: "DESTAQUE", overlayOpacity: 0 } },
    ],
  },
  {
    key: "economia", label: "Economia", icon: TrendingUp, accent: "#047857",
    presets: [
      { key: "econ_bull", name: "Mercado em Alta", description: "Verde dinheiro, otimismo",
        config: { titleColor: "#FFFFFF", subtitleColor: "#A7F3D0", badgeBg: "#10B981", badgeColor: "#022C22", badgeText: "↑ ALTA", overlayOpacity: 0.4 } },
      { key: "econ_bear", name: "Mercado em Baixa", description: "Vermelho/preto, queda da bolsa",
        config: { titleColor: "#FFFFFF", subtitleColor: "#FCA5A5", badgeBg: "#DC2626", badgeColor: "#FFFFFF", badgeText: "↓ QUEDA", overlayOpacity: 0.5 } },
      { key: "econ_corp", name: "Corporativo Premium", description: "Azul marinho + dourado",
        config: { titleColor: "#FFFFFF", subtitleColor: "#BFDBFE", badgeBg: "#FBBF24", badgeColor: "#0F172A", badgeText: "MERCADO", overlayOpacity: 0.35 } },
      { key: "econ_fintech", name: "Fintech Minimal", description: "Branco + verde menta",
        config: { titleColor: "#0F172A", subtitleColor: "#475569", badgeBg: "#0F172A", badgeColor: "#10B981", badgeText: "ECONOMIA", overlayOpacity: 0 } },
    ],
  },
  {
    key: "futebol", label: "Futebol & Esportes", icon: Trophy, accent: "#16A34A",
    presets: [
      { key: "soc_stadium", name: "Estádio Noturno", description: "Preto + verde grama",
        config: { titleColor: "#FFFFFF", subtitleColor: "#86EFAC", badgeBg: "#16A34A", badgeColor: "#000000", badgeText: "GOL!", overlayOpacity: 0.5 } },
      { key: "soc_brasil", name: "Verde-Amarelo BR", description: "Cores da seleção",
        config: { titleColor: "#0F172A", subtitleColor: "#1F2937", badgeBg: "#15803D", badgeColor: "#FACC15", badgeText: "SELEÇÃO", overlayOpacity: 0.2 } },
      { key: "soc_derby", name: "Clássico", description: "Vermelho × preto, rivalidade",
        config: { titleColor: "#FFFFFF", subtitleColor: "#FCA5A5", badgeBg: "#FFFFFF", badgeColor: "#DC2626", badgeText: "CLÁSSICO", overlayOpacity: 0.45 } },
      { key: "soc_champ", name: "Champions Premium", description: "Azul + estrela dourada",
        config: { titleColor: "#FFFFFF", subtitleColor: "#C7D2FE", badgeBg: "#FBBF24", badgeColor: "#1E1B4B", badgeText: "★ FINAL", overlayOpacity: 0.4 } },
    ],
  },
  {
    key: "fofoca", label: "Fofoca & Celebridades", icon: Sparkles, accent: "#EC4899",
    presets: [
      { key: "gos_pink", name: "Rosa Glamour", description: "Rosa choque, chamativo",
        config: { titleColor: "#FFFFFF", subtitleColor: "#FCE7F3", badgeBg: "#FBBF24", badgeColor: "#831843", badgeText: "🔥 EXCLUSIVO", overlayOpacity: 0.35 } },
      { key: "gos_tab", name: "Tabloide Sensação", description: "Amarelo neon + manchete grande",
        config: { titleColor: "#FFFFFF", subtitleColor: "#FDE68A", badgeBg: "#DC2626", badgeColor: "#FFFFFF", badgeText: "BOMBA!", overlayOpacity: 0.5 } },
      { key: "gos_carpet", name: "Tapete Vermelho", description: "Vermelho + dourado, luxo",
        config: { titleColor: "#FFFFFF", subtitleColor: "#FEF3C7", badgeBg: "#FBBF24", badgeColor: "#7F1D1D", badgeText: "★ CELEB", overlayOpacity: 0.4 } },
      { key: "gos_pastel", name: "Pastel Casual", description: "Lilás + rosa, leve e atual",
        config: { titleColor: "#5B21B6", subtitleColor: "#9333EA", badgeBg: "#5B21B6", badgeColor: "#FBCFE8", badgeText: "DEU O QUE FALAR", overlayOpacity: 0 } },
    ],
  },
  {
    key: "advogados", label: "Direito & Advocacia", icon: Scale, accent: "#1E3A8A",
    presets: [
      { key: "law_classic", name: "Sóbrio Institucional", description: "Azul marinho + dourado",
        config: { titleColor: "#FFFFFF", subtitleColor: "#BFDBFE", badgeBg: "#FBBF24", badgeColor: "#0F172A", badgeText: "DIREITO", overlayOpacity: 0.4 } },
      { key: "law_serif", name: "Serifa Editorial", description: "Bege + preto, manual jurídico",
        config: { titleColor: "#1F2937", subtitleColor: "#4B5563", badgeBg: "#1F2937", badgeColor: "#F5F1E8", badgeText: "§ ENTENDA", overlayOpacity: 0.3 } },
      { key: "law_premium", name: "Vinho & Marfim", description: "Vinho profundo, premium",
        config: { titleColor: "#FEF3C7", subtitleColor: "#FCA5A5", badgeBg: "#FEF3C7", badgeColor: "#7F1D1D", badgeText: "JURISPRUDÊNCIA", overlayOpacity: 0.4 } },
      { key: "law_modern", name: "Moderno Minimal", description: "Cinza grafite + branco",
        config: { titleColor: "#FFFFFF", subtitleColor: "#D1D5DB", badgeBg: "#1E3A8A", badgeColor: "#FFFFFF", badgeText: "ART. LEI", overlayOpacity: 0.3 } },
    ],
  },
  {
    key: "medicos", label: "Saúde & Medicina", icon: Stethoscope, accent: "#0891B2",
    presets: [
      { key: "med_clean", name: "Clínico Limpo", description: "Branco + azul ciano, confiança",
        config: { titleColor: "#0F172A", subtitleColor: "#475569", badgeBg: "#0891B2", badgeColor: "#FFFFFF", badgeText: "+ SAÚDE", overlayOpacity: 0 } },
      { key: "med_alert", name: "Alerta Saúde", description: "Laranja + branco, atenção",
        config: { titleColor: "#9A3412", subtitleColor: "#C2410C", badgeBg: "#DC2626", badgeColor: "#FFFFFF", badgeText: "ALERTA", overlayOpacity: 0 } },
      { key: "med_research", name: "Pesquisa Científica", description: "Azul escuro + grafismo",
        config: { titleColor: "#FFFFFF", subtitleColor: "#BAE6FD", badgeBg: "#FFFFFF", badgeColor: "#082F49", badgeText: "ESTUDO", overlayOpacity: 0.4 } },
      { key: "med_wellness", name: "Bem-estar Verde", description: "Verde sálvia + creme",
        config: { titleColor: "#14532D", subtitleColor: "#166534", badgeBg: "#14532D", badgeColor: "#F0FDF4", badgeText: "BEM-ESTAR", overlayOpacity: 0.2 } },
    ],
  },
  {
    key: "tecnologia", label: "Tecnologia", icon: Cpu, accent: "#8B5CF6",
    presets: [
      { key: "tec_dark", name: "Dark Mode", description: "Preto + roxo neon",
        config: { titleColor: "#FFFFFF", subtitleColor: "#C4B5FD", badgeBg: "#A78BFA", badgeColor: "#0A0A0A", badgeText: "TECH", overlayOpacity: 0.4 } },
      { key: "tec_ai", name: "AI Gradient", description: "Roxo → azul, vibe IA",
        config: { titleColor: "#FFFFFF", subtitleColor: "#E0E7FF", badgeBg: "#FFFFFF", badgeColor: "#6366F1", badgeText: "★ IA", overlayOpacity: 0.3 } },
      { key: "tec_startup", name: "Startup Branco", description: "Branco + acento ciano",
        config: { titleColor: "#0F172A", subtitleColor: "#475569", badgeBg: "#06B6D4", badgeColor: "#FFFFFF", badgeText: "LANÇAMENTO", overlayOpacity: 0 } },
      { key: "tec_cyber", name: "Cyberpunk", description: "Magenta + ciano, neon",
        config: { titleColor: "#FFFFFF", subtitleColor: "#FBCFE8", badgeBg: "#FACC15", badgeColor: "#831843", badgeText: "FUTURO", overlayOpacity: 0.45 } },
    ],
  },
  {
    key: "religiao", label: "Religião & Fé", icon: Church, accent: "#7C2D12",
    presets: [
      { key: "rel_golden", name: "Dourado Sagrado", description: "Marrom + dourado, solene",
        config: { titleColor: "#FFFFFF", subtitleColor: "#FEF3C7", badgeBg: "#FBBF24", badgeColor: "#451A03", badgeText: "✝ PALAVRA", overlayOpacity: 0.45 } },
      { key: "rel_peace", name: "Azul Celeste", description: "Azul céu + branco, paz",
        config: { titleColor: "#FFFFFF", subtitleColor: "#BFDBFE", badgeBg: "#FFFFFF", badgeColor: "#1E40AF", badgeText: "FÉ", overlayOpacity: 0.3 } },
      { key: "rel_minimal", name: "Salmo Minimal", description: "Creme + serifa, versículo",
        config: { titleColor: "#1F2937", subtitleColor: "#6B7280", badgeBg: "#7C2D12", badgeColor: "#FAF7F0", badgeText: "VERSÍCULO", overlayOpacity: 0.1 } },
      { key: "rel_revival", name: "Avivamento", description: "Roxo + amarelo glória",
        config: { titleColor: "#FFFFFF", subtitleColor: "#DDD6FE", badgeBg: "#FBBF24", badgeColor: "#4C1D95", badgeText: "🔥 AVIVA", overlayOpacity: 0.35 } },
    ],
  },
];

const DEFAULT_CONFIG = {
  titleY: 180,
  titleSize: 56,
  titleColor: "#FFFFFF",
  titleMaxChars: 26,
  subtitleY: 440,
  subtitleSize: 24,
  subtitleColor: "#FFFFFF",
  showHandle: true,
  handleY: 90,
  handleColor: "#FFFFFF",
  showBadge: true,
  badgeText: "LEIA A LEGENDA →",
  badgeBg: "#FFD400",
  badgeColor: "#000000",
  badgeY: 990,
  overlayOpacity: 0.35,
  showPhoto: true,
  photoX: 0,
  photoY: 528,
  photoW: 1080,
  photoH: 552,
};

const LEGACY_DEFAULT_POSITIONS = {
  titleY: 540,
  subtitleY: 800,
  badgeY: 980,
  photoX: 90,
  photoY: 600,
  photoW: 420,
  photoH: 280,
};

function getDefaultConfig(format: PostFormat = "feed") {
  if (format === "stories" || format === "reels") {
    return {
      ...DEFAULT_CONFIG,
      titleY: 1040,
      titleSize: 74,
      titleMaxChars: 22,
      subtitleY: 1380,
      subtitleSize: 32,
      handleY: 130,
      badgeY: 1540,
      photoX: 0,
      photoY: 0,
      photoW: 1080,
      photoH: 1920,
      overlayOpacity: 0.45,
    };
  }
  return { ...DEFAULT_CONFIG };
}

function normalizeConfig(config: any, format: PostFormat = "feed") {
  const base = getDefaultConfig(format);
  const merged = { ...base, ...(config || {}) };
  const legacyLayout =
    merged.titleY === LEGACY_DEFAULT_POSITIONS.titleY &&
    merged.subtitleY === LEGACY_DEFAULT_POSITIONS.subtitleY &&
    merged.badgeY === LEGACY_DEFAULT_POSITIONS.badgeY &&
    merged.photoX === LEGACY_DEFAULT_POSITIONS.photoX &&
    merged.photoY === LEGACY_DEFAULT_POSITIONS.photoY &&
    merged.photoW === LEGACY_DEFAULT_POSITIONS.photoW &&
    merged.photoH === LEGACY_DEFAULT_POSITIONS.photoH;

  if (!legacyLayout) return merged;
  return {
    ...merged,
    titleY: base.titleY,
    titleSize: base.titleSize,
    titleMaxChars: base.titleMaxChars,
    subtitleY: base.subtitleY,
    subtitleSize: base.subtitleSize,
    handleY: base.handleY,
    badgeY: base.badgeY,
    photoX: base.photoX,
    photoY: base.photoY,
    photoW: base.photoW,
    photoH: base.photoH,
    overlayOpacity: base.overlayOpacity,
  };
}

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
  const [editing, setEditing] = useState<Template | null>(null);
  const [previewing, setPreviewing] = useState<Template | null>(null);
  const [brand, setBrand] = useState<{ handle?: string; name?: string; logo?: string }>({});
  const [uploading, setUploading] = useState(false);
  const [criteriaOpen, setCriteriaOpen] = useState(false);
  const [selectedNiche, setSelectedNiche] = useState<string>(NICHES[0].key);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    if (!user) return;
    const [{ data: tpls }, settingsRes] = await Promise.all([
      supabase.from("post_templates").select("*").order("created_at", { ascending: false }),
      supabase
        .from("user_settings")
        .select("default_template_id, default_feed_template_id, default_story_template_id, default_reel_template_id, brand_handle, brand_name, brand_logo_url")
        .eq("user_id", user.id)
        .maybeSingle(),
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
    const templateList = (tpls || []) as Template[];
    const hasFormat = (id: string | null | undefined, format: PostFormat) =>
      !!id && templateList.some(template => template.id === id && (template.format || "feed") === format);
    const legacyDefault = settings?.default_template_id || null;
    const feedDefault = settings?.default_feed_template_id || legacyDefault;
    setDefaultIds({
      feed: hasFormat(feedDefault, "feed") ? feedDefault : null,
      stories: hasFormat(settings?.default_story_template_id, "stories") ? settings?.default_story_template_id ?? null : null,
      reels: hasFormat(settings?.default_reel_template_id, "reels") ? settings?.default_reel_template_id ?? null : null,
    });
    setBrand({ handle: settings?.brand_handle ?? undefined, name: settings?.brand_name ?? undefined, logo: settings?.brand_logo_url ?? undefined });
  }
  useEffect(() => { load(); }, [user]);

  async function setDefault(id: string, format: PostFormat) {
    const column = DEFAULT_COLUMN_BY_FORMAT[format];
    const update: Record<string, string> = { [column]: id };
    if (format === "feed") update.default_template_id = id;
    const [userSettingsResult, accountSettingsResult] = await Promise.all([
      supabase.from("user_settings").update(update as any).eq("user_id", user!.id),
      supabase.from("account_settings").update(update as any).eq("user_id", user!.id),
    ]);
    if (userSettingsResult.error) return toast.error(userSettingsResult.error.message);
    if (accountSettingsResult.error) {
      toast.warning("Padrão salvo, mas não consegui sincronizar as contas conectadas.");
    }
    setDefaultIds(prev => ({ ...prev, [format]: id }));
    toast.success(`Template padrão de ${format === "feed" ? "Feed" : format === "stories" ? "Stories" : "Reels"} definido e aplicado às contas`);
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

  async function addPreset(p: NichePreset, format: PostFormat) {
    try {
      await ensureTemplateLimit();
    } catch (e: any) {
      return toast.error(e.message);
    }
    const mergedConfig = {
      ...getDefaultConfig(format),
      ...p.config,
      backgroundGradient: resolveTemplateGradient(p.key, p.config),
    };
    const { data, error } = await supabase.from("post_templates").insert({
      user_id: user!.id, name: p.name, kind: "preset", preset_key: p.key, config: mergedConfig, format,
    }).select().single();
    if (error) return toast.error(error.message);
    setTemplates(t => [data as Template, ...t]);
    toast.success(`${p.name} adicionado em ${format}`);
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
        ...getDefaultConfig(uploadFormatRef.current),
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
    fileRef.current?.click();
  }

  async function remove(template: Template) {
    if (!confirm("Remover este template?")) return;
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
    const { error } = await supabase.from("post_templates").update({
      name: t.name, config: t.config,
    }).eq("id", t.id);
    if (error) return toast.error(error.message);
    setTemplates(list => list.map(x => x.id === t.id ? t : x));
    setEditing(null);
    toast.success("Salvo");
  }

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

      {FORMATS.map(fmt => {
        const Icon = fmt.icon;
        const list = templates.filter(t => (t.format || "feed") === fmt.key);
        const activeDefaultId = defaultIds[fmt.key];
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
                    <ShieldCheck className="h-3 w-3" /> Padrão ativo
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 border-amber-500/30 text-amber-400">
                    <AlertTriangle className="h-3 w-3" /> Sem padrão
                  </Badge>
                )}
              </div>
              <Button size="sm" onClick={() => triggerUpload(fmt.key)} disabled={uploading}>
                <Upload className="h-4 w-4 mr-2" /> Subir arte
              </Button>
            </div>

            {/* Biblioteca de modelos por nicho */}
            <div className="rounded-xl border border-border bg-gradient-to-br from-background to-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Layers className="h-4 w-4 text-primary" />
                  Biblioteca de modelos por nicho
                </div>
                <span className="text-xs text-muted-foreground">Clique em um modelo para adicionar à sua coleção</span>
              </div>

              {/* Abas de nicho */}
              <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin">
                {NICHES.map(n => {
                  const NIcon = n.icon;
                  const active = selectedNiche === n.key;
                  return (
                    <button
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

              {/* Modelos do nicho selecionado */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(NICHES.find(n => n.key === selectedNiche)?.presets || []).map(p => (
                  <button
                    key={p.key}
                    onClick={() => addPreset(p, fmt.key)}
                    className="group text-left rounded-lg border border-border bg-card p-2 hover:border-primary hover:shadow-md transition-all"
                  >
                    <div className={`${fmt.aspect} rounded-md mb-2 relative overflow-hidden`} style={{ background: templateGradientCss(p.key, p.config) }}>
                      {/* mock title + badge para parecer com uma arte real */}
                      <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 text-[8px] font-black uppercase leading-tight" style={{ color: p.config.titleColor || "#fff" }}>
                        Título da<br />notícia
                      </div>
                      <div className="absolute right-1.5 bottom-1.5 px-1.5 py-0.5 text-[6px] font-bold rounded-sm" style={{ background: p.config.badgeBg, color: p.config.badgeColor }}>
                        {p.config.badgeText}
                      </div>
                    </div>
                    <div className="font-semibold text-xs truncate">{p.name}</div>
                    <div className="text-[10px] text-muted-foreground line-clamp-1">{p.description}</div>
                    <div className="mt-1.5 flex items-center justify-center gap-1 text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                      <Plus className="h-3 w-3" /> Adicionar
                    </div>
                  </button>
                ))}
              </div>
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
                  {list.map(t => (
                    <Card key={t.id} className="overflow-hidden">
                      <div className={`${fmt.aspect} bg-muted relative`}>
                        {t.background_url ? (
                          <img src={t.background_url} alt={t.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full" style={{ background: templateGradientCss(t.preset_key, t.config) }} />
                        )}
                        {activeDefaultId === t.id && (
                          <Badge className="absolute top-2 left-2 bg-primary"><Star className="h-3 w-3 mr-1" />Padrão</Badge>
                        )}
                      </div>
                      <div className="p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="font-medium truncate">{t.name}</div>
                          <Badge variant="outline" className="text-xs">{t.kind === "custom" ? "Custom" : "Preset"}</Badge>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <Button size="sm" variant="outline" className="flex-1 min-w-[80px]" onClick={() => setEditing(t)}>Ajustar</Button>
                          <Button size="sm" variant="secondary" className="flex-1 min-w-[80px]" onClick={() => setPreviewing(t)}>
                            <Eye className="h-4 w-4 mr-1" /> Prévia
                          </Button>
                          {activeDefaultId !== t.id && (
                            <Button size="sm" variant="ghost" title={`Definir como padrão de ${fmt.label}`} onClick={() => setDefault(t.id, fmt.key)}><Check className="h-4 w-4" /></Button>
                          )}
                          <Button size="sm" variant="ghost" title="Remover template" onClick={() => remove(t)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    </Card>
                  ))}
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
        />
      )}

      <InstagramPreviewDialog
        template={previewing}
        brand={brand}
        onClose={() => setPreviewing(null)}
      />
    </div>
  );
}

function InstagramPreviewDialog({ template, brand, onClose }: {
  template: Template | null;
  brand: { handle?: string; name?: string; logo?: string };
  onClose: () => void;
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
    const cfg = normalizeConfig(template.config, fmt);
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
            style={{ left: "5.5%", top: yP(cfg.handleY - 24), color: cfg.handleColor, fontSize: fontPct(28) }}>
            @{handle.toUpperCase()}
          </div>
        )}

        <div className="absolute whitespace-pre-line font-black uppercase leading-[1.05]"
          style={{ left: "5.5%", right: "5.5%", top: yP(cfg.titleY - cfg.titleSize * 0.8), color: cfg.titleColor, fontSize: fontPct(cfg.titleSize) }}>
          {wrapPreviewText(sampleTitle, cfg.titleMaxChars, 5)}
        </div>

        <div className="absolute whitespace-pre-line leading-snug"
          style={{ left: "5.5%", right: "5.5%", top: yP(cfg.subtitleY - cfg.subtitleSize * 0.8), color: cfg.subtitleColor, fontSize: fontPct(cfg.subtitleSize) }}>
          {wrapPreviewText(sampleSub, Math.floor(cfg.titleMaxChars * 2.2), 3)}
        </div>

        {cfg.showBadge && (
          <div className="absolute font-bold"
            style={{
              right: "5.5%", top: yP(cfg.badgeY),
              background: cfg.badgeBg, color: cfg.badgeColor,
              padding: `${fontPct(10)} ${fontPct(18)}`,
              fontSize: fontPct(22),
              borderRadius: 4,
            }}>
            {cfg.badgeText}
          </div>
        )}
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

function EditorPanel({ template, brand, onClose, onSave }: {
  template: Template;
  brand: { handle?: string; name?: string; logo?: string };
  onClose: () => void;
  onSave: (t: Template) => void;
}) {
  const [draft, setDraft] = useState<Template>(() => ({
    ...template,
    config: { ...normalizeConfig(template.config, template.format || "feed") },
  }));
  const [finalPreviewOpen, setFinalPreviewOpen] = useState(false);
  const fmt = draft.format || "feed";
  const canvasH = fmt === "feed" ? 1080 : 1920;
  const aspectClass = fmt === "feed" ? "aspect-square" : "aspect-[9/16]";
  const cfg = normalizeConfig(draft.config, fmt);
  const update = (patch: any) => setDraft(current => {
    const currentFmt = current.format || "feed";
    const currentCfg = normalizeConfig(current.config, currentFmt);
    return { ...current, config: { ...currentCfg, ...patch } };
  });
  const sampleTitle = "TÍTULO DA NOTÍCIA EM DESTAQUE AQUI";
  const sampleSub = "Subtítulo curto explicando o contexto da notícia";
  const hasChanges = JSON.stringify({ name: template.name, config: normalizeConfig(template.config, fmt) }) !== JSON.stringify({ name: draft.name, config: cfg });
  const canSave = draft.name.trim().length > 0 && hasChanges;

  return (
    <>
    <Dialog open={!!template} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl max-h-[92vh] overflow-hidden p-0">
        <DialogHeader>
          <div className="border-b border-border px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle>Ajustar template — {draft.name || template.name}</DialogTitle>
                <DialogDescription>Edite como rascunho, confira a prévia final e salve apenas quando estiver pronto.</DialogDescription>
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
          <div className={`${aspectClass} w-full max-w-[360px] relative overflow-hidden rounded-lg border border-border bg-zinc-900 shadow-card`} style={{ containerType: "inline-size" }}>
            {draft.background_url ? (
              <img src={draft.background_url} className="absolute inset-0 w-full h-full object-cover" alt="" />
            ) : (
              <div className="absolute inset-0" style={{ background: templateGradientCss(draft.preset_key, draft.config) }} />
            )}
            {cfg.showPhoto && (
              <div className="absolute bg-black/40 border-2 border-dashed border-yellow-400 flex items-center justify-center text-yellow-300 text-[10px] font-bold uppercase tracking-wider"
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
              <div className="absolute inset-0" style={{ background: `rgba(0,0,0,${cfg.overlayOpacity})` }} />
            )}
            {cfg.showHandle && (
              <div className="absolute left-[5.5%] font-mono font-bold tracking-wider"
                style={{ top: `${((cfg.handleY - 24) / canvasH) * 100}%`, color: cfg.handleColor, fontSize: `clamp(10px, 2vw, 16px)` }}>
                @SUAMARCA
              </div>
            )}
            <div className="absolute left-[5.5%] right-[5.5%] whitespace-pre-line font-black uppercase leading-[1.05]"
              style={{ top: `${((cfg.titleY - cfg.titleSize * 0.8) / canvasH) * 100}%`, color: cfg.titleColor, fontSize: `${(cfg.titleSize / 1080) * 100}cqw` }}>
              {wrapPreviewText(sampleTitle, cfg.titleMaxChars, 5)}
            </div>
            <div className="absolute left-[5.5%] right-[5.5%] whitespace-pre-line leading-[1.3]"
              style={{ top: `${((cfg.subtitleY - cfg.subtitleSize * 0.8) / canvasH) * 100}%`, color: cfg.subtitleColor, fontSize: `${(cfg.subtitleSize / 1080) * 100}cqw` }}>
              {wrapPreviewText(sampleSub, Math.floor(cfg.titleMaxChars * 2.2), 3)}
            </div>
            {cfg.showBadge && (
              <div className="absolute right-[5.5%] px-3 py-2 font-bold text-xs"
                style={{ top: `${(cfg.badgeY / canvasH) * 100}%`, background: cfg.badgeBg, color: cfg.badgeColor }}>
                {cfg.badgeText}
              </div>
            )}
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

          <Section title="Título">
            <RangeRow label="Posição vertical" value={cfg.titleY} min={50} max={canvasH - 80} onChange={v => update({ titleY: v })} />
            <RangeRow label="Tamanho" value={cfg.titleSize} min={32} max={120} onChange={v => update({ titleSize: v })} />
            <RangeRow label="Caracteres por linha" value={cfg.titleMaxChars} min={12} max={40} onChange={v => update({ titleMaxChars: v })} />
            <ColorRow label="Cor" value={cfg.titleColor} onChange={v => update({ titleColor: v })} />
          </Section>

          <Section title="Subtítulo">
            <RangeRow label="Posição vertical" value={cfg.subtitleY} min={50} max={canvasH - 40} onChange={v => update({ subtitleY: v })} />
            <RangeRow label="Tamanho" value={cfg.subtitleSize} min={16} max={48} onChange={v => update({ subtitleSize: v })} />
            <ColorRow label="Cor" value={cfg.subtitleColor} onChange={v => update({ subtitleColor: v })} />
          </Section>

          <Section title="Handle (@marca)">
            <Toggle label="Mostrar handle" value={cfg.showHandle} onChange={v => update({ showHandle: v })} />
            {cfg.showHandle && <>
              <RangeRow label="Posição vertical" value={cfg.handleY} min={20} max={1000} onChange={v => update({ handleY: v })} />
              <ColorRow label="Cor" value={cfg.handleColor} onChange={v => update({ handleColor: v })} />
            </>}
          </Section>

          <Section title="Badge / Selo">
            <Toggle label="Mostrar selo" value={cfg.showBadge} onChange={v => update({ showBadge: v })} />
            {cfg.showBadge && <>
              <div><Label>Texto</Label><Input value={cfg.badgeText} onChange={e => update({ badgeText: e.target.value })} /></div>
              <RangeRow label="Posição vertical" value={cfg.badgeY} min={20} max={canvasH - 40} onChange={v => update({ badgeY: v })} />
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
              <RangeRow label="Altura" value={cfg.photoH} min={100} max={1080} onChange={v => update({ photoH: v })} />
            </>}
          </Section>

          <Section title="Escurecimento de fundo">
            <RangeRow label="Opacidade" value={Math.round(cfg.overlayOpacity * 100)} min={0} max={90} onChange={v => update({ overlayOpacity: v / 100 })} />
          </Section>
        </div>
          <div className="grid gap-2 border-t border-border bg-card p-4 sm:grid-cols-[1fr_auto_auto]">
            <Button onClick={() => setFinalPreviewOpen(true)} variant="outline" className="sm:order-2">
              <Eye className="mr-2 h-4 w-4" /> Prévia final
            </Button>
            <Button variant="outline" onClick={onClose} className="sm:order-3">Cancelar</Button>
            <Button onClick={() => onSave({ ...draft, name: draft.name.trim(), config: cfg })} disabled={!canSave} className="sm:order-1">
              Salvar alterações
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
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-2 cursor-pointer">
      <span className="text-xs">{label}</span>
      <input type="checkbox" checked={value} onChange={e => onChange(e.target.checked)} className="h-4 w-4 accent-primary" />
    </label>
  );
}
