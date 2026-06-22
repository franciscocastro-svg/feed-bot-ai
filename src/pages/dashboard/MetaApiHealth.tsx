import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, Gauge } from "lucide-react";
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

type Account = { id: string; username: string; active: boolean; pause_threshold: number };

type MetaHealthRow = UsageRow & {
  account_id: string;
  username: string;
  active: boolean;
  pause_threshold: number;
};

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
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_list_meta_health" as never);
    if (error) {
      toast.error(`Não foi possível carregar a saúde da Meta: ${error.message}`);
      setLoading(false);
      return;
    }
    const rows = ((data || []) as MetaHealthRow[]);
    setAccounts(rows.map(row => ({
      id: row.account_id,
      username: row.username,
      active: row.active,
      pause_threshold: row.pause_threshold || 80,
    })));
    setUsage(rows.filter(row => row.captured_at).map(row => ({
      instagram_account_id: row.account_id,
      max_usage_percent: row.max_usage_percent,
      app_call_count: row.app_call_count,
      app_total_time: row.app_total_time,
      app_total_cputime: row.app_total_cputime,
      buc_call_count: row.buc_call_count,
      buc_total_time: row.buc_total_time,
      buc_total_cputime: row.buc_total_cputime,
      buc_estimated_time_to_regain_access: row.buc_estimated_time_to_regain_access,
      captured_at: row.captured_at,
    })));
    setLoading(false);
  };

  const refreshNow = async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-usage-refresh");
      if (error) throw error;
      const ok = (data as any)?.refreshed ?? 0;
      const failed = (data as any)?.failed ?? 0;
      const skipped = (data as any)?.skipped ?? 0;
      if (failed || skipped) toast.warning(`${ok} atualizada(s), ${failed} falharam e ${skipped} ficaram sem leitura.`);
      else toast.success(`Uso atualizado para ${ok} conta(s)`);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Falha ao consultar a Meta");
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, []);

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
          const threshold = acc.pause_threshold;
          return (
            <Card key={acc.id} className="p-5 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="font-semibold text-lg">@{acc.username}</h3>
                  <p className="text-xs text-muted-foreground">
                    {noData ? "Sem leitura ainda — clique em \"Verificar uso agora\" para consultar a Meta" :
                      `Uso atual: ${pct}% • atualizado em ${new Date(u!.captured_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`}
                  </p>
                  <p className="text-xs text-muted-foreground">Auto-freio configurado pelo cliente: {threshold}%</p>
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
