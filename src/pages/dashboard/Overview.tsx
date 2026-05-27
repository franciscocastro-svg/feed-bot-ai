import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { ArrowRight, AlertTriangle, Zap, Calendar, Sparkles, TrendingUp, ArrowUpRight } from "lucide-react";
import { SubscriptionBanner } from "@/components/SubscriptionBanner";
import { usePlanUsage, isUnlimited } from "@/hooks/usePlanUsage";

type DayBucket = { day: string; count: number };

function Sparkline({ data }: { data: number[] }) {
  if (!data.length) return null;
  const max = Math.max(...data, 1);
  const w = 200, h = 60;
  const step = w / Math.max(data.length - 1, 1);
  const pts = data.map((v, i) => `${i * step},${h - (v / max) * (h - 6) - 3}`);
  const path = `M${pts.join(" L")}`;
  const area = `${path} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full overflow-visible" preserveAspectRatio="none">
      <defs>
        <linearGradient id="spark-stroke" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="hsl(var(--primary-glow))" />
          <stop offset="100%" stopColor="hsl(var(--primary))" />
        </linearGradient>
        <linearGradient id="spark-fill" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="hsl(var(--primary) / 0.25)" />
          <stop offset="100%" stopColor="hsl(var(--primary) / 0)" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#spark-fill)" />
      <path d={path} fill="none" stroke="url(#spark-stroke)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StatusBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{value}</span>
      </div>
      <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function Overview() {
  const { usage } = usePlanUsage();
  const [stats, setStats] = useState({ postedToday: 0, scheduled: 0, pending: 0, posted: 0, failed: 0, successRate: 100, deltaPct: 0 });
  const [sparkData, setSparkData] = useState<number[]>([]);
  const [recent, setRecent] = useState<any[]>([]);
  const [queue, setQueue] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [autopilot, setAutopilot] = useState(false);

  useEffect(() => {
    (async () => {
      const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
      const startYesterday = new Date(startToday); startYesterday.setDate(startYesterday.getDate() - 1);
      const start7d = new Date(startToday); start7d.setDate(start7d.getDate() - 6);

      const [news, pendingNews, scheduled, posted, failed, postedToday, postedYesterday, last7d, nextQueue, accs, settings] = await Promise.all([
        supabase.from("news_items").select("id, status, original_title, rewritten_title, created_at, source_name").order("created_at", { ascending: false }).limit(6),
        supabase.from("news_items").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("scheduled_posts").select("id", { count: "exact", head: true }).eq("status", "scheduled"),
        supabase.from("scheduled_posts").select("id", { count: "exact", head: true }).eq("status", "posted"),
        supabase.from("scheduled_posts").select("id", { count: "exact", head: true }).eq("status", "failed"),
        supabase.from("scheduled_posts").select("id", { count: "exact", head: true }).gte("posted_at", startToday.toISOString()),
        supabase.from("scheduled_posts").select("id", { count: "exact", head: true }).gte("posted_at", startYesterday.toISOString()).lt("posted_at", startToday.toISOString()),
        supabase.from("scheduled_posts").select("posted_at, status").gte("posted_at", start7d.toISOString()).not("posted_at", "is", null),
        supabase.from("scheduled_posts").select("id, scheduled_for, media_type, news_items(rewritten_title, original_title, generated_image_url)").eq("status", "scheduled").order("scheduled_for", { ascending: true }).limit(4),
        supabase.from("instagram_accounts").select("*"),
        supabase.from("user_settings").select("auto_approve").maybeSingle(),
      ]);

      // Build 7-day buckets
      const buckets: number[] = Array(7).fill(0);
      (last7d.data || []).forEach((r: any) => {
        const d = new Date(r.posted_at); d.setHours(0, 0, 0, 0);
        const idx = Math.floor((d.getTime() - start7d.getTime()) / 86400000);
        if (idx >= 0 && idx < 7) buckets[idx]++;
      });
      setSparkData(buckets);

      const pendingCount = pendingNews.count || 0;
      const totalPub = (posted.count || 0) + (failed.count || 0);
      const todayN = postedToday.count || 0;
      const yestN = postedYesterday.count || 0;
      const delta = yestN > 0 ? Math.round(((todayN - yestN) / yestN) * 100) : (todayN > 0 ? 100 : 0);

      setStats({
        postedToday: todayN,
        scheduled: scheduled.count || 0,
        pending: pendingCount,
        posted: posted.count || 0,
        failed: failed.count || 0,
        successRate: totalPub > 0 ? Math.round(((posted.count || 0) / totalPub) * 100) : 100,
        deltaPct: delta,
      });
      setRecent(news.data || []);
      setQueue(nextQueue.data || []);
      setAccounts(accs.data || []);
      setAutopilot(!!settings.data?.auto_approve);
    })();
  }, []);

  const tokenAlerts = accounts.filter(a => {
    if (!a.token_expires_at) return false;
    const days = Math.floor((new Date(a.token_expires_at).getTime() - Date.now()) / 86400000);
    return days < 7;
  });

  const statusTotal = stats.posted + stats.scheduled + stats.failed || 1;
  const deltaPositive = stats.deltaPct >= 0;

  // Recommended action
  const recommendation = stats.failed > 0
    ? { title: "Reprocessar falhas", desc: `Você tem ${stats.failed} publicação(ões) que falharam. Reprocessar pode recuperá-las.`, cta: "Ver fila", to: "/dashboard/scheduled" }
    : stats.pending > 0
    ? { title: "Aprovar pendentes", desc: `${stats.pending} notícia(s) aguardando sua aprovação para publicar.`, cta: "Revisar", to: "/dashboard/news" }
    : queue.length === 0
    ? { title: "Programar mais posts", desc: "Sua fila está vazia. Gere novos posts para manter o ritmo.", cta: "Criar agora", to: "/dashboard/news" }
    : { title: "Tudo em dia", desc: "Nenhuma ação urgente. Acompanhe os próximos agendamentos abaixo.", cta: "Ver insights", to: "/dashboard/insights" };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold tracking-tight">Visão geral</h1>
          <p className="text-sm text-muted-foreground mt-1">Resumo em tempo real da sua operação NewsFlow.</p>
        </div>
        <Badge variant={autopilot ? "default" : "outline"} className="self-start md:self-auto">
          {autopilot ? "🤖 Piloto automático ativo" : "⏸️ Modo manual"}
        </Badge>
      </div>

      <SubscriptionBanner />

      {/* Token alert */}
      {tokenAlerts.length > 0 && (
        <div className="flex items-center gap-3 bg-warning/10 border border-warning/30 rounded-xl px-4 py-3">
          <div className="w-2 h-2 rounded-full bg-warning animate-pulse shrink-0" />
          <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
          <span className="text-sm font-medium flex-1 min-w-0 truncate">
            {tokenAlerts.length} token(s) Instagram expirando: {tokenAlerts.map(a => `@${a.username}`).join(", ")}
          </span>
          <Button size="sm" variant="ghost" className="text-warning hover:text-warning" asChild>
            <Link to="/dashboard/accounts">Renovar</Link>
          </Button>
        </div>
      )}

      {/* Top row: Hero stats + Plan usage */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        {/* Hero stat */}
        <Card className="md:col-span-2 relative overflow-hidden border-border/60 bg-gradient-subtle p-6">
          <div className="absolute inset-0 opacity-40 pointer-events-none" style={{ background: "var(--gradient-radial)" }} />
          <div className="relative flex justify-between items-start gap-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Posts hoje</p>
              <h2 className="text-5xl md:text-6xl font-bold mt-2 bg-gradient-to-r from-primary-glow to-primary bg-clip-text text-transparent tabular-nums">
                {stats.postedToday}
              </h2>
              <div className="flex items-center gap-2 mt-3">
                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${deltaPositive ? "text-success bg-success/10" : "text-destructive bg-destructive/10"}`}>
                  <TrendingUp className={`h-3 w-3 ${deltaPositive ? "" : "rotate-180"}`} />
                  {deltaPositive ? "+" : ""}{stats.deltaPct}%
                </span>
                <span className="text-xs text-muted-foreground">vs. ontem</span>
              </div>
            </div>
            <div className="h-20 w-40 md:w-56 shrink-0">
              <Sparkline data={sparkData} />
            </div>
          </div>

          <div className="relative mt-8 grid grid-cols-3 gap-4 border-t border-border/60 pt-6">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Agendados</p>
              <p className="text-xl md:text-2xl font-bold mt-1 tabular-nums">{stats.scheduled}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Pendentes</p>
              <p className="text-xl md:text-2xl font-bold mt-1 tabular-nums">{stats.pending}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Sucesso</p>
              <p className={`text-xl md:text-2xl font-bold mt-1 tabular-nums ${stats.successRate >= 90 ? "text-success" : "text-warning"}`}>{stats.successRate}%</p>
            </div>
          </div>
        </Card>

        {/* Plan usage */}
        <Card className="border-border/60 p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-sm font-semibold">Uso do plano</h3>
              {usage && (
                <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider">{usage.display_name}</Badge>
              )}
            </div>
            {usage ? (
              <div className="space-y-4">
                <UsageRow label="Posts hoje" used={usage.posts_today} limit={usage.posts_per_day_limit} color="bg-gradient-to-r from-primary-glow to-primary" />
                <UsageRow label="Reels (mês)" used={usage.reels_used} limit={usage.reels_limit} color="bg-primary" />
                <UsageRow label="Imagens (mês)" used={usage.images_used} limit={usage.images_limit} color="bg-primary-glow" />
                <UsageRow label="Contas IG" used={usage.ig_accounts_used} limit={usage.ig_accounts_limit} color="bg-muted-foreground" />
              </div>
            ) : (
              <div className="text-xs text-muted-foreground py-4">Carregando uso…</div>
            )}
          </div>
          <Button asChild size="sm" className="mt-6 w-full" variant="secondary">
            <Link to="/pricing">Gerenciar plano <ArrowUpRight className="h-3.5 w-3.5 ml-1" /></Link>
          </Button>
        </Card>
      </div>

      {/* Recommended action */}
      <div className="bg-primary/5 border border-primary/20 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-shrink-0 w-10 h-10 bg-primary/15 rounded-full flex items-center justify-center">
          <Zap className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-grow min-w-0">
          <p className="text-sm font-semibold">{recommendation.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{recommendation.desc}</p>
        </div>
        <Button asChild size="sm" className="shrink-0">
          <Link to={recommendation.to}>{recommendation.cta}</Link>
        </Button>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Queue */}
        <div className="lg:col-span-8 space-y-6">
          <Card className="border-border/60 overflow-hidden">
            <div className="px-6 py-4 border-b border-border/60 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">Fila de agendamentos</h3>
              </div>
              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Próximos {queue.length}</span>
            </div>
            {queue.length === 0 ? (
              <div className="px-6 py-10 text-center text-sm text-muted-foreground">
                Nenhum post agendado.{" "}
                <Link to="/dashboard/news" className="text-primary underline">Aprovar notícias</Link>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {queue.map((q) => {
                  const title = q.news_items?.rewritten_title || q.news_items?.original_title || "Sem título";
                  const img = q.news_items?.generated_image_url;
                  const when = new Date(q.scheduled_for);
                  const timeStr = when.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
                  return (
                    <Link to="/dashboard/scheduled" key={q.id} className="px-6 py-4 flex items-center gap-4 group hover:bg-secondary/40 transition-colors">
                      <div className="relative w-14 h-14 rounded-lg bg-secondary overflow-hidden flex-shrink-0 border border-border/60">
                        {img ? (
                          <img src={img} alt="" className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-primary-glow/30 to-primary/30" />
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent h-7" />
                        <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/80 rounded text-[9px] font-bold text-white tabular-nums">{timeStr}</div>
                      </div>
                      <div className="flex-grow min-w-0">
                        <p className="text-sm font-medium truncate group-hover:text-primary transition-colors">{title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 capitalize">
                          {q.media_type || "post"} • {when.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </Link>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Right: Status breakdown + recent */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="border-border/60 p-6">
            <h3 className="text-sm font-semibold mb-5 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Breakdown por status
            </h3>
            <div className="space-y-5">
              <StatusBar label="Postados" value={stats.posted} total={statusTotal} color="bg-success" />
              <StatusBar label="Agendados" value={stats.scheduled} total={statusTotal} color="bg-primary" />
              <StatusBar label="Falhas" value={stats.failed} total={statusTotal} color="bg-destructive" />
            </div>
          </Card>

          <Card className="border-border/60 overflow-hidden">
            <div className="px-5 py-4 border-b border-border/60 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Últimas notícias</h3>
              <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                <Link to="/dashboard/news">Ver todas</Link>
              </Button>
            </div>
            {recent.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-muted-foreground">
                Nenhuma notícia ainda.{" "}
                <Link to="/dashboard/sources" className="text-primary underline">Adicionar fonte</Link>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {recent.slice(0, 5).map((n) => {
                  const statusStyles: Record<string, string> = {
                    posted: "bg-success/10 text-success border-success/20",
                    pending: "bg-primary/10 text-primary border-primary/20",
                    failed: "bg-destructive/10 text-destructive border-destructive/20",
                    processed: "bg-accent/10 text-accent border-accent/20",
                    scheduled: "bg-primary-glow/10 text-primary-glow border-primary-glow/20",
                    approved: "bg-success/10 text-success border-success/20",
                  };
                  const cls = statusStyles[n.status] || "bg-secondary text-muted-foreground border-border";
                  return (
                    <div key={n.id} className="px-5 py-3 flex items-center justify-between gap-3 hover:bg-secondary/40 transition-colors">
                      <span className="text-xs text-foreground/90 truncate flex-1 min-w-0">{n.rewritten_title || n.original_title}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border shrink-0 ${cls}`}>
                        {n.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function UsageRow({ label, used, limit, color }: { label: string; used: number; limit: number; color: string }) {
  const unlimited = isUnlimited(limit);
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
  return (
    <div>
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-muted-foreground">{label}</span>
        <span className="tabular-nums font-medium">{used}{unlimited ? " / ∞" : ` / ${limit}`}</span>
      </div>
      <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: unlimited ? "8%" : `${pct}%` }} />
      </div>
    </div>
  );
}
