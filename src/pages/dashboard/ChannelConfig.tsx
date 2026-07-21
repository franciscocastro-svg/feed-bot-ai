import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { Image, Film, Camera, Save, Loader2 } from "lucide-react";
import { ContextHelp, FieldLabel } from "@/components/ContextHelp";

type Channel = "feed" | "story" | "reel";

const META: Record<Channel, { title: string; desc: string; icon: any }> = {
  feed: { title: "Feed", desc: "Posts permanentes 1:1 — destaque para a marca.", icon: Image },
  story: { title: "Stories", desc: "Conteúdo rápido 9:16 — alcance e urgência.", icon: Camera },
  reel: { title: "Reels", desc: "Vídeos verticais 9:16 — máximo engajamento.", icon: Film },
};

const DEFAULT_HOURS = [8,9,10,11,12,13,14,15,16,17,18,19,20,21];

export default function ChannelConfig() {
  const { channel } = useParams<{ channel: Channel }>();
  const ch = (channel || "feed") as Channel;
  const meta = META[ch];
  const Icon = meta.icon;
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [active, setActive] = useState(true);
  const [minInterval, setMinInterval] = useState(60);
  const [maxPerDay, setMaxPerDay] = useState(5);
  const [hoursStr, setHoursStr] = useState(DEFAULT_HOURS.join(","));
  const [keywordsStr, setKeywordsStr] = useState("");
  const [urgentStr, setUrgentStr] = useState("");
  const [isPriority, setIsPriority] = useState(false);
  const [planCap, setPlanCap] = useState<number>(20); // -1 = ilimitado

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    Promise.all([
      supabase.from("channel_settings").select("*").eq("user_id", user.id).eq("channel", ch).maybeSingle(),
      supabase.rpc("get_user_plan_limits", { _user_id: user.id }),
    ]).then(([{ data }, { data: limits }]) => {
      const cap = (limits as any)?.max_posts_per_day;
      if (typeof cap === "number") setPlanCap(cap);
      if (data) {
        setActive(data.active);
        setMinInterval(data.min_interval_minutes);
        setMaxPerDay(data.max_per_day);
        setHoursStr((data.allowed_hours || DEFAULT_HOURS).join(","));
        setKeywordsStr((data.keywords || []).join(", "));
        setUrgentStr((data.urgent_keywords || []).join(", "));
        setIsPriority(data.is_priority);
      } else {
        setIsPriority(ch === "story");
        setMinInterval(ch === "story" ? 30 : ch === "reel" ? 120 : 60);
        setMaxPerDay(ch === "story" ? 10 : ch === "reel" ? 3 : 5);
      }
      setLoading(false);
    });
  }, [user, ch]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const allowed_hours = hoursStr.split(",").map(s => parseInt(s.trim())).filter(n => !isNaN(n) && n >= 0 && n <= 23);
    const keywords = keywordsStr.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    const urgent_keywords = urgentStr.split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    const safeMinInterval = Math.max(minInterval, 10);
    const hardCap = planCap < 0 ? 999 : planCap;
    const safeMaxPerDay = Math.min(Math.max(maxPerDay, 1), hardCap);
    const { error } = await supabase.from("channel_settings").upsert({
      user_id: user.id,
      channel: ch,
      active,
      min_interval_minutes: safeMinInterval,
      max_per_day: safeMaxPerDay,
      allowed_hours,
      keywords,
      urgent_keywords,
      is_priority: isPriority,
    }, { onConflict: "user_id,channel" });
    setSaving(false);
    setMinInterval(safeMinInterval);
    setMaxPerDay(safeMaxPerDay);
    if (error) toast({ title: "Erro", description: error.message, variant: "destructive" });
    else toast({ title: "Configurações salvas", description: `Canal ${meta.title} atualizado.` });
  };

  if (loading) return <div className="p-6 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>;

  return (
    <div className="p-4 md:p-8 max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-xl bg-gradient-brand flex items-center justify-center shadow-glow">
          <Icon className="h-6 w-6 text-primary-foreground" />
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold">{meta.title}</h1>
          <p className="text-muted-foreground text-sm">{meta.desc}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Status do canal</CardTitle>
            <ContextHelp label="status do canal">Desative para não publicar nada neste formato.</ContextHelp>
          </div>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <FieldLabel htmlFor="active" helpLabel="canal ativo" help={`Controla todas as publicações no formato ${meta.title}.`}>Canal ativo</FieldLabel>
          <Switch id="active" checked={active} onCheckedChange={setActive} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Ritmo de publicação</CardTitle>
            <ContextHelp label="ritmo de publicação">Controle a frequência para não sobrecarregar o perfil.</ContextHelp>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FieldLabel htmlFor="interval" helpLabel="intervalo do canal" help="Tempo mínimo entre duas publicações deste formato. O menor valor permitido é 10 minutos.">Intervalo mínimo (minutos)</FieldLabel>
              <Input id="interval" type="number" min={10} value={minInterval} onChange={(e) => setMinInterval(Math.max(parseInt(e.target.value) || 10, 10))} />
            </div>
            <div>
              <FieldLabel htmlFor="max" helpLabel="máximo diário do canal" help="Limite diário exclusivo deste formato, respeitando também o limite do seu plano.">Máximo de posts por dia</FieldLabel>
              <Input id="max" type="number" min={1} max={planCap < 0 ? undefined : planCap}
                value={maxPerDay}
                onChange={(e) => {
                  const cap = planCap < 0 ? 999 : planCap;
                  setMaxPerDay(Math.min(Math.max(parseInt(e.target.value) || 1, 1), cap));
                }} />
              <p className="text-xs text-muted-foreground mt-1">
                Limite do seu plano: {planCap < 0 ? "ilimitado" : `${planCap}/dia`}
              </p>
            </div>
          </div>
          <div>
            <FieldLabel htmlFor="hours" helpLabel="horários permitidos" help="Informe horas de 0 a 23 separadas por vírgula. Exemplo: 8,12,18,21 publica somente nesses horários.">Horários permitidos</FieldLabel>
            <Input id="hours" value={hoursStr} onChange={(e) => setHoursStr(e.target.value)} placeholder="8,9,12,18,21" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Roteamento de notícias</CardTitle>
            <ContextHelp label="roteamento de notícias">Define quais notícias podem ser direcionadas para este canal.</ContextHelp>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <FieldLabel htmlFor="priority" helpLabel="notícias urgentes" help="Quando uma notícia corresponder às palavras urgentes, ela poderá ser direcionada para este canal.">Receber notícias urgentes</FieldLabel>
            <Switch id="priority" checked={isPriority} onCheckedChange={setIsPriority} />
          </div>
          <div>
            <FieldLabel htmlFor="urgent" helpLabel="palavras-chave urgentes" help="Separe por vírgula. Notícias com essas palavras serão tratadas como urgentes.">Palavras-chave urgentes</FieldLabel>
            <Textarea id="urgent" rows={2} value={urgentStr} onChange={(e) => setUrgentStr(e.target.value)}
              placeholder="urgente, exclusivo, morre, vaza, prisão, escândalo" />
          </div>
          <div>
            <FieldLabel htmlFor="kw" helpLabel="filtro de conteúdo" help="Se preencher, somente notícias com alguma destas palavras poderão entrar neste canal. Deixe vazio para aceitar tudo.">Palavras-chave normais</FieldLabel>
            <Textarea id="kw" rows={2} value={keywordsStr} onChange={(e) => setKeywordsStr(e.target.value)}
              placeholder="política, esporte, tecnologia" />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar configurações
        </Button>
      </div>
    </div>
  );
}
