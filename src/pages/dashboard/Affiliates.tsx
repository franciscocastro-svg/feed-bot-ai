import { useEffect, useMemo, useState } from "react";
import { Copy, Link2, Loader2, RefreshCw, TrendingUp, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { SEO } from "@/components/SEO";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

type MonthlyRegistration = {
  month: string;
  registrations: number;
};

type AffiliateDashboard = {
  eligible: boolean;
  status: string;
  referral_code?: string;
  registered_count?: number;
  paid_active_count?: number;
  not_active_count?: number;
  registrations_last_30_days?: number;
  conversion_rate?: number;
  monthly_registrations?: MonthlyRegistration[];
};

function parseDashboard(value: unknown): AffiliateDashboard {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { eligible: false, status: "unavailable" };
  }
  return value as AffiliateDashboard;
}

function monthLabel(value: string) {
  const date = new Date(`${value}-01T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

export default function Affiliates() {
  const [dashboard, setDashboard] = useState<AffiliateDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_my_affiliate_dashboard");
    if (error) {
      toast.error("Não foi possível carregar suas indicações.");
      setDashboard({ eligible: false, status: "unavailable" });
    } else {
      setDashboard(parseDashboard(data));
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const referralLink = useMemo(() => {
    if (!dashboard?.eligible || !dashboard.referral_code) return "";
    return `${window.location.origin}/auth?ref=${encodeURIComponent(dashboard.referral_code)}`;
  }, [dashboard]);

  const copyLink = async () => {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    toast.success("Link de indicação copiado.");
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" /> Carregando indicações...
      </div>
    );
  }

  if (!dashboard?.eligible) {
    return (
      <div className="mx-auto max-w-xl p-6 md:p-10">
        <SEO title="Indicações — Flux & Feed" description="Área privada do programa de indicação Flux & Feed." path="/dashboard/indicacoes" noindex />
        <Card>
          <CardContent className="space-y-3 p-8 text-center">
            <Link2 className="mx-auto h-10 w-10 text-muted-foreground" />
            <h1 className="text-2xl font-bold">Área de indicações indisponível</h1>
            <p className="text-sm text-muted-foreground">
              Esta área aparece somente para clientes habilitados pelo administrador.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const monthly = dashboard.monthly_registrations || [];
  const maxMonthly = Math.max(1, ...monthly.map((item) => Number(item.registrations || 0)));

  return (
    <div className="space-y-6 p-4 md:p-8">
      <SEO title="Minhas indicações — Flux & Feed" description="Acompanhe os cadastros atribuídos ao seu link Flux & Feed." path="/dashboard/indicacoes" noindex />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm text-primary">
            <Link2 className="h-4 w-4" /> Programa de indicação
          </div>
          <h1 className="text-3xl font-bold">Minhas indicações</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe os cadastros vinculados ao seu link exclusivo.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="mr-2 h-4 w-4" /> Atualizar
        </Button>
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4 text-primary" /> Seu link exclusivo
            <Badge className="ml-auto bg-emerald-600">Ativo</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <div className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 font-mono text-sm break-all">
            {referralLink}
          </div>
          <Button onClick={copyLink}><Copy className="mr-2 h-4 w-4" /> Copiar link</Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="p-5">
          <Users className="mb-3 h-5 w-5 text-primary" />
          <div className="text-3xl font-bold">{dashboard.registered_count || 0}</div>
          <div className="text-sm text-muted-foreground">Cadastros pelo link</div>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <UserCheck className="mb-3 h-5 w-5 text-emerald-500" />
          <div className="text-3xl font-bold">{dashboard.paid_active_count || 0}</div>
          <div className="text-sm text-muted-foreground">Clientes pagos ativos</div>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <TrendingUp className="mb-3 h-5 w-5 text-cyan-500" />
          <div className="text-3xl font-bold">{Number(dashboard.conversion_rate || 0).toFixed(1)}%</div>
          <div className="text-sm text-muted-foreground">Conversão em cliente ativo</div>
        </CardContent></Card>
        <Card><CardContent className="p-5">
          <Users className="mb-3 h-5 w-5 text-amber-500" />
          <div className="text-3xl font-bold">{dashboard.registrations_last_30_days || 0}</div>
          <div className="text-sm text-muted-foreground">Cadastros nos últimos 30 dias</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cadastros nos últimos 6 meses</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {monthly.map((item) => {
            const count = Number(item.registrations || 0);
            return (
              <div key={item.month} className="grid grid-cols-[5rem_1fr_2rem] items-center gap-3 text-sm">
                <span className="capitalize text-muted-foreground">{monthLabel(item.month)}</span>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(count / maxMonthly) * 100}%` }} />
                </div>
                <span className="text-right font-medium">{count}</span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Os indicadores mostram apenas totais. Dados pessoais e financeiros dos clientes indicados não são exibidos.
      </p>
    </div>
  );
}
