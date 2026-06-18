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
import { Upload, Loader2, Music2, Trash2, GraduationCap, Instagram, ChevronRight } from "lucide-react";
import { TutorialModal } from "@/components/TutorialModal";

export default function Settings() {
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [s, setS] = useState<any | null>(null);
  const [uploading, setUploading] = useState(false);
  const [tracks, setTracks] = useState<any[]>([]);
  const [uploadingTrack, setUploadingTrack] = useState(false);
  const [planLimits, setPlanLimits] = useState<{ plan: string; display_name: string; max_posts_per_day: number } | null>(null);
  const [igAccounts, setIgAccounts] = useState<{ id: string; username: string }[]>([]);
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
      setS(data);
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
      toast.success(`Trilha "${baseName}" adicionada`);
      await loadTracks(s.user_id);
    } catch (e: any) {
      toast.error(e.message || "Erro ao enviar trilha");
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
    if (!confirm("Remover esta trilha?")) return;
    await supabase.from("reel_audio_tracks").delete().eq("id", id);
    setTracks(prev => prev.filter(t => t.id !== id));
    toast.success("Removida");
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
    }).eq("user_id", s.user_id);
    if (error) return toast.error(error.message);
    setS({ ...s, max_posts_per_day: safeMaxPosts, min_post_interval_minutes: safeInterval });
    toast.success("Salvo");
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
    toast.success("Logo enviada");
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
    toast.success("Trilha enviada");
  };
  void _uploadAudio;

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-2xl">
      <div>
        <h1 className="font-display text-3xl font-bold">Configurações</h1>
        <p className="text-muted-foreground mt-1">Padrão global da automação e identidade da marca.</p>
        <p className="text-xs text-muted-foreground mt-2">
          💡 Tem mais de uma conta Instagram? Você pode definir marca, ritmo e tom específicos por conta abaixo.
        </p>
      </div>

      {igAccounts.length > 1 && (
        <Card className="p-4 space-y-3 border-primary/40 bg-primary/5">
          <div className="flex items-center gap-2">
            <Instagram className="h-4 w-4 text-primary" />
            <h2 className="font-semibold text-sm">Configurações por conta Instagram</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Escolha uma conta para personalizar marca, tom, horários e ritmo só para ela. As demais continuam usando o padrão global abaixo.
          </p>
          <Select onValueChange={(v) => { if (v) window.location.href = `/dashboard/accounts/${v}/settings`; }}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione uma conta para configurar…" />
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
            <span>Personalizar só para <strong>@{igAccounts[0].username}</strong></span>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to={`/dashboard/accounts/${igAccounts[0].id}/settings`}>Configurar <ChevronRight className="h-3 w-3 ml-1" /></Link>
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
              <h2 className="font-display text-lg font-semibold">Guia de primeiros passos</h2>
              <span className="rounded-full border border-border bg-background/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">9 etapas · 7 min</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Da conexão do Instagram à publicação e análise dos resultados.</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => setTutorialOpen(true)} className="w-full sm:w-auto">Abrir guia</Button>
      </Card>
      <TutorialModal open={tutorialOpen} onOpenChange={setTutorialOpen} />

      <Card className="p-6 space-y-5">
        <h2 className="font-display text-xl font-semibold">Identidade da marca</h2>
        <p className="text-xs text-muted-foreground -mt-3">Aparece no header de cada post (estilo "Choquei").</p>
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full overflow-hidden bg-secondary border-2 border-border shrink-0">
            {s.brand_logo_url ? <img src={s.brand_logo_url} alt="logo" className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">sem<br/>logo</div>}
          </div>
          <div className="flex-1">
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
            <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
              {s.brand_logo_url ? "Trocar logo" : "Enviar logo"}
            </Button>
            <p className="text-xs text-muted-foreground mt-1">Quadrada, fundo claro/escuro, mínimo 300x300px.</p>
          </div>
        </div>
        <div><Label>Nome da marca</Label><Input value={s.brand_name || ""} onChange={e => setS({ ...s, brand_name: e.target.value })} placeholder="CHOQUEI" /></div>
        <div><Label>@ do Instagram</Label><Input value={s.brand_handle || ""} onChange={e => setS({ ...s, brand_handle: e.target.value })} placeholder="@meuperfil" /></div>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-semibold">Biblioteca de trilhas dos Reels</h2>
            <p className="text-xs text-muted-foreground mt-1 max-w-xl">
              Suba várias trilhas com <b>nomes descritivos</b> (ex: <code>tenso.mp3</code>, <code>feliz.mp3</code>, <code>urgente.mp3</code>, <code>investigacao.mp3</code>).
              A IA lê o nome do arquivo e o conteúdo da notícia para escolher a trilha que combina com o tom da publicação.
              Se nenhuma trilha for cadastrada, o Reel sai sem áudio.
            </p>
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
            Adicionar trilhas
          </Button>
        </div>

        {tracks.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-border rounded-lg text-muted-foreground text-sm">
            <Music2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
            Nenhuma trilha na biblioteca ainda.
          </div>
        ) : (
          <div className="space-y-2">
            {tracks.map(t => (
              <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card/50">
                <Music2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <Input
                  defaultValue={t.name}
                  onBlur={e => e.target.value !== t.name && renameTrack(t.id, e.target.value)}
                  className="h-8 max-w-xs"
                  placeholder="ex: tenso, feliz, urgente"
                />
                <audio controls src={t.file_url} className="h-8 flex-1 min-w-0" />
                <Button size="sm" variant="ghost" onClick={() => removeTrack(t.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          Dica: nomes em PT-BR funcionam melhor. Use uma palavra que descreva a emoção ou o contexto (tenso, alegre, polêmico, esportivo, dramático, investigativo, fofo…). A IA escolhe automaticamente.
        </p>
      </Card>

      <Card className="p-6 space-y-5">
        <h2 className="font-display text-xl font-semibold">Automação</h2>
        <div>
          <Label>Posts por dia (máx.)</Label>
          <Input type="number" min={1} max={planMax} value={s.max_posts_per_day} onChange={e => setS({ ...s, max_posts_per_day: Math.min(Math.max(+e.target.value || 1, 1), planMax) })} />
          <p className="text-xs text-muted-foreground mt-1">
            {isUnlimited
              ? <>Seu plano{planLimits?.display_name ? ` (${planLimits.display_name})` : ""} é <strong>ilimitado</strong> — defina o limite diário que preferir.</>
              : <>Seu plano{planLimits?.display_name ? ` (${planLimits.display_name})` : ""} permite até <strong>{planMax}</strong> posts/dia. Para aumentar, faça upgrade do plano.</>}
          </p>
        </div>
        <div>
          <Label>Intervalo mínimo entre posts (minutos)</Label>
          <Input type="number" min={10} value={s.min_post_interval_minutes ?? 10} onChange={e => setS({ ...s, min_post_interval_minutes: Math.max(+e.target.value || 10, 10) })} />
          <p className="text-xs text-muted-foreground mt-1">Tempo mínimo entre publicações da mesma conta. Mínimo permitido: 10 min. Recomendado: 30-60 min para evitar bloqueios do Instagram (erro "too many actions").</p>
        </div>
        <div><Label>Nicho padrão</Label><Input value={s.default_niche || ""} onChange={e => setS({ ...s, default_niche: e.target.value })} placeholder="finanças, esportes…" /></div>
        <div><Label>Tom da IA</Label><Input value={s.ai_tone || ""} onChange={e => setS({ ...s, ai_tone: e.target.value })} /></div>
        <div>
          <Label>Tipo de publicação padrão</Label>
          <Select value={s.default_media_type || "reel"} onValueChange={v => setS({ ...s, default_media_type: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="reel">🎬 Reel (recomendado — alcança não-seguidores)</SelectItem>
              <SelectItem value="feed">📷 Feed (só aparece para seguidores)</SelectItem>
              <SelectItem value="story">⭐ Story (24h, alta visibilidade entre seguidores)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Estilo de imagem padrão</Label>
          <Select value={s.default_image_style} onValueChange={v => setS({ ...s, default_image_style: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="template">Template dinâmico (estilo Choquei)</SelectItem>
              <SelectItem value="ai">Geração com IA</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div><Label>Melhores horários (separados por vírgula)</Label><Input value={(s.preferred_post_hours || []).join(",")} onChange={e => setS({ ...s, preferred_post_hours: e.target.value.split(",").map((x: string) => +x.trim()).filter(Number.isFinite) })} /></div>
        <div className="flex items-center justify-between">
          <div><Label>Aprovação automática</Label><p className="text-xs text-muted-foreground">Pula a etapa de aprovação manual.</p></div>
          <Switch checked={s.auto_approve} onCheckedChange={v => setS({ ...s, auto_approve: v })} />
        </div>
      </Card>

      <Button onClick={save} className="w-full" size="lg">Salvar configurações</Button>
    </div>
  );
}
