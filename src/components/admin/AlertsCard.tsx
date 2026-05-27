import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Clock, Instagram, Rss } from "lucide-react";

type Alert = { icon: any; label: string; count: number; tone: "danger" | "warn" };

export function AlertsCard({ rows }: { rows: any[] }) {
  const [stale, setStale] = useState(0);
  const [overdue, setOverdue] = useState(0);

  useEffect(() => {
    const load = async () => {
      const dayAgo = new Date(Date.now() - 86400000).toISOString();
      const nowIso = new Date().toISOString();
      const [s, o] = await Promise.all([
        supabase.from("news_sources").select("id, last_fetched_at, fetch_interval_minutes", { count: "exact" }).eq("active", true),
        supabase.from("scheduled_posts").select("id", { count: "exact", head: true }).eq("status", "scheduled").lt("scheduled_for", nowIso),
      ]);
      const staleCount = (s.data || []).filter((x: any) => {
        if (!x.last_fetched_at) return true;
        const ageMin = (Date.now() - new Date(x.last_fetched_at).getTime()) / 60000;
        return ageMin > (x.fetch_interval_minutes || 30) * 3;
      }).length;
      setStale(staleCount);
      setOverdue(o.count || 0);
    };
    load();
  }, []);

  const pendingOld = rows.filter(r => {
    if (r.approval_status !== "pending") return false;
    return (Date.now() - new Date(r.created_at).getTime()) > 48 * 3600000;
  }).length;

  const tokensExpired = rows.filter(r => {
    if (!r.ig_accounts || !r.ig_token_expires) return false;
    return new Date(r.ig_token_expires).getTime() < Date.now();
  }).length;

  const alerts: Alert[] = ([
    { icon: Clock, label: "Pendentes >48h", count: pendingOld, tone: "warn" as const },
    { icon: Instagram, label: "Tokens IG expirados", count: tokensExpired, tone: "danger" as const },
    { icon: Rss, label: "Fontes RSS paradas", count: stale, tone: "warn" as const },
    { icon: AlertTriangle, label: "Posts atrasados", count: overdue, tone: "danger" as const },
  ] as Alert[]).filter(a => a.count > 0);

  if (alerts.length === 0) return null;

  return (
    <Card className="border-orange-500/50 bg-orange-500/5">
      <CardContent className="pt-5">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="h-5 w-5 text-orange-500" />
          <h3 className="font-semibold">Atenção necessária</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {alerts.map((a, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-background/50 border border-border">
              <a.icon className={`h-5 w-5 ${a.tone === "danger" ? "text-destructive" : "text-orange-500"}`} />
              <div>
                <div className={`text-xl font-bold ${a.tone === "danger" ? "text-destructive" : "text-orange-500"}`}>{a.count}</div>
                <div className="text-xs text-muted-foreground">{a.label}</div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
