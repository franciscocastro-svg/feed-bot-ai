import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, Loader2, ArrowLeft, Instagram } from "lucide-react";
import { ContextHelp, FieldLabel } from "@/components/ContextHelp";
import { useLanguage } from "@/contexts/LanguageContext";

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
  const { t } = useLanguage();
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
        supabase.from("instagram_accounts").select("id,user_id,username,ig_user_id,page_id,niche,active,created_at,updated_at,custom_hashtags,token_expires_at,last_verified_at,verification_status").eq("id", id).maybeSingle(),
        supabase.from("account_settings").select("*").eq("instagram_account_id", id).maybeSingle(),
        supabase.rpc("get_effective_account_settings", { _account_id: id }),
      ]);
      if (!acc) { toast.error(t("Conta não encontrada")); navigate("/dashboard/accounts"); return; }
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
  }, [id, navigate, t]);

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
    toast.success(t("Logo enviada (lembre de salvar)"));
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
    toast.success(t("Configurações da conta salvas"));
    const { data: eff } = await supabase.rpc("get_effective_account_settings", { _account_id: id });
    setEffective((eff as any) || {});
  };

  const clearOverrides = async () => {
    if (!confirm(t("Apagar todas as personalizações desta conta? Ela voltará a usar o padrão global."))) return;
    await supabase.from("account_settings").delete().eq("instagram_account_id", id!);
    setForm(empty);
    toast.success(t("Personalizações removidas — agora usa o padrão global"));
    const { data: eff } = await supabase.rpc("get_effective_account_settings", { _account_id: id! });
    setEffective((eff as any) || {});
  };

  if (loading || !account) return <div className="p-8 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> {t("Carregando…")}</div>;

  const ph = (v: any, fallback = t("(usa padrão global)")) => (v !== null && v !== undefined && v !== "" ? `${t("Padrão:")} ${v}` : fallback);

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dashboard/accounts"><ArrowLeft className="h-4 w-4 mr-1" /> {t("Voltar")}</Link>
        </Button>
      </div>
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-xl bg-gradient-brand flex items-center justify-center shrink-0">
          <Instagram className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl md:text-3xl font-bold">{t("Configurações de")} @{account.username}</h1>
            <ContextHelp label={`${t("Configurações de")} @${account.username}`} title={t("Como funciona a personalização")}>
              <p>{t("Estas opções valem somente para esta conta Instagram.")}</p>
              <p className="mt-1.5">{t("Automação vazia herda o padrão global. Identidade vazia usa o @ real da conta e não exibe logo.")}</p>
            </ContextHelp>
          </div>
          <p className="text-sm text-muted-foreground">{t("Campos vazios usam o padrão global em")} <Link to="/dashboard/settings" className="underline text-primary">{t("Configurações")}</Link>.</p>
        </div>
      </div>

      {/* Identidade */}
      <Card className="p-6 space-y-5">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-xl font-semibold">{t("Identidade da marca (desta conta)")}</h2>
          <ContextHelp label={t("identidade desta conta")}>{t("Logo, nome e @ configurados aqui substituem a identidade global somente nesta conta.")}</ContextHelp>
        </div>
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full overflow-hidden bg-secondary border-2 border-border shrink-0">
            {(form.brand_logo_url || effective.brand_logo_url) ? (
              <img src={form.brand_logo_url || (effective.brand_logo_url as string)} alt="logo" className="h-full w-full object-cover" />
            ) : <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">{t("sem logo")}</div>}
          </div>
          <div className="flex-1">
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                {form.brand_logo_url ? t("Trocar logo") : t("Logo desta conta")}
              </Button>
              {form.brand_logo_url && (
                <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, brand_logo_url: "" })}>{t("Usar logo padrão")}</Button>
              )}
            </div>
          </div>
        </div>
        <div>
          <FieldLabel htmlFor="account-brand-name" helpLabel={t("nome da marca desta conta")} help={t("Deixe vazio para usar o nome efetivo indicado no campo.")}>{t("Nome da marca")}</FieldLabel>
          <Input id="account-brand-name" value={form.brand_name} onChange={e => setForm({ ...form, brand_name: e.target.value })} placeholder={ph(effective.brand_name)} />
        </div>
        <div>
          <FieldLabel htmlFor="account-brand-handle" helpLabel={t("perfil desta conta")} help={t("Identificação exibida nos templates desta conta. Se ficar vazio, será usado o @ real do Instagram.")}>{t("@ do Instagram")}</FieldLabel>
          <Input id="account-brand-handle" value={form.brand_handle} onChange={e => setForm({ ...form, brand_handle: e.target.value })} placeholder={ph(effective.brand_handle, `@${account.username}`)} />
        </div>
      </Card>

      {/* Automação */}
      <Card className="p-6 space-y-5">
        <h2 className="font-display text-xl font-semibold">{t("Automação")}</h2>
        <div>
          <FieldLabel htmlFor="account-max-posts" helpLabel={t("posts por dia desta conta")} help={t("Limite diário exclusivo desta conta. Se ficar vazio, herda o padrão global.")}>{t("Posts por dia (máx.)")}</FieldLabel>
          <Input id="account-max-posts" type="number" min={1} value={form.max_posts_per_day}
            onChange={e => setForm({ ...form, max_posts_per_day: e.target.value === "" ? "" : Math.max(parseInt(e.target.value) || 1, 1) })}
            placeholder={ph(effective.max_posts_per_day)} />
        </div>
        <div>
          <FieldLabel htmlFor="account-min-interval" helpLabel={t("intervalo desta conta")} help={t("Tempo mínimo entre posts desta conta. O mínimo aceito é 10 minutos; vazio herda o padrão global.")}>{t("Intervalo mínimo entre posts (min)")}</FieldLabel>
          <Input id="account-min-interval" type="number" min={10} value={form.min_post_interval_minutes}
            onChange={e => setForm({ ...form, min_post_interval_minutes: e.target.value === "" ? "" : Math.max(parseInt(e.target.value) || 10, 10) })}
            placeholder={ph(effective.min_post_interval_minutes)} />
        </div>
        <div>
          <FieldLabel htmlFor="account-niche" helpLabel={t("nicho desta conta")} help={t("Tema principal usado pela IA apenas para esta conta. Vazio herda o padrão global.")}>{t("Nicho")}</FieldLabel>
          <Input id="account-niche" value={form.default_niche} onChange={e => setForm({ ...form, default_niche: e.target.value })} placeholder={ph(effective.default_niche)} />
        </div>
        <div>
          <FieldLabel htmlFor="account-ai-tone" helpLabel={t("tom da IA desta conta")} help={t("Estilo de escrita das legendas desta conta. Vazio herda o padrão global.")}>{t("Tom da IA")}</FieldLabel>
          <Input id="account-ai-tone" value={form.ai_tone} onChange={e => setForm({ ...form, ai_tone: e.target.value })} placeholder={ph(effective.ai_tone)} />
        </div>
        <div>
          <FieldLabel helpLabel={t("tipo de publicação desta conta")} help={t("Formato preferido desta conta quando a automação não definir outro. Você pode manter o padrão global.")}>{t("Tipo de publicação padrão")}</FieldLabel>
          <Select value={form.default_media_type || "__inherit"} onValueChange={v => setForm({ ...form, default_media_type: (v === "__inherit" ? "" : v) as any })}>
            <SelectTrigger><SelectValue placeholder={ph(effective.default_media_type)} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__inherit">{t("Usar padrão global")} ({effective.default_media_type || "—"})</SelectItem>
              <SelectItem value="reel">🎬 Reel</SelectItem>
              <SelectItem value="feed">📷 Feed</SelectItem>
              <SelectItem value="story">⭐ Story</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <FieldLabel helpLabel={t("estilo de imagem desta conta")} help={t("Escolha o template dinâmico ou geração por IA apenas para esta conta, ou mantenha o padrão global.")}>{t("Estilo de imagem")}</FieldLabel>
          <Select value={form.default_image_style || "__inherit"} onValueChange={v => setForm({ ...form, default_image_style: (v === "__inherit" ? "" : v) as any })}>
            <SelectTrigger><SelectValue placeholder={ph(effective.default_image_style)} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__inherit">{t("Usar padrão global")} ({effective.default_image_style || "—"})</SelectItem>
              <SelectItem value="template">{t("Template dinâmico")}</SelectItem>
              <SelectItem value="ai">{t("Geração com IA")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <FieldLabel htmlFor="account-preferred-hours" helpLabel={t("horários desta conta")} help={t("Informe horas de 0 a 23 separadas por vírgula. Exemplo: 8,12,18,21. Vazio herda o padrão global.")}>{t("Horários preferidos")}</FieldLabel>
          <Input id="account-preferred-hours" value={form.preferred_post_hours} onChange={e => setForm({ ...form, preferred_post_hours: e.target.value })}
            placeholder={ph(effective.preferred_post_hours?.join(","))} />
        </div>
        <div className="flex items-center justify-between gap-3">
          <div>
            <FieldLabel helpLabel={t("aprovação automática desta conta")} help={t("Quando ativada, as publicações desta conta pulam a aprovação manual. Use “herdar” para voltar ao padrão global.")}>{t("Aprovação automática")}</FieldLabel>
            <p className="text-xs text-muted-foreground">
              {form.auto_approve === null ? `${t("Herdando do padrão:")} ${effective.auto_approve ? t("ligado") : t("desligado")}` : t("Personalizado para esta conta")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {form.auto_approve !== null && (
              <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, auto_approve: null })}>{t("herdar")}</Button>
            )}
            <Switch checked={form.auto_approve ?? !!effective.auto_approve}
              onCheckedChange={v => setForm({ ...form, auto_approve: v })} />
          </div>
        </div>
      </Card>

      <div className="flex flex-col-reverse sm:flex-row gap-3">
        <Button variant="outline" onClick={clearOverrides}>{t("Limpar personalizações")}</Button>
        <Button onClick={save} disabled={saving} className="flex-1" size="lg">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
          {t("Salvar configurações desta conta")}
        </Button>
      </div>
    </div>
  );
}
