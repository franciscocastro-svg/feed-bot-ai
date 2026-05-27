import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Search, Activity, AlertCircle, CheckCircle2, Sparkles, Send, Rss, Bot, RefreshCw, Trash2 } from "lucide-react";

const ICONS: Record<string, any> = {
  fetch_rss: Rss,
  process_news: Sparkles,
  publish_instagram: Send,
  publish_failed: AlertCircle,
  autopilot_run: Bot,
};
const COLORS: Record<string, string> = {
  fetch_rss: "text-accent",
  process_news: "text-primary",
  publish_instagram: "text-success",
  publish_failed: "text-destructive",
  autopilot_run: "text-warning",
};

export default function Logs() {
  const [logs, setLogs] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const load = () => {
    supabase.from("activity_logs").select("*").order("created_at", { ascending: false }).limit(500).then(({ data }) => setLogs(data || []));
  };
  useEffect(() => { load(); }, []);

  const actions = useMemo(() => Array.from(new Set(logs.map(l => l.action))), [logs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter(l => {
      if (filter !== "all" && l.action !== filter) return false;
      if (q && !JSON.stringify(l).toLowerCase().includes(q)) return false;
      return true;
    });
  }, [logs, search, filter]);

  const formatDetails = (details: any) => {
    const error = details?.error;
    if (typeof error === "string") {
      if (/token do instagram expirou|session has expired|validating access token|oauth/i.test(error)) {
        return "Token do Instagram expirou. Atualize o Access Token em Contas Instagram e verifique o token.";
      }
      return error;
    }
    return JSON.stringify(details);
  };

  async function deleteFiltered() {
    const count = filtered.length;
    if (!count) return;
    const label = filter === "all" ? "TODAS as atividades" : `${count} eventos do tipo "${filter}"`;
    if (!confirm(`Apagar ${label}${search ? ` que correspondem à busca "${search}"` : ""}? Esta ação não pode ser desfeita.`)) return;
    const ids = filtered.map(l => l.id);
    const { error } = await supabase.from("activity_logs").delete().in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`${count} atividades apagadas`);
    load();
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Atividade</h1>
          <p className="text-muted-foreground mt-1">Tudo que o sistema fez.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-4 w-4 mr-2" /> Atualizar</Button>
      </div>

      <Card className="p-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar nos logs..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os eventos</SelectItem>
            {actions.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{filtered.length} eventos</span>
        <Button variant="destructive" size="sm" onClick={deleteFiltered} disabled={!filtered.length}>
          <Trash2 className="h-4 w-4 mr-2" /> Apagar
        </Button>
      </Card>

      <Card className="divide-y divide-border">
        {filtered.length === 0 && <div className="p-4 md:p-8 text-center text-muted-foreground text-sm">Nenhum evento.</div>}
        {filtered.map(l => {
          const Icon = ICONS[l.action] || Activity;
          const color = COLORS[l.action] || "text-muted-foreground";
          return (
            <div key={l.id} className="p-4 flex items-start gap-3 text-sm">
              <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${color}`} />
              <div className="flex-1 min-w-0">
                <p className="font-medium">{l.action}</p>
                {l.details && <p className="text-xs text-muted-foreground break-words line-clamp-2">{formatDetails(l.details)}</p>}
              </div>
              <span className="text-xs text-muted-foreground shrink-0">{new Date(l.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
