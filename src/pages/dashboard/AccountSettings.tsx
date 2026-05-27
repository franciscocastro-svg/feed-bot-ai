import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, Loader2, ArrowLeft, Instagram, Info } from "lucide-react";

// Per-IG-account settings. Empty/null values inherit from global user_settings.
// We store ONLY the override values; the page shows current effective values
// as placeholders so the user knows what would apply if they leave blank.

type EffectiveSettings = {
  brand_name?: string | null;
  brand_handle?: string | null;
  brand_logo_url?: string | null;
  default_niche?: string | null;
  ai_tone?: string | null;
  default_media_type?: string | null;
  default_image_style?: string | null;
  reel_audio_url?: string | null;
  max_posts_per_day?: number | null;
  min_post_interval_minutes?: number | null;
  preferred_post_hours?: number[] | null;
  auto_approve?: boolean | null;
};

const empty = {
  brand_name: "",
  brand_handle: "",
  brand_logo_url: "",
  default_niche: "",
  ai_tone: "",
  default_media_type: "" as "" | "reel" | "feed" | "story",
  default_image_style: "" as "" | "template" | "ai",
  reel_audio_url: "",
  max_posts_per_day: "" as number | "",
  min_post_interval_minutes: "" as number | "",
  preferred_post_hours: "" as string,
  auto_approve: null as boolean | null,
};

export default function AccountSettings() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [account, setAccount] = useState<any>(null);
  const [userId, setUserId] = useState<string>("");
  const [form, setForm] = useState(empty);
  const [effective, setEffective] = useState<EffectiveSettings>({});
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const [{ data: acc }, { data: override }, { data: eff }] = await Promise.all([
        supabase.from("instagram_accounts").select("*").eq("id", id).maybeSingle(),
        supabase.from("account_settings").select("*").eq("instagram_account_id", id).maybeSingle(),
        supabase.rpc("get_effective_account_settings", { _account_id: id }),
      ]);
      if (!acc) { toast.error("Conta não encontrada"); navigate("/dashboard/accounts"); return; }
      setAccount(acc);
      setEffective((eff as any) || {});
      if (override) {
        setForm({
          brand_name: override.brand_name || "",
          brand_handle: override.brand_handle || "",
          brand_logo_url: override.brand_logo_url || "",
          default_niche: override.default_niche || "",
          ai_tone: override.ai_tone || "",
          default_media_type: (override.default_media_type as any) || "",
          default_image_style: (override.default_image_style as any) || "",
          reel_audio_url: override.reel_audio_url || "",
          max_posts_per_day: override.max_posts_per_day ?? "",
          min_post_interval_minutes: override.min_post_interval_minutes ?? "",
          preferred_post_hours: override.preferred_post_hours?.join(",") || "",
          auto_approve: override.auto_approve,
        });
      }
      setLoading(false);
    })();
  }, [id, navigate]);

  const uploadLogo = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `${userId}/account-${id}-logo.${ext}`;
    const { error } = await supabase.storage.from("post-images").upload(path, file, { upsert: true, contentType: file.type });
    if (error) { setUploading(false); return toast.error(error.message); }
    const { data: pub } = supabase.storage.from("post-images").getPublicUrl(path);
    const url = `${pub.publicUrl}?t=${Date.now()}`;
    setForm({ ...form, brand_logo_url: url });
    setUploading(false);
    toast.success("Logo enviada (lembre de salvar)");
  };

  const save = async () => {
    if (!id) return;
    setSaving(true);
    const hours = form.preferred_post_hours
      .split(",")
      .map((x) => parseInt(x.trim()))
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= 23);
    const payload = {
      user_id: userId,
      instagram_account_id: id,
      brand_name: form.brand_name.trim() || null,
      brand_handle: form.brand_handle.trim() || null,
      brand_logo_url: form.brand_logo_url || null,
      default_niche: form.default_niche.trim() || null,
      ai_tone: form.ai_tone.trim() || null,
      default_media_type: form.default_media_type || null,
      default_image_style: form.default_image_style || null,
      reel_audio_url: form.reel_audio_url || null,
      max_posts_per_day: form.max_posts_per_day === "" ? null : Number(form.max_posts_per_day),
      min_post_interval_minutes: form.min_post_interval_minutes === "" ? null : Math.max(Number(form.min_post_interval_minutes), 10),
      preferred_post_hours: hours.length ? hours : null,
      auto_approve: form.auto_approve,
    };
    const { error } = await supabase
      .from("account_settings")
      .upsert(payload, { onConflict: "instagram_account_id" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Configurações da conta salvas");
    const { data: eff } = await supabase.rpc("get_effective_account_settings", { _account_id: id });
    setEffective((eff as any) || {});
  };

  const clearOverrides = async () => {
    if (!confirm("Apagar todas as personalizações desta conta? Ela voltará a usar o padrão global.")) return;
    await supabase.from("account_settings").delete().eq("instagram_account_id", id!);
    setForm(empty);
    toast.success("Personalizações removidas — agora usa o padrão global");
    const { data: eff } = await supabase.rpc("get_effective_account_settings", { _account_id: id! });
    setEffective((eff as any) || {});
  };

  if (loading || !account) return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>;

  const ph = (v: any, fallback = "(usa padrão global)") => (v !== null && v !== undefined && v !== "" ? `Padrão: ${v}` : fallback);

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dashboard/accounts"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Link>
        </Button>
      </div>
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-xl bg-gradient-brand flex items-center justify-center shrink-0">
          <Instagram className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold">Configurações de @{account.username}</h1>
          <p className="text-sm text-muted-foreground">Campos vazios usam o padrão global em <Link to="/dashboard/settings" className="underline text-primary">Configurações</Link>.</p>
        </div>
      </div>

      <Card className="p-4 flex gap-3 bg-secondary/40 border-dashed">
        <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p>As configurações aqui <b>só valem para esta conta Instagram</b>.</p>
          <p><b>Identidade da marca</b> (logo, nome, @): quando você tem mais de uma conta conectada, <b>não herda</b> do padrão global — cada conta usa só o que estiver configurado abaixo. Se ficar vazio, o sistema usa o @ real do Instagram e sem logo.</p>
          <p><b>Automação</b> (tom, nicho, posts/dia, horários): continua herdando do padrão global se ficar em branco.</p>
        </div>
      </Card>

      {/* Identidade */}
      <Card className="p-6 space-y-5">
        <h2 className="font-display text-xl font-semibold">Identidade da marca (desta conta)</h2>
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full overflow-hidden bg-secondary border-2 border-border shrink-0">
            {(form.brand_logo_url || effective.brand_logo_url) ? (
              <img src={form.brand_logo_url || (effective.brand_logo_url as string)} alt="logo" className="h-full w-full object-cover" />
            ) : <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">sem<br/>logo</div>}
          </div>
          <div className="flex-1">
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                {form.brand_logo_url ? "Trocar logo" : "Logo desta conta"}
              </Button>
              {form.brand_logo_url && (
                <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, brand_logo_url: "" })}>Usar logo padrão</Button>
              )}
            </div>
          </div>
        </div>
        <div>
          <Label>Nome da marca</Label>
          <Input value={form.brand_name} onChange={e => setForm({ ...form, brand_name: e.target.value })} placeholder={ph(effective.brand_name)} />
        </div>
        <div>
          <Label>@ do Instagram</Label>
          <Input value={form.brand_handle} onChange={e => setForm({ ...form, brand_handle: e.target.value })} placeholder={ph(effective.brand_handle, `@${account.username}`)} />
        </div>
      </Card>

      {/* Automação */}
      <Card className="p-6 space-y-5">
        <h2 className="font-display text-xl font-semibold">Automação</h2>
        <div>
          <Label>Posts por dia (máx.)</Label>
          <Input type="number" min={1} value={form.max_posts_per_day}
            onChange={e => setForm({ ...form, max_posts_per_day: e.target.value === "" ? "" : Math.max(parseInt(e.target.value) || 1, 1) })}
            placeholder={ph(effective.max_posts_per_day)} />
        </div>
        <div>
          <Label>Intervalo mínimo entre posts (min)</Label>
          <Input type="number" min={10} value={form.min_post_interval_minutes}
            onChange={e => setForm({ ...form, min_post_interval_minutes: e.target.value === "" ? "" : Math.max(parseInt(e.target.value) || 10, 10) })}
            placeholder={ph(effective.min_post_interval_minutes)} />
        </div>
        <div>
          <Label>Nicho</Label>
          <Input value={form.default_niche} onChange={e => setForm({ ...form, default_niche: e.target.value })} placeholder={ph(effective.default_niche)} />
        </div>
        <div>
          <Label>Tom da IA</Label>
          <Input value={form.ai_tone} onChange={e => setForm({ ...form, ai_tone: e.target.value })} placeholder={ph(effective.ai_tone)} />
        </div>
        <div>
          <Label>Tipo de publicação padrão</Label>
          <Select value={form.default_media_type || "__inherit"} onValueChange={v => setForm({ ...form, default_media_type: (v === "__inherit" ? "" : v) as any })}>
            <SelectTrigger><SelectValue placeholder={ph(effective.default_media_type)} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__inherit">Usar padrão global ({effective.default_media_type || "—"})</SelectItem>
              <SelectItem value="reel">🎬 Reel</SelectItem>
              <SelectItem value="feed">📷 Feed</SelectItem>
              <SelectItem value="story">⭐ Story</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Estilo de imagem</Label>
          <Select value={form.default_image_style || "__inherit"} onValueChange={v => setForm({ ...form, default_image_style: (v === "__inherit" ? "" : v) as any })}>
            <SelectTrigger><SelectValue placeholder={ph(effective.default_image_style)} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__inherit">Usar padrão global ({effective.default_image_style || "—"})</SelectItem>
              <SelectItem value="template">Template dinâmico</SelectItem>
              <SelectItem value="ai">Geração com IA</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Horários preferidos (vírgula, 0–23)</Label>
          <Input value={form.preferred_post_hours} onChange={e => setForm({ ...form, preferred_post_hours: e.target.value })}
            placeholder={ph(effective.preferred_post_hours?.join(","))} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <Label>Aprovação automática</Label>
            <p className="text-xs text-muted-foreground">
              {form.auto_approve === null ? `Herdando do padrão: ${effective.auto_approve ? "ligado" : "desligado"}` : "Personalizado para esta conta"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {form.auto_approve !== null && (
              <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, auto_approve: null })}>herdar</Button>
            )}
            <Switch checked={form.auto_approve ?? !!effective.auto_approve}
              onCheckedChange={v => setForm({ ...form, auto_approve: v })} />
          </div>
        </div>
      </Card>

      <div className="flex flex-col-reverse sm:flex-row gap-3">
        <Button variant="outline" onClick={clearOverrides}>Limpar personalizações</Button>
        <Button onClick={save} disabled={saving} className="flex-1" size="lg">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          Salvar configurações desta conta
        </Button>
      </div>
    </div>
  );
}
