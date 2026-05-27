import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, Save, Gauge } from "lucide-react";
import { toast } from "sonner";

type UsageRow = {
  instagram_account_id: string;
  max_usage_percent: number;
  app_call_count: number;
  app_total_time: number;
  app_total_cputime: number;
  buc_call_count: number;
  buc_total_time: number;
  buc_total_cputime: number;
  buc_estimated_time_to_regain_access: number;
  captured_at: string;
};

type Account = { id: string; username: string; active: boolean };

function colorFor(pct: number) {
  if (pct >= 90) return "text-destructive";
  if (pct >= 75) return "text-warning";
  if (pct >= 50) return "text-foreground";
  return "text-green-600";
}

function pctBadge(pct: number) {
  if (pct >= 90) return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Crítico</Badge>;
  if (pct >= 75) return <Badge variant="outline" className="border-warning text-warning"><AlertTriangle className="h-3 w-3 mr-1" />Atenção</Badge>;
  return <Badge className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Saudável</Badge>;
}

export default function MetaApiHealth() {
  const { user } = useAuth();
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [threshold, setThreshold] = useState<number>(80);
  const [savingThreshold, setSavingThreshold] = useState(false);
  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: u }, { data: a }, { data: s }] = await Promise.all([
      supabase.from("meta_api_usage_latest").select("*"),
      supabase.from("instagram_accounts").select("id, username, active").order("username"),
      supabase.from("user_settings").select("meta_usage_pause_threshold").eq("user_id", user!.id).maybeSingle(),
    ]);
    setUsage((u as UsageRow[]) || []);
    setAccounts((a as Account[]) || []);
    if (s?.meta_usage_pause_threshold) setThreshold(s.meta_usage_pause_threshold);
    setLoading(false);
  };

  const refreshNow = async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-usage-refresh");
      if (error) throw error;
      const ok = (data as any)?.refreshed ?? 0;
      toast.success(`Uso atualizado para ${ok} conta(s)`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao consultar a Meta");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => { if (user) load(); }, [user]);

  const saveThreshold = async () => {
    setSavingThreshold(true);
    const { error } = await supabase.from("user_settings")
      .update({ meta_usage_pause_threshold: Math.max(10, Math.min(100, threshold)) })
      .eq("user_id", user!.id);
    setSavingThreshold(false);
    if (error) toast.error(error.message);
    else toast.success(`Auto-freio configurado para ${threshold}%`);
  };

  const usageByAcc = new Map(usage.map(u => [u.instagram_account_id, u]));

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold flex items-center gap-2">
            <Gauge className="h-7 w-7 text-primary" />
            Saúde da API Meta
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitora o uso de quota do Instagram em tempo real e <strong>pausa automaticamente</strong> antes de bater 100%.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Recarregar
          </Button>
          <Button onClick={refreshNow} disabled={refreshing}>
            <Activity className={`h-4 w-4 mr-2 ${refreshing ? "animate-pulse" : ""}`} />
            {refreshing ? "Consultando Meta..." : "Verificar uso agora"}
          </Button>
        </div>
      </div>

      <Card className="p-5">
        <div className="flex items-end gap-4 flex-wrap">
          <div className="space-y-2 flex-1 min-w-[200px]">
            <Label htmlFor="thr" className="flex items-center gap-2">
              <Activity className="h-4 w-4" /> Pausar publicações quando o uso passar de
            </Label>
            <div className="flex items-center gap-2">
              <Input id="thr" type="number" min={10} max={100} value={threshold}
                onChange={e => setThreshold(Number(e.target.value))} className="w-28" />
              <span className="text-sm text-muted-foreground">% do limite Meta</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Recomendado: 80%. Quando uma conta passa desse percentual, o agendador adia automaticamente os próximos posts dela até a Meta liberar a quota.
            </p>
          </div>
          <Button onClick={saveThreshold} disabled={savingThreshold}>
            <Save className="h-4 w-4 mr-2" /> Salvar
          </Button>
        </div>
      </Card>

      <div className="grid gap-4">
        {accounts.length === 0 && (
          <Card className="p-8 text-center text-muted-foreground border-dashed">
            Nenhuma conta Instagram cadastrada.
          </Card>
        )}
        {accounts.map(acc => {
          const u = usageByAcc.get(acc.id);
          const pct = u?.max_usage_percent ?? 0;
          const noData = !u;
          return (
            <Card key={acc.id} className="p-5 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="font-semibold text-lg">@{acc.username}</h3>
                  <p className="text-xs text-muted-foreground">
                    {noData ? "Sem leitura ainda — clique em \"Verificar uso agora\" para consultar a Meta" :
                      `Uso atual: ${pct}% • atualizado em ${new Date(u!.captured_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`}
                  </p>
                </div>
                {!acc.active && <Badge variant="secondary">Inativa</Badge>}
                {!noData && pctBadge(pct)}
              </div>

              {!noData && (
                <>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">Uso máximo da quota</span>
                      <span className={`font-bold ${colorFor(pct)}`}>{pct}%</span>
                    </div>
                    <Progress value={Math.min(100, pct)} className={pct >= 90 ? "[&>div]:bg-destructive" : pct >= 75 ? "[&>div]:bg-warning" : "[&>div]:bg-green-600"} />
                    {pct >= threshold && (
                      <p className="text-xs text-warning flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Acima do seu limite de auto-freio ({threshold}%) — publicações pausadas para esta conta.
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">App – Chamadas</p>
                      <p className={`font-semibold ${colorFor(u!.app_call_count)}`}>{u!.app_call_count}%</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">App – Tempo</p>
                      <p className={`font-semibold ${colorFor(u!.app_total_time)}`}>{u!.app_total_time}%</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">App – CPU</p>
                      <p className={`font-semibold ${colorFor(u!.app_total_cputime)}`}>{u!.app_total_cputime}%</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Conta – Chamadas</p>
                      <p className={`font-semibold ${colorFor(u!.buc_call_count)}`}>{u!.buc_call_count}%</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Conta – Tempo</p>
                      <p className={`font-semibold ${colorFor(u!.buc_total_time)}`}>{u!.buc_total_time}%</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Conta – CPU</p>
                      <p className={`font-semibold ${colorFor(u!.buc_total_cputime)}`}>{u!.buc_total_cputime}%</p>
                    </div>
                  </div>

                  {u!.buc_estimated_time_to_regain_access > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Tempo estimado para liberação: <strong>{u!.buc_estimated_time_to_regain_access} min</strong>
                    </p>
                  )}
                </>
              )}
            </Card>
          );
        })}
      </div>

      <Card className="p-5 bg-muted/30 text-sm text-muted-foreground space-y-2">
        <p className="font-medium text-foreground">Como funciona</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>A cada chamada à API do Instagram, capturamos os headers <code>X-App-Usage</code> e <code>X-Business-Use-Case-Usage</code> que a Meta retorna.</li>
          <li>Os 3 piores percentuais (app: chamadas/tempo/CPU; conta: chamadas/tempo/CPU) são considerados — usamos o maior deles.</li>
          <li>Quando o maior percentual ultrapassa seu limite, o agendador <strong>não tenta publicar</strong> nessa conta e adia o post até a Meta liberar.</li>
          <li>Outras contas continuam publicando normalmente — o freio é por conta.</li>
        </ul>
      </Card>
    </div>
  );
}
