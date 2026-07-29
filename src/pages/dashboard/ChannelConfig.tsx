import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  Camera,
  Film,
  Image,
  Instagram,
  Loader2,
  RotateCcw,
  Save,
} from "lucide-react";
import { ContextHelp, FieldLabel } from "@/components/ContextHelp";
import {
  DEFAULT_CHANNEL_SETTINGS,
  resolveAccountChannelSettings,
  type AccountChannelSettingsOverride,
  type ChannelSettingsOverride,
  type PublicationChannel,
} from "../../../supabase/functions/_shared/account-channel-settings";

type Channel = PublicationChannel;

type InstagramAccount = {
  id: string;
  username: string;
};

type FormState = {
  active: boolean;
  minInterval: number;
  maxPerDay: number;
  hoursStr: string;
  keywordsStr: string;
  urgentStr: string;
  isPriority: boolean;
};

const META: Record<Channel, { title: string; desc: string; icon: typeof Image }> = {
  feed: {
    title: "Feed",
    desc: "Posts permanentes e carrosséis — destaque para a marca.",
    icon: Image,
  },
  story: {
    title: "Stories",
    desc: "Conteúdo rápido 9:16 — alcance e urgência.",
    icon: Camera,
  },
  reel: {
    title: "Reels",
    desc: "Vídeos verticais 9:16 — máximo engajamento.",
    icon: Film,
  },
};

function formFromChannel(channel: {
  active: boolean;
  min_interval_minutes: number;
  max_per_day: number;
  allowed_hours: number[];
  keywords: string[];
  urgent_keywords: string[];
  is_priority: boolean;
}): FormState {
  return {
    active: channel.active,
    minInterval: channel.min_interval_minutes,
    maxPerDay: channel.max_per_day,
    hoursStr: channel.allowed_hours.join(","),
    keywordsStr: channel.keywords.join(", "),
    urgentStr: channel.urgent_keywords.join(", "),
    isPriority: channel.is_priority,
  };
}
function parseHours(value: string): number[] {
  return Array.from(new Set(
    value
      .split(",")
      .map((part) => Number.parseInt(part.trim(), 10))
      .filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23),
  )).sort((a, b) => a - b);
}

function parseWords(value: string): string[] {
  return Array.from(new Set(
    value
      .split(",")
      .map((word) => word.trim().toLowerCase())
      .filter(Boolean),
  ));
}

export default function ChannelConfig() {
  const { channel } = useParams<{ channel: Channel }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const ch = (channel || "feed") as Channel;
  const meta = META[ch];
  const Icon = meta.icon;
  const { user } = useAuth();

  const selectedAccountId = searchParams.get("account") || "__global";
  const isAccountMode = selectedAccountId !== "__global";
  const [accounts, setAccounts] = useState<InstagramAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customized, setCustomized] = useState(false);
  const [hasExplicitOverride, setHasExplicitOverride] = useState(false);
  const [planCap, setPlanCap] = useState(20);
  const [form, setForm] = useState<FormState>(
    formFromChannel(DEFAULT_CHANNEL_SETTINGS[ch]),
  );
  const [sourceSummary, setSourceSummary] = useState<string>("Padrão do sistema");

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === selectedAccountId),
    [accounts, selectedAccountId],
  );

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const accountId = isAccountMode ? selectedAccountId : null;
    const [
      { data: accountRows },
      { data: globalSettings },
      { data: globalChannel },
      { data: limits },
      { data: accountSettings },
      { data: accountChannel },
    ] = await Promise.all([
      supabase
        .from("instagram_accounts")
        .select("id, username")
        .eq("user_id", user.id)
        .eq("active", true)
        .order("username"),
      supabase
        .from("user_settings")
        .select("default_media_type, max_posts_per_day, min_post_interval_minutes, preferred_post_hours")
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("channel_settings")
        .select("*")
        .eq("user_id", user.id)
        .eq("channel", ch)
        .maybeSingle(),
      supabase.rpc("get_user_plan_limits", { _user_id: user.id }),
      accountId
        ? supabase
          .from("account_settings")
          .select("instagram_account_id, default_media_type, max_posts_per_day, min_post_interval_minutes, preferred_post_hours")
          .eq("user_id", user.id)
          .eq("instagram_account_id", accountId)
          .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      accountId
        ? supabase
          .from("account_channel_settings")
          .select("instagram_account_id, channel, active, min_interval_minutes, allowed_hours, max_per_day, keywords, urgent_keywords, is_priority")
          .eq("user_id", user.id)
          .eq("instagram_account_id", accountId)
          .eq("channel", ch)
          .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    setAccounts((accountRows || []) as InstagramAccount[]);
    const cap = (limits as { max_posts_per_day?: number } | null)?.max_posts_per_day;
    if (typeof cap === "number") setPlanCap(cap);

    const resolved = resolveAccountChannelSettings({
      globalSettings,
      accountSettings,
      globalChannels: globalChannel
        ? [globalChannel as ChannelSettingsOverride]
        : [],
      accountChannels: accountChannel
        ? [accountChannel as AccountChannelSettingsOverride]
        : [],
    });
    const effectiveChannel = resolved.channels.find((item) => item.channel === ch)!;
    setForm(formFromChannel(effectiveChannel));
    setCustomized(!isAccountMode || Boolean(accountChannel));
    setHasExplicitOverride(Boolean(isAccountMode ? accountChannel : globalChannel));

    if (!isAccountMode) {
      setSourceSummary(globalChannel ? "Personalizado no canal global" : "Padrão global herdado do sistema");
    } else if (accountChannel) {
      setSourceSummary(`Personalizado somente para @${(accountRows || []).find((row) => row.id === accountId)?.username || "conta"}`);
    } else {
      const sources = new Set(Object.values(effectiveChannel.sources));
      setSourceSummary(
        sources.has("account")
          ? "Herdando automaticamente o ritmo e os horários desta conta"
          : "Herdando automaticamente o padrão global",
      );
    }
    setLoading(false);
  }, [ch, isAccountMode, selectedAccountId, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectAccount = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === "__global") next.delete("account");
    else next.set("account", value);
    setSearchParams(next);
  };

  const save = async () => {
    if (!user) return;
    const allowedHours = parseHours(form.hoursStr);
    if (!allowedHours.length) {
      toast({
        title: "Horários inválidos",
        description: "Informe pelo menos uma hora de 0 a 23.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    const hardCap = planCap < 0 ? 999 : planCap;
    const safeMinInterval = Math.max(form.minInterval, 10);
    const safeMaxPerDay = Math.min(Math.max(form.maxPerDay, 1), hardCap);
    const commonPayload = {
      channel: ch,
      active: form.active,
      min_interval_minutes: safeMinInterval,
      max_per_day: safeMaxPerDay,
      allowed_hours: allowedHours,
      keywords: parseWords(form.keywordsStr),
      urgent_keywords: parseWords(form.urgentStr),
      is_priority: form.isPriority,
    };

    const operation = isAccountMode
      ? supabase.from("account_channel_settings").upsert({
        ...commonPayload,
        user_id: user.id,
        instagram_account_id: selectedAccountId,
      }, { onConflict: "user_id,instagram_account_id,channel" })
      : supabase.from("channel_settings").upsert({
        ...commonPayload,
        user_id: user.id,
      }, { onConflict: "user_id,channel" });
    const { error } = await operation;
    setSaving(false);

    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setCustomized(true);
    toast({
      title: "Configurações salvas",
      description: isAccountMode
        ? `${meta.title} atualizado somente para @${selectedAccount?.username || "conta"}.`
        : `${meta.title} global atualizado.`,
    });
    await load();
  };

  const resetChannelInheritance = async () => {
    if (!user) return;
    setSaving(true);
    const operation = isAccountMode
      ? supabase
        .from("account_channel_settings")
        .delete()
        .eq("user_id", user.id)
        .eq("instagram_account_id", selectedAccountId)
        .eq("channel", ch)
      : supabase
        .from("channel_settings")
        .delete()
        .eq("user_id", user.id)
        .eq("channel", ch);
    const { error } = await operation;
    setSaving(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Herança restaurada",
      description: isAccountMode
        ? `${meta.title} voltou a acompanhar automaticamente esta conta.`
        : `${meta.title} voltou a acompanhar automaticamente o padrão global.`,
    });
    await load();
  };

  const enableCustomization = () => {
    setCustomized(true);
    setSourceSummary(`Personalização em edição para @${selectedAccount?.username || "conta"}`);
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  const fieldsDisabled = isAccountMode && !customized;

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

      <Card className="border-primary/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Instagram className="h-4 w-4 text-primary" />
            <CardTitle>Conta que receberá esta configuração</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={selectedAccountId} onValueChange={selectAccount}>
            <SelectTrigger aria-label="Conta Instagram">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__global">Padrão global de todas as contas</SelectItem>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  @{account.username}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge variant={customized ? "default" : "secondary"}>
              {sourceSummary}
            </Badge>
            {hasExplicitOverride ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetChannelInheritance}
                  disabled={saving}
                  className="gap-2"
                >
                  <RotateCcw className="h-4 w-4" />
                  {isAccountMode
                    ? "Voltar a herdar da conta"
                    : "Voltar a herdar do global"}
                </Button>
              ) : isAccountMode && !customized ? (
                <Button variant="outline" size="sm" onClick={enableCustomization}>
                  Personalizar somente este canal
                </Button>
              ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Sem personalização, este canal acompanha automaticamente intervalo,
            horários e limite definidos na conta. Se a conta também estiver
            herdando, acompanha o padrão global.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Status do canal</CardTitle>
            <ContextHelp label="status do canal">
              Desative para não publicar nada neste formato no escopo selecionado.
            </ContextHelp>
          </div>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <FieldLabel
            htmlFor="active"
            helpLabel="canal ativo"
            help={`Controla as publicações no formato ${meta.title}.`}
          >
            Canal ativo
          </FieldLabel>
          <Switch
            id="active"
            checked={form.active}
            disabled={fieldsDisabled}
            onCheckedChange={(active) => setForm((current) => ({ ...current, active }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Ritmo de publicação</CardTitle>
            <ContextHelp label="ritmo de publicação">
              O intervalo geral da conta funciona como piso de segurança. Este
              canal pode publicar mais devagar, nunca mais rápido.
            </ContextHelp>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FieldLabel
                htmlFor="interval"
                helpLabel="intervalo do canal"
                help="Tempo mínimo entre duas publicações deste formato. O menor valor permitido é 10 minutos."
              >
                Intervalo mínimo (minutos)
              </FieldLabel>
              <Input
                id="interval"
                type="number"
                min={10}
                value={form.minInterval}
                disabled={fieldsDisabled}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  minInterval: Math.max(Number.parseInt(event.target.value, 10) || 10, 10),
                }))}
              />
            </div>
            <div>
              <FieldLabel
                htmlFor="max"
                helpLabel="máximo diário do canal"
                help="Respeita o limite desta conta e também o limite total do plano."
              >
                Máximo de posts por dia
              </FieldLabel>
              <Input
                id="max"
                type="number"
                min={1}
                max={planCap < 0 ? undefined : planCap}
                value={form.maxPerDay}
                disabled={fieldsDisabled}
                onChange={(event) => {
                  const cap = planCap < 0 ? 999 : planCap;
                  setForm((current) => ({
                    ...current,
                    maxPerDay: Math.min(
                      Math.max(Number.parseInt(event.target.value, 10) || 1, 1),
                      cap,
                    ),
                  }));
                }}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Limite do plano: {planCap < 0 ? "ilimitado" : `${planCap}/dia`}
              </p>
            </div>
          </div>
          <div>
            <FieldLabel
              htmlFor="hours"
              helpLabel="horários permitidos"
              help="Informe horas de 0 a 23 separadas por vírgula."
            >
              Horários permitidos
            </FieldLabel>
            <Input
              id="hours"
              value={form.hoursStr}
              disabled={fieldsDisabled}
              onChange={(event) => setForm((current) => ({
                ...current,
                hoursStr: event.target.value,
              }))}
              placeholder="8,9,12,18,21"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>Roteamento de notícias</CardTitle>
            <ContextHelp label="roteamento de notícias">
              Define quais notícias podem ser direcionadas para este canal.
            </ContextHelp>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <FieldLabel
              htmlFor="priority"
              helpLabel="notícias urgentes"
              help="Notícias correspondentes às palavras urgentes podem ser priorizadas."
            >
              Receber notícias urgentes
            </FieldLabel>
            <Switch
              id="priority"
              checked={form.isPriority}
              disabled={fieldsDisabled}
              onCheckedChange={(isPriority) => setForm((current) => ({
                ...current,
                isPriority,
              }))}
            />
          </div>
          <div>
            <FieldLabel
              htmlFor="urgent"
              helpLabel="palavras-chave urgentes"
              help="Separe por vírgula."
            >
              Palavras-chave urgentes
            </FieldLabel>
            <Textarea
              id="urgent"
              rows={2}
              value={form.urgentStr}
              disabled={fieldsDisabled}
              onChange={(event) => setForm((current) => ({
                ...current,
                urgentStr: event.target.value,
              }))}
              placeholder="urgente, exclusivo, morre, vaza, prisão, escândalo"
            />
          </div>
          <div>
            <FieldLabel
              htmlFor="kw"
              helpLabel="filtro de conteúdo"
              help="Se preencher, somente notícias com alguma destas palavras poderão entrar neste canal."
            >
              Palavras-chave normais
            </FieldLabel>
            <Textarea
              id="kw"
              rows={2}
              value={form.keywordsStr}
              disabled={fieldsDisabled}
              onChange={(event) => setForm((current) => ({
                ...current,
                keywordsStr: event.target.value,
              }))}
              placeholder="política, esporte, tecnologia"
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={save}
          disabled={saving || fieldsDisabled}
          className="gap-2"
        >
          {saving
            ? <Loader2 className="h-4 w-4 animate-spin" />
            : <Save className="h-4 w-4" />}
          Salvar configurações
        </Button>
      </div>
    </div>
  );
}
