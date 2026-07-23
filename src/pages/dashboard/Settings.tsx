import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, Loader2, Music2, Trash2, GraduationCap, Instagram, ChevronRight, Mail } from "lucide-react";
import { TutorialModal } from "@/components/TutorialModal";
import { ContextHelp, FieldLabel } from "@/components/ContextHelp";
import { useLanguage, type UiLanguage } from "@/contexts/LanguageContext";
import {
  DEFAULT_EDITORIAL_REEL_DURATION_SECONDS,
  normalizeEditorialReelDuration,
} from "@/lib/editorialReelDuration";

export default function Settings() {
  const { language, setLanguage, t } = useLanguage();
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [s, setS] = useState<any | null>(null);
  const [uploading, setUploading] = useState(false);
  const [tracks, setTracks] = useState<any[]>([]);
  const [uploadingTrack, setUploadingTrack] = useState(false);
  const [planLimits, setPlanLimits] = useState<{ plan: string; display_name: string; max_posts_per_day: number } | null>(null);
  const [igAccounts, setIgAccounts] = useState<{ id: string; username: string }[]>([]);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const trackRef = useRef<HTMLInputElement>(null);

  const loadTracks = async (userId: string) => {
    const { data } = await supabase.from("reel_audio_tracks").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    setTracks(data || []);
  };

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      let { data } = await supabase.from("user_settings").select("*").eq("user_id", user!.id).maybeSingle();
      if (!data) {
        const { data: created } = await supabase.from("user_settings").insert({ user_id: user!.id }).select("*").single();
        data = created;
      }
      setS({
        ...data,
        editorial_reel_duration_seconds: normalizeEditorialReelDuration(data?.editorial_reel_duration_seconds),
      });
      const { data: profile } = await supabase.from("profiles").select("marketing_consent, marketing_unsubscribed_at").eq("id", user!.id).maybeSingle();
      setMarketingConsent(!!profile?.marketing_consent && !profile?.marketing_unsubscribed_at);
      const { data: limits } = await supabase.rpc("get_user_plan_limits", { _user_id: user!.id });
      const row: any = Array.isArray(limits) ? limits[0] : limits;
      if (row) setPlanLimits({ plan: row.plan, display_name: row.display_name, max_posts_per_day: row.max_posts_per_day });
      const { data: igs } = await supabase.from("instagram_accounts").select("id, username").eq("user_id", user!.id).eq("active", true).order("username");
      setIgAccounts(igs || []);
      await loadTracks(user!.id);
    })();
  }, []);
  if (!s) return null;
  const rawPlanMax = planLimits?.max_posts_per_day ?? 20;
  const isUnlimited = rawPlanMax < 0;
  const planMax = isUnlimited ? 9999 : rawPlanMax;

  const uploadTrack = async (file: File) => {
    setUploadingTrack(true);
    try {
      const ext = file.name.split(".").pop() || "mp3";
      const baseName = file.name.replace(/\.[^.]+$/, "").trim() || "trilha";
      const id = crypto.randomUUID();
      const path = `${s.user_id}/tracks/${id}.${ext}`;
      const { error } = await supabase.storage.from("post-images").upload(path, file, { upsert: true, contentType: file.type || "audio/mpeg" });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("post-images").getPublicUrl(path);
      const { error: insErr } = await supabase.from("reel_audio_tracks").insert({
        user_id: s.user_id,
        name: baseName,
        file_url: pub.publicUrl,
      });
      if (insErr) throw insErr;
      toast.success(language === "en-US" ? `Track "${baseName}" added` : `Trilha "${baseName}" adicionada`);
      await loadTracks(s.user_id);
    } catch (e: any) {
      toast.error(e.message || (language === "en-US" ? "Could not upload track" : "Erro ao enviar trilha"));
    } finally {
      setUploadingTrack(false);
      if (trackRef.current) trackRef.current.value = "";
    }
  };

  const renameTrack = async (id: string, name: string) => {
    if (!name.trim()) return;
    await supabase.from("reel_audio_tracks").update({ name: name.trim() }).eq("id", id);
    setTracks(prev => prev.map(t => t.id === id ? { ...t, name: name.trim() } : t));
  };

  const removeTrack = async (id: string) => {
    if (!confirm(t("Remover esta trilha?"))) return;
    await supabase.from("reel_audio_tracks").delete().eq("id", id);
    setTracks(prev => prev.filter(t => t.id !== id));
    toast.success(t("Removida"));
  };

  const save = async () => {
    const safeMaxPosts = Math.min(Math.max(Number(s.max_posts_per_day) || 1, 1), planMax);
    const safeInterval = Math.max(Number(s.min_post_interval_minutes) || 10, 10);
    const { error } = await supabase.from("user_settings").update({
      max_posts_per_day: safeMaxPosts,
      min_post_interval_minutes: safeInterval,
      default_niche: s.default_niche,
      auto_approve: s.auto_approve,
      default_image_style: s.default_image_style,
      default_media_type: s.default_media_type,
      preferred_post_hours: s.preferred_post_hours,
      ai_tone: s.ai_tone,
      brand_name: s.brand_name,
      brand_handle: s.brand_handle,
      brand_logo_url: s.brand_logo_url,
      reel_audio_url: s.reel_audio_url,
      editorial_reel_duration_seconds: normalizeEditorialReelDuration(s.editorial_reel_duration_seconds),
    }).eq("user_id", s.user_id);
    if (error) return toast.error(error.message);
    setS({ ...s, max_posts_per_day: safeMaxPosts, min_post_interval_minutes: safeInterval });
    toast.success(t("Salvo"));
  };

  const uploadLogo = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `${s.user_id}/brand-logo.${ext}`;
    const { error } = await supabase.storage.from("post-images").upload(path, file, { upsert: true, contentType: file.type });
    if (error) { setUploading(false); return toast.error(error.message); }
    const { data: pub } = supabase.storage.from("post-images").getPublicUrl(path);
    const url = `${pub.publicUrl}?t=${Date.now()}`;
    setS({ ...s, brand_logo_url: url });
    await supabase.from("user_settings").update({ brand_logo_url: url }).eq("user_id", s.user_id);
    setUploading(false);
    toast.success(t("Logo enviada"));
  };

  const updateMarketingConsent = async (enabled: boolean) => {
    const now = new Date().toISOString();
    const { error } = await supabase.from("profiles").update({
      marketing_consent: enabled,
      marketing_consent_at: enabled ? now : null,
      marketing_unsubscribed_at: enabled ? null : now,
    }).eq("id", s.user_id);
    if (error) return toast.error(t("Não foi possível atualizar sua preferência"));
    setMarketingConsent(enabled);
    toast.success(enabled ? t("Você receberá novidades da Flux & Feed") : t("Comunicações promocionais desativadas"));
  };

  const _uploadAudio = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop() || "mp3";
    const path = `${s.user_id}/reel-audio.${ext}`;
    const { error } = await supabase.storage.from("post-images").upload(path, file, { upsert: true, contentType: file.type || "audio/mpeg" });
    if (error) { setUploading(false); return toast.error(error.message); }
    const { data: pub } = supabase.storage.from("post-images").getPublicUrl(path);
    const url = `${pub.publicUrl}?t=${Date.now()}`;
    setS({ ...s, reel_audio_url: url });
    await supabase.from("user_settings").update({ reel_audio_url: url }).eq("user_id", s.user_id);
    setUploading(false);
    toast.success(t("Trilha enviada"));
  };
  void _uploadAudio;

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-2xl">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="font-display text-3xl font-bold">{t("Configurações")}</h1>
          <ContextHelp label={t("Configurações globais")} title={t("Padrão global")}>
            {t("Estas opções servem como padrão para suas contas. Se você tiver mais de uma conta Instagram, também pode personalizar marca, ritmo e tom individualmente.")}
          </ContextHelp>
        </div>
        <p className="text-muted-foreground mt-1">{t("Padrão global da automação e identidade da marca.")}</p>
      </div>

      <Card className="p-5 space-y-3" data-testid="interface-language-card">
        <div>
          <Label htmlFor="interface-language" className="text-base font-semibold">{t("Idioma da interface")}</Label>
          <p className="mt-1 text-xs text-muted-foreground">{t("Altera somente os textos do painel neste navegador. Conteúdos, legendas e regras da automação não mudam.")}</p>
        </div>
        <Select value={language} onValueChange={value => setLanguage(value as UiLanguage)}>
          <SelectTrigger id="interface-language" aria-label={t("Idioma da interface")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
            <SelectItem value="en-US">English</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      {igAccounts.length > 1 && (
        <Card className="p-4 space-y-3 border-primary/40 bg-primary/5">
          <div className="flex items-center gap-2">
            <Instagram className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">{t("Configurações por conta Instagram")}</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("Escolha uma conta para personalizar marca, tom, horários e ritmo só para ela. As demais continuam usando o padrão global abaixo.")}
          </p>
          <Select onValueChange={(v) => { if (v) window.location.href = `/dashboard/accounts/${v}/settings`; }}>
            <SelectTrigger>
              <SelectValue placeholder={t("Selecione uma conta para configurar…")} />
            </SelectTrigger>
            <SelectContent>
              {igAccounts.map(a => (
                <SelectItem key={a.id} value={a.id}>@{a.username}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Card>
      )}
      {igAccounts.length === 1 && (
        <Card className="p-4 flex items-center justify-between gap-3 border-dashed">
          <div className="flex items-center gap-2 text-sm">
            <Instagram className="h-4 w-4 text-muted-foreground" />
            <span>{t("Personalizar só para")} <strong>@{igAccounts[0].username}</strong></span>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to={`/dashboard/accounts/${igAccounts[0].id}/settings`}>{t("Configurar")} <ChevronRight className="h-3 w-3 ml-1" /></Link>
          </Button>
        </Card>
      )}

      <Card className="p-5 md:p-6 flex flex-col items-start justify-between gap-4 border-primary/20 bg-gradient-to-r from-primary/5 to-transparent sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-brand flex items-center justify-center shadow-glow shrink-0">
            <GraduationCap className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-semibold">{t("Guia de primeiros passos")}</h2>
              <span className="rounded-full border border-border bg-background/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{t("9 etapas · 7 min")}</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("Da conexão do Instagram à publicação e análise dos resultados.")}</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => setTutorialOpen(true)} className="w-full sm:w-auto">{t("Abrir guia")}</Button>
      </Card>
      <TutorialModal open={tutorialOpen} onOpenChange={setTutorialOpen} />

      <Card className="p-6 flex items-start justify-between gap-4">
        <div className="flex gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><Mail className="h-5 w-5 text-primary" /></div>
          <div><h2 className="font-display text-lg font-semibold">{t("Novidades por e-mail")}</h2><p className="text-sm text-muted-foreground mt-1">{t("Receba atualizações do produto, dicas e promoções. E-mails essenciais de segurança continuam normalmente.")}</p></div>
        </div>
        <Switch checked={marketingConsent} onCheckedChange={updateMarketingConsent} aria-label={t("Receber novidades por e-mail")} />
      </Card>

      <Card className="p-6 space-y-5">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-xl font-semibold">{t("Identidade da marca")}</h2>
          <ContextHelp label={t("Identidade da marca")}>
            {t("O nome, o perfil e a logo aparecem no cabeçalho dos posts gerados pelo template dinâmico.")}
          </ContextHelp>
        </div>
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full overflow-hidden bg-secondary border-2 border-border shrink-0">
            {s.brand_logo_url ? <img src={s.brand_logo_url} alt="logo" className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">{t("sem logo")}</div>}
          </div>
          <div className="flex-1">
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                {s.brand_logo_url ? t("Trocar logo") : t("Enviar logo")}
              </Button>
              <ContextHelp label={t("formato da logo")}>
                {t("Use uma imagem quadrada, com fundo claro ou escuro e pelo menos 300 × 300 pixels.")}
              </ContextHelp>
            </div>
          </div>
        </div>
        <div><Label>{t("Nome da marca")}</Label><Input value={s.brand_name || ""} onChange={e => setS({ ...s, brand_name: e.target.value })} placeholder="CHOQUEI" /></div>
        <div><Label>{t("@ do Instagram")}</Label><Input value={s.brand_handle || ""} onChange={e => setS({ ...s, brand_handle: e.target.value })} placeholder={t("@meuperfil")} /></div>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-xl font-semibold">{t("Biblioteca de trilhas dos Reels")}</h2>
            <ContextHelp label={t("biblioteca de trilhas")} title={t("Como a IA escolhe a trilha")}>
              <p>{t("Use nomes que descrevam a emoção ou o contexto, como")} <code>tenso.mp3</code>, <code>feliz.mp3</code> {t("ou")} <code>urgente.mp3</code>.</p>
              <p className="mt-1.5">{t("A IA combina o nome do arquivo com a notícia. Sem trilha cadastrada, o Reel é gerado sem áudio.")}</p>
            </ContextHelp>
          </div>
          <input
            ref={trackRef}
            type="file"
            accept="audio/mpeg,audio/mp3,audio/wav,audio/*"
            multiple
            className="hidden"
            onChange={async e => {
              const files = Array.from(e.target.files || []);
              for (const f of files) await uploadTrack(f);
            }}
          />
          <Button variant="outline" onClick={() => trackRef.current?.click()} disabled={uploadingTrack} className="shrink-0">
            {uploadingTrack ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
            {t("Adicionar trilhas")}
          </Button>
        </div>

        {tracks.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-border rounded-lg text-muted-foreground text-sm">
            <Music2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
            {t("Nenhuma trilha na biblioteca ainda.")}
          </div>
        ) : (
          <div className="space-y-2">
            {tracks.map(track => (
              <div key={track.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card/50">
                <Music2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input
                  defaultValue={track.name}
                  onBlur={e => e.target.value !== track.name && renameTrack(track.id, e.target.value)}
                  className="h-8 max-w-xs"
                  placeholder={t("ex: tenso, feliz, urgente")}
                />
                <audio controls src={track.file_url} className="h-8 flex-1 min-w-0" />
                <Button size="sm" variant="ghost" onClick={() => removeTrack(track.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-6 space-y-5">
        <h2 className="font-display text-xl font-semibold">{t("Automação")}</h2>
        <div>
          <FieldLabel htmlFor="max-posts-per-day" helpLabel={t("posts por dia")} help={isUnlimited
            ? t("Seu plano não limita a quantidade diária. Defina aqui o máximo que deseja publicar.")
            : language === "en-US" ? `Your plan allows up to ${planMax} posts per day. The system will not save a value above this limit.` : `Seu plano permite até ${planMax} posts por dia. O sistema não salvará um valor acima desse limite.`}
          >{t("Posts por dia (máx.)")}</FieldLabel>
          <Input id="max-posts-per-day" type="number" min={1} max={planMax} value={s.max_posts_per_day} onChange={e => setS({ ...s, max_posts_per_day: Math.min(Math.max(+e.target.value || 1, 1), planMax) })} />
          <p className="mt-1 text-[11px] text-muted-foreground">{t("Limite do plano")}{planLimits?.display_name ? ` ${planLimits.display_name}` : ""}: {isUnlimited ? t("ilimitado") : language === "en-US" ? `${planMax}/day` : `${planMax}/dia`}</p>
        </div>
        <div>
          <FieldLabel htmlFor="min-post-interval" helpLabel={t("intervalo entre posts")} help={t("É o tempo mínimo entre publicações da mesma conta. O sistema aceita no mínimo 10 minutos; recomendamos de 30 a 60 minutos para reduzir bloqueios do Instagram.")}>
            {t("Intervalo mínimo entre posts (minutos)")}
          </FieldLabel>
          <Input id="min-post-interval" type="number" min={10} value={s.min_post_interval_minutes ?? 10} onChange={e => setS({ ...s, min_post_interval_minutes: Math.max(+e.target.value || 10, 10) })} />
        </div>
        <div>
          <FieldLabel htmlFor="default-niche" helpLabel={t("Nicho padrão")} help={t("Tema principal usado pela IA para contextualizar notícias e publicações.")}>{t("Nicho padrão")}</FieldLabel>
          <Input id="default-niche" value={s.default_niche || ""} onChange={e => setS({ ...s, default_niche: e.target.value })} placeholder={t("finanças, esportes…")} />
        </div>
        <div>
          <FieldLabel htmlFor="ai-tone" helpLabel={t("Tom da IA")} help={t("Define o estilo de escrita das legendas, por exemplo: informativo, descontraído ou urgente.")}>{t("Tom da IA")}</FieldLabel>
          <Input id="ai-tone" value={s.ai_tone || ""} onChange={e => setS({ ...s, ai_tone: e.target.value })} />
        </div>
        <div>
          <FieldLabel helpLabel={t("Tipo de publicação padrão")} help={t("Formato usado quando uma automação não escolher outro tipo explicitamente.")}>{t("Tipo de publicação padrão")}</FieldLabel>
          <Select value={s.default_media_type || "reel"} onValueChange={v => setS({ ...s, default_media_type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="reel">🎬 {t("Reel (recomendado — alcança não-seguidores)")}</SelectItem>
              <SelectItem value="feed">📷 {t("Feed (só aparece para seguidores)")}</SelectItem>
              <SelectItem value="story">⭐ {t("Story (24h, alta visibilidade entre seguidores)")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <FieldLabel helpLabel={t("duração dos Reels de notícias")} help={t("Vale somente para novos Reels editoriais criados de imagens estáticas. Stories e Cortes IA não mudam. O alcance varia conforme conteúdo, público e distribuição; compare os resultados nos Insights.")}>
            {t("Duração dos Reels de notícias")}
          </FieldLabel>
          <Select
            value={String(normalizeEditorialReelDuration(s.editorial_reel_duration_seconds))}
            onValueChange={value => setS({
              ...s,
              editorial_reel_duration_seconds: normalizeEditorialReelDuration(value),
            })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="6">{t("6 segundos — curto e direto")}</SelectItem>
              <SelectItem value="20">{t("20 segundos — equilibrado (padrão)")}</SelectItem>
              <SelectItem value="30">{t("30 segundos — mais contexto")}</SelectItem>
            </SelectContent>
          </Select>
          {normalizeEditorialReelDuration(s.editorial_reel_duration_seconds) !== DEFAULT_EDITORIAL_REEL_DURATION_SECONDS && (
            <p className="mt-1 text-[11px] text-muted-foreground">{t("Personalizado · padrão do sistema:")} {DEFAULT_EDITORIAL_REEL_DURATION_SECONDS}s</p>
          )}
        </div>
        <div>
          <FieldLabel helpLabel={t("Estilo de imagem padrão")} help={t("Template dinâmico usa o visual configurado da marca. Geração com IA cria uma nova imagem para o conteúdo.")}>{t("Estilo de imagem padrão")}</FieldLabel>
          <Select value={s.default_image_style} onValueChange={v => setS({ ...s, default_image_style: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="template">{t("Template dinâmico (estilo Choquei)")}</SelectItem>
              <SelectItem value="ai">{t("Geração com IA")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <FieldLabel htmlFor="preferred-hours" helpLabel={t("Melhores horários")} help={t("Informe horas de 0 a 23 separadas por vírgula. Exemplo: 8,12,18,21. A automação prioriza esses horários.")}>{t("Melhores horários")}</FieldLabel>
          <Input id="preferred-hours" value={(s.preferred_post_hours || []).join(",")} onChange={e => setS({ ...s, preferred_post_hours: e.target.value.split(",").map((x: string) => +x.trim()).filter(Number.isFinite) })} placeholder="8,12,18,21" />
        </div>
        <div className="flex items-center justify-between">
          <FieldLabel helpLabel={t("Aprovação automática")} help={t("Quando ativada, a publicação pula a etapa de aprovação manual.")}>{t("Aprovação automática")}</FieldLabel>
          <Switch checked={s.auto_approve} onCheckedChange={v => setS({ ...s, auto_approve: v })} />
        </div>
      </Card>

      <Button onClick={save} className="w-full" size="lg">{t("Salvar configurações")}</Button>
    </div>
  );
}
