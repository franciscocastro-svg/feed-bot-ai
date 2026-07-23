import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Loader2, Save, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { containDestinationRect, coverSourceRect } from "../../supabase/functions/_shared/image-framing.js";
import { useLanguage } from "@/contexts/LanguageContext";

const SIZE = 1080;
const PREVIEW = 480;

type Layout = {
  title: string;
  subtitle: string;
  handle: string;
  // foto
  photoFit: "smart" | "cover" | "contain";
  photoY: number; // top da faixa de foto
  photoH: number;
  // texto
  titleY: number;
  titleSize: number;
  titleColor: string;
  titleMaxChars: number;
  subtitleY: number;
  subtitleSize: number;
  subtitleColor: string;
  // header
  headerBg: string;
  headerH: number;
  // badge
  showBadge: boolean;
  badgeText: string;
  badgeBg: string;
  badgeColor: string;
  badgeY: number;
  // overlay sobre foto
  overlayOpacity: number;
};

const DEFAULT_LAYOUT: Layout = {
  title: "",
  subtitle: "",
  handle: "",
  photoFit: "smart",
  photoY: 528,
  photoH: 552,
  titleY: 210,
  titleSize: 56,
  titleColor: "#000000",
  titleMaxChars: 24,
  subtitleY: 440,
  subtitleSize: 24,
  subtitleColor: "#52525B",
  headerBg: "#FFFFFF",
  headerH: 528,
  showBadge: true,
  badgeText: "LEIA A LEGENDA →",
  badgeBg: "#FFD400",
  badgeColor: "#000000",
  badgeY: 498,
  overlayOpacity: 0,
};

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function proxify(url: string, w = 1080, h?: number) {
  const clean = url.replace(/&amp;/gi, "&").replace(/^https?:\/\//, "");
  const hp = h ? `&h=${h}&fit=cover` : "";
  return `https://images.weserv.nl/?url=${encodeURIComponent(clean)}&w=${w}${hp}&output=jpg`;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? cur + " " + w : w;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawCoverPhoto(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const source = coverSourceRect(img.width, img.height, w, h);
  ctx.drawImage(img, source.x, source.y, source.width, source.height, x, y, w, h);
}

function drawContainPhoto(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const destination = containDestinationRect(img.width, img.height, x, y, w, h);
  ctx.drawImage(img, destination.x, destination.y, destination.width, destination.height);
}

function drawSmartPhoto(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = "#111111";
  ctx.fillRect(x, y, w, h);
  ctx.filter = "blur(24px)";
  ctx.globalAlpha = 0.72;
  drawCoverPhoto(ctx, img, x - 28, y - 28, w + 56, h + 56);
  ctx.filter = "none";
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  ctx.fillRect(x, y, w, h);
  drawContainPhoto(ctx, img, x, y, w, h);
  ctx.restore();
}

interface Props {
  item: any | null;
  onClose: () => void;
  onSaved: () => void;
}

export function PostCanvasEditor({ item, onClose, onSaved }: Props) {
  const { t } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [layout, setLayout] = useState<Layout>(DEFAULT_LAYOUT);
  const [photoImg, setPhotoImg] = useState<HTMLImageElement | null>(null);
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // carregar item + assets
  useEffect(() => {
    if (!item) return;
    setLoading(true);
    (async () => {
      const { data: settings } = await supabase
        .from("user_settings")
        .select("brand_handle, brand_name, brand_logo_url")
        .maybeSingle();

      setLayout({
        ...DEFAULT_LAYOUT,
        title: item.rewritten_title || item.original_title || "",
        subtitle: item.rewritten_summary || "",
        handle: (settings?.brand_handle || settings?.brand_name || "").replace(/^@/, ""),
      });

      try {
        if (item.original_image_url) {
          const img = await loadImage(proxify(item.original_image_url, 1080));
          setPhotoImg(img);
        } else {
          setPhotoImg(null);
        }
      } catch { setPhotoImg(null); }

      try {
        if (settings?.brand_logo_url) {
          const lg = await loadImage(proxify(settings.brand_logo_url, 200));
          setLogoImg(lg);
        } else {
          setLogoImg(null);
        }
      } catch { setLogoImg(null); }

      setLoading(false);
    })();
  }, [item]);

  // render
  const render = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, SIZE, SIZE);

    // header
    ctx.fillStyle = layout.headerBg;
    ctx.fillRect(0, 0, SIZE, layout.headerH);

    // avatar + handle
    const ax = 70, ay = 80, ar = 36;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ax, ay, ar + 2, 0, Math.PI * 2);
    ctx.fillStyle = "#F4F4F5";
    ctx.fill();
    if (logoImg) {
      ctx.beginPath();
      ctx.arc(ax, ay, ar, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(logoImg, ax - ar, ay - ar, ar * 2, ar * 2);
    }
    ctx.restore();

    ctx.fillStyle = "#000";
    ctx.font = "800 22px Inter, system-ui, sans-serif";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(`@${layout.handle.toUpperCase()}`, ax + ar + 22, ay + 10);

    // ponto vermelho
    ctx.beginPath();
    ctx.arc(1020, ay, 9, 0, Math.PI * 2);
    ctx.fillStyle = "#DC2626";
    ctx.fill();

    // divider
    ctx.fillStyle = "#000";
    ctx.fillRect(60, 140, 960, 1.5);

    // título
    ctx.fillStyle = layout.titleColor;
    ctx.font = `900 ${layout.titleSize}px Inter, system-ui, sans-serif`;
    const titleLines = wrapText(ctx, layout.title.toUpperCase(), 960).slice(0, 4);
    const lh = Math.round(layout.titleSize * 1.05);
    titleLines.forEach((l, i) => ctx.fillText(l, 60, layout.titleY + i * lh));

    // subtítulo
    ctx.fillStyle = layout.subtitleColor;
    ctx.font = `500 ${layout.subtitleSize}px Inter, system-ui, sans-serif`;
    const subLines = wrapText(ctx, layout.subtitle, 960).slice(0, 2);
    const slh = Math.round(layout.subtitleSize * 1.3);
    subLines.forEach((l, i) => ctx.fillText(l, 60, layout.subtitleY + i * slh));

    // foto
    if (photoImg) {
      const dy = layout.photoY;
      const dh = layout.photoH;
      if (layout.photoFit === "smart") {
        drawSmartPhoto(ctx, photoImg, 0, dy, SIZE, dh);
      } else if (layout.photoFit === "cover") {
        drawCoverPhoto(ctx, photoImg, 0, dy, SIZE, dh);
      } else {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, dy, SIZE, dh);
        drawContainPhoto(ctx, photoImg, 0, dy, SIZE, dh);
      }
      if (layout.overlayOpacity > 0) {
        ctx.fillStyle = `rgba(0,0,0,${layout.overlayOpacity})`;
        ctx.fillRect(0, dy, SIZE, dh);
      }
    } else {
      // gradient fallback
      const grad = ctx.createLinearGradient(0, layout.photoY, SIZE, layout.photoY + layout.photoH);
      grad.addColorStop(0, "#1E1B4B");
      grad.addColorStop(0.5, "#7C3AED");
      grad.addColorStop(1, "#FFD400");
      ctx.fillStyle = grad;
      ctx.fillRect(0, layout.photoY, SIZE, layout.photoH);
      ctx.fillStyle = "#FFF";
      ctx.font = "900 64px Inter, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(`@${layout.handle.toUpperCase()}`, SIZE / 2, layout.photoY + layout.photoH / 2);
      ctx.textAlign = "left";
    }

    // badge
    if (layout.showBadge) {
      const bw = 360, bh = 60;
      const bx = SIZE - bw - 60;
      ctx.fillStyle = layout.badgeBg;
      ctx.fillRect(bx, layout.badgeY, bw, bh);
      ctx.fillStyle = layout.badgeColor;
      ctx.font = "900 22px Inter, system-ui, monospace";
      ctx.textAlign = "center";
      ctx.fillText(layout.badgeText, bx + bw / 2, layout.badgeY + 40);
      ctx.textAlign = "left";
    }
  }, [layout, photoImg, logoImg]);

  useEffect(() => { render(); }, [render]);

  const handleSave = async () => {
    if (!item || !canvasRef.current) return;
    setSaving(true);
    try {
      const blob: Blob = await new Promise((resolve, reject) =>
        canvasRef.current!.toBlob(b => b ? resolve(b) : reject(new Error("blob fail")), "image/png", 0.95)
      );
      const { data: { user } } = await supabase.auth.getUser();
      const path = `${user!.id}/${item.id}.png`;
      const { error } = await supabase.storage.from("post-images").upload(path, blob, {
        contentType: "image/png",
        upsert: true,
      });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("post-images").getPublicUrl(path);
      // bust cache
      const url = `${pub.publicUrl}?t=${Date.now()}`;
      await supabase.from("news_items").update({
        generated_image_url: url,
        rewritten_title: layout.title,
        rewritten_summary: layout.subtitle,
        status: "processed",
        error_message: null,
      }).eq("id", item.id);
      toast.success(t("Post salvo!"));
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(t("Erro ao salvar o post."));
    } finally {
      setSaving(false);
    }
  };

  const update = (k: keyof Layout, v: any) => setLayout(p => ({ ...p, [k]: v }));

  if (!item) return null;

  return (
    <Dialog open={!!item} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("Editor de Post (1080×1080)")}</DialogTitle>
          <DialogDescription>
            {t("Edite o visual do post no canvas. As mudanças são renderizadas ao vivo.")}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="grid md:grid-cols-[480px_1fr] gap-6">
            {/* Preview */}
            <div className="space-y-3">
              <div className="border rounded-lg overflow-hidden bg-black">
                <canvas
                  ref={canvasRef}
                  width={SIZE}
                  height={SIZE}
                  style={{ width: PREVIEW, height: PREVIEW, display: "block" }}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={saving} className="flex-1">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  {t("Salvar post")}
                </Button>
                <Button variant="outline" onClick={() => setLayout({ ...DEFAULT_LAYOUT, title: layout.title, subtitle: layout.subtitle, handle: layout.handle })}>
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Controles */}
            <Tabs defaultValue="text">
              <TabsList className="grid grid-cols-4 w-full">
                <TabsTrigger value="text">{t("Texto")}</TabsTrigger>
                <TabsTrigger value="photo">{t("Foto")}</TabsTrigger>
                <TabsTrigger value="layout">Layout</TabsTrigger>
                <TabsTrigger value="badge">Badge</TabsTrigger>
              </TabsList>

              <TabsContent value="text" className="space-y-4 pt-4">
                <div>
                  <Label>Handle (@)</Label>
                  <Input value={layout.handle} onChange={e => update("handle", e.target.value.replace(/^@/, ""))} />
                </div>
                <div>
                  <Label>{t("Título")}</Label>
                  <Textarea rows={3} value={layout.title} onChange={e => update("title", e.target.value)} />
                </div>
                <div>
                  <Label>{t("Subtítulo / Resumo")}</Label>
                  <Textarea rows={2} value={layout.subtitle} onChange={e => update("subtitle", e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{t("Tamanho do título:")} {layout.titleSize}px</Label>
                    <Slider min={32} max={96} step={2} value={[layout.titleSize]} onValueChange={v => update("titleSize", v[0])} />
                  </div>
                  <div>
                    <Label>{t("Posição Y do título:")} {layout.titleY}</Label>
                    <Slider min={150} max={500} step={5} value={[layout.titleY]} onValueChange={v => update("titleY", v[0])} />
                  </div>
                  <div>
                    <Label>{t("Cor do título")}</Label>
                    <Input type="color" value={layout.titleColor} onChange={e => update("titleColor", e.target.value)} />
                  </div>
                  <div>
                    <Label>{t("Cor subtítulo")}</Label>
                    <Input type="color" value={layout.subtitleColor} onChange={e => update("subtitleColor", e.target.value)} />
                  </div>
                  <div>
                    <Label>{t("Tam. subtítulo:")} {layout.subtitleSize}</Label>
                    <Slider min={16} max={48} step={1} value={[layout.subtitleSize]} onValueChange={v => update("subtitleSize", v[0])} />
                  </div>
                  <div>
                    <Label>{t("Pos. Y subtítulo:")} {layout.subtitleY}</Label>
                    <Slider min={300} max={520} step={5} value={[layout.subtitleY]} onValueChange={v => update("subtitleY", v[0])} />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="photo" className="space-y-4 pt-4">
                {!photoImg && (
                  <p className="text-sm text-muted-foreground p-3 bg-muted rounded">
                    {t("Sem foto disponível para essa notícia. Mostrando gradiente de fundo.")}
                  </p>
                )}
                <div>
                  <Label>{t("Topo da foto:")} {layout.photoY}</Label>
                  <Slider min={300} max={800} step={5} value={[layout.photoY]} onValueChange={v => update("photoY", v[0])} />
                </div>
                <div>
                  <Label>{t("Altura da foto:")} {layout.photoH}</Label>
                  <Slider min={200} max={780} step={5} value={[layout.photoH]} onValueChange={v => update("photoH", v[0])} />
                </div>
                <div className="flex items-center gap-3">
                  <Label>{t("Modo")}</Label>
                  <div className="flex gap-1">
                    {(["smart", "cover", "contain"] as const).map(m => (
                      <Button key={m} size="sm" variant={layout.photoFit === m ? "default" : "outline"} onClick={() => update("photoFit", m)}>
                        {m === "smart" ? t("Inteligente") : m === "cover" ? t("Preencher") : t("Encaixar")}
                      </Button>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>{t("Escurecer foto:")} {Math.round(layout.overlayOpacity * 100)}%</Label>
                  <Slider min={0} max={0.8} step={0.05} value={[layout.overlayOpacity]} onValueChange={v => update("overlayOpacity", v[0])} />
                </div>
              </TabsContent>

              <TabsContent value="layout" className="space-y-4 pt-4">
                <div>
                  <Label>{t("Altura do cabeçalho:")} {layout.headerH}</Label>
                  <Slider min={300} max={800} step={5} value={[layout.headerH]} onValueChange={v => update("headerH", v[0])} />
                </div>
                <div>
                  <Label>{t("Cor do cabeçalho")}</Label>
                  <Input type="color" value={layout.headerBg} onChange={e => update("headerBg", e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" size="sm" onClick={() => setLayout(p => ({ ...p, headerBg: "#FFFFFF", titleColor: "#000000", subtitleColor: "#52525B" }))}>{t("Tema claro")}</Button>
                  <Button variant="outline" size="sm" onClick={() => setLayout(p => ({ ...p, headerBg: "#0A0A0A", titleColor: "#FFFFFF", subtitleColor: "#A1A1AA" }))}>{t("Tema escuro")}</Button>
                  <Button variant="outline" size="sm" onClick={() => setLayout(p => ({ ...p, headerBg: "#FFD400", titleColor: "#000000", subtitleColor: "#27272A" }))}>{t("Amarelo")}</Button>
                  <Button variant="outline" size="sm" onClick={() => setLayout(p => ({ ...p, headerBg: "#DC2626", titleColor: "#FFFFFF", subtitleColor: "#FECACA" }))}>{t("Urgente")}</Button>
                </div>
              </TabsContent>

              <TabsContent value="badge" className="space-y-4 pt-4">
                <div className="flex items-center gap-3">
                  <Switch checked={layout.showBadge} onCheckedChange={v => update("showBadge", v)} />
                  <Label>{t("Mostrar badge")}</Label>
                </div>
                <div>
                  <Label>{t("Texto do badge")}</Label>
                  <Input value={layout.badgeText} onChange={e => update("badgeText", e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{t("Fundo")}</Label>
                    <Input type="color" value={layout.badgeBg} onChange={e => update("badgeBg", e.target.value)} />
                  </div>
                  <div>
                    <Label>{t("Texto")}</Label>
                    <Input type="color" value={layout.badgeColor} onChange={e => update("badgeColor", e.target.value)} />
                  </div>
                </div>
                <div>
                  <Label>{t("Posição Y:")} {layout.badgeY}</Label>
                  <Slider min={400} max={1020} step={5} value={[layout.badgeY]} onValueChange={v => update("badgeY", v[0])} />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
