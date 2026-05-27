import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ShieldCheck, RefreshCw, Loader2, AlertTriangle, CheckCircle2, XCircle, Clock, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

type Account = {
  id: string;
  username: string;
  active: boolean;
  verification_status: string | null;
  token_expires_at: string | null;
  last_verified_at: string | null;
  access_token: string | null;
  ig_user_id: string | null;
  page_id: string | null;
};

type Health = "permanent" | "ok" | "expiring" | "expired" | "invalid" | "unknown";

function classify(a: Account): { health: Health; days: number | null } {
  if (a.verification_status === "invalid") return { health: "invalid", days: null };
  if (!a.token_expires_at) {
    return { health: a.verification_status === "ready" ? "permanent" : "unknown", days: null };
  }
  const days = Math.floor((new Date(a.token_expires_at).getTime() - Date.now()) / 86400000);
  if (days < 0) return { health: "expired", days };
  if (days < 7) return { health: "expiring", days };
  return { health: "ok", days };
}

const healthBadge = (h: Health, days: number | null) => {
  switch (h) {
    case "permanent": return <Badge className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Permanente</Badge>;
    case "ok": return <Badge className="bg-green-600"><CheckCircle2 className="h-3 w-3 mr-1" />Válido · {days}d</Badge>;
    case "expiring": return <Badge variant="outline" className="border-warning text-warning"><Clock className="h-3 w-3 mr-1" />Expira em {days}d</Badge>;
    case "expired": return <Badge variant="destructive"><AlertTriangle className="h-3 w-3 mr-1" />Expirado</Badge>;
    case "invalid": return <Badge variant="destructive"><ShieldAlert className="h-3 w-3 mr-1" />Revogado</Badge>;
    default: return <Badge variant="outline"><XCircle className="h-3 w-3 mr-1" />Não verificado</Badge>;
  }
};

export default function TokenHealth() {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [busy, setBusy] = useState<Record<string, "verify" | "refresh" | undefined>>({});
  const [bulk, setBulk] = useState(false);

  useEffect(() => {
    (async () => {
      if (!user) return;
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      setIsAdmin(!!data);
    })();
  }, [user]);

  const load = async () => {
    const { data } = await supabase.from("instagram_accounts").select("*").order("username");
    setAccounts((data as Account[]) || []);
  };
  useEffect(() => { load(); }, []);

  const stats = useMemo(() => {
    const s = { total: accounts.length, ok: 0, expiring: 0, expired: 0, invalid: 0, unknown: 0, permanent: 0 };
    accounts.forEach(a => { s[classify(a).health]++; });
    return s;
  }, [accounts]);

  const verify = async (id: string) => {
    setBusy(b => ({ ...b, [id]: "verify" }));
    const { error } = await supabase.functions.invoke("verify-ig-token", { body: { account_id: id } });
    setBusy(b => ({ ...b, [id]: undefined }));
    if (error) toast.error(error.message); else toast.success("Verificado");
    load();
  };

  const refresh = async (id: string) => {
    setBusy(b => ({ ...b, [id]: "refresh" }));
    const { data, error } = await supabase.functions.invoke("refresh-ig-token", { body: { account_id: id } });
    setBusy(b => ({ ...b, [id]: undefined }));
    if (error || data?.error) toast.error(data?.error || error?.message || "Falha");
    else toast.success(data?.message || "Token atualizado");
    load();
  };

  const verifyAll = async () => {
    setBulk(true);
    for (const a of accounts) {
      await supabase.functions.invoke("verify-ig-token", { body: { account_id: a.id } });
    }
    setBulk(false);
    toast.success("Todas as contas verificadas");
    load();
  };

  if (isAdmin === false) {
    return (
      <div className="p-8 max-w-2xl">
        <Card className="p-8 text-center text-muted-foreground border-dashed">
          <ShieldAlert className="h-10 w-10 mx-auto mb-3 opacity-50" />
          <p>Acesso restrito a administradores.</p>
        </Card>
      </div>
    );
  }

  const alerts = accounts
    .map(a => ({ a, c: classify(a) }))
    .filter(x => ["expired", "expiring", "invalid"].includes(x.c.health));

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-6xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold">Saúde dos Tokens</h1>
          <p className="text-sm text-muted-foreground mt-1">Status e validade dos tokens do Instagram por conta.</p>
        </div>
        <Button onClick={verifyAll} disabled={bulk || accounts.length === 0}>
          {bulk ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
          Verificar todas
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { label: "Total", value: stats.total, cls: "" },
          { label: "Permanentes", value: stats.permanent, cls: "text-green-600" },
          { label: "Válidos", value: stats.ok, cls: "text-green-600" },
          { label: "Expirando", value: stats.expiring, cls: "text-warning" },
          { label: "Expirados", value: stats.expired, cls: "text-destructive" },
          { label: "Revogados", value: stats.invalid, cls: "text-destructive" },
        ].map(s => (
          <Card key={s.label} className="p-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className={`text-2xl font-bold ${s.cls}`}>{s.value}</p>
          </Card>
        ))}
      </div>

      {alerts.length > 0 && (
        <Card className="p-4 border-warning/40 bg-warning/5 space-y-2">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4 text-warning" />
            {alerts.length} conta(s) precisam de atenção
          </div>
          <ul className="text-sm space-y-1">
            {alerts.map(({ a, c }) => (
              <li key={a.id} className="flex items-center gap-2">
                {healthBadge(c.health, c.days)}
                <span>@{a.username}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Conta</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Expira em</TableHead>
              <TableHead>Última verificação</TableHead>
              <TableHead>Ativa</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma conta cadastrada</TableCell></TableRow>
            )}
            {accounts.map(a => {
              const c = classify(a);
              return (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">@{a.username}</TableCell>
                  <TableCell>{healthBadge(c.health, c.days)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {a.token_expires_at ? new Date(a.token_expires_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {a.last_verified_at ? new Date(a.last_verified_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Nunca"}
                  </TableCell>
                  <TableCell>{a.active ? <Badge variant="outline">Sim</Badge> : <Badge variant="secondary">Não</Badge>}</TableCell>
                  <TableCell className="text-right space-x-2 whitespace-nowrap">
                    <Button size="sm" variant="outline" onClick={() => verify(a.id)} disabled={!!busy[a.id]}>
                      {busy[a.id] === "verify" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                    </Button>
                    <Button size="sm" onClick={() => refresh(a.id)} disabled={!!busy[a.id]} title="Tornar permanente / renovar">
                      {busy[a.id] === "refresh" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
