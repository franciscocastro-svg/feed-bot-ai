import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Shield, Users, CheckCircle2, XCircle, AlertTriangle, RefreshCw, DollarSign,
  Activity, Clock, Check, X, ArrowUpDown, Rss, Instagram, Calendar, Zap, TrendingUp,
  LogIn, Settings2, UserCog, ShieldCheck, Gauge, Megaphone, LifeBuoy, Map,
  Server, Radio, ListChecks, Database, Plus, Trash2,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { AlertsCard } from "@/components/admin/AlertsCard";
import { PlanLimitsEditor } from "@/components/admin/PlanLimitsEditor";
import { AdminManager } from "@/components/admin/AdminManager";
import { RoadmapCard } from "@/components/admin/RoadmapCard";

const TokenHealth = lazy(() => import("./TokenHealth"));
const MetaApiHealth = lazy(() => import("./MetaApiHealth"));
const AdminReleases = lazy(() => import("./AdminReleases"));
const AdminSupport = lazy(() => import("./AdminSupport"));

type Row = {
  user_id: string;
  email: string;
  display_name: string | null;
  created_at: string;
  plan: string;
  sub_status: string;
  approval_status: string;
  expires_at: string | null;
  auto_approve: boolean;
  ig_accounts: number;
  ig_token_expires: string | null;
  sources_active: number;
  news_pending: number;
  posts_scheduled: number;
  posts_published: number;
  posts_failed: number;
  last_activity: string | null;
};

const PLANS = ["free", "starter", "pro", "business"];
const STATUSES = ["active", "trialing", "past_due", "canceled", "blocked"];
const EXPENSE_CATEGORIES = ["IA", "Servidor", "Tráfego pago", "Ferramentas", "Equipe", "Outros"];

type QuickFilter = "all" | "pending" | "paying" | "token_expiring" | "failing" | "blocked";
type SortKey = "created_at" | "last_activity" | "posts_published" | "posts_failed" | "plan";
type EndpointHealth = { label: string; status: "online" | "offline"; detail: string };
type CustomerHealth = "healthy" | "attention" | "critical";
type AdminExpense = {
  id: string;
  category: string;
  description: string;
  amount_brl: number;
  spent_at: string;
  recurring: boolean;
  notes: string | null;
  created_at: string;
};
type QueueSummary = {
  scheduled: number;
  posting: number;
  failed: number;
  postedToday: number;
  reelQueued: number;
  reelProcessing: number;
  reelFailed: number;
};

export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const [editing, setEditing] = useState<Row | null>(null);
  const [editPlan, setEditPlan] = useState("free");
  const [editStatus, setEditStatus] = useState("active");
  const [editExpires, setEditExpires] = useState("");
  const [editNotes, setEditNotes] = useState("");

  const [detail, setDetail] = useState<Row | null>(null);
  const [planPrices, setPlanPrices] = useState<Record<string, number>>({});
  const [expenses, setExpenses] = useState<AdminExpense[]>([]);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    category: "IA",
    description: "",
    amount_brl: "",
    spent_at: new Date().toISOString().slice(0, 10),
    recurring: true,
    notes: "",
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkPlan, setBulkPlan] = useState("free");

  // System tab data
  const [sysLoading, setSysLoading] = useState(false);
  const [overdue, setOverdue] = useState<any[]>([]);
  const [recentFailed, setRecentFailed] = useState<any[]>([]);
  const [staleSources, setStaleSources] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [endpointHealth, setEndpointHealth] = useState<EndpointHealth[]>([]);
  const [queueSummary, setQueueSummary] = useState<QueueSummary>({
    scheduled: 0,
    posting: 0,
    failed: 0,
    postedToday: 0,
    reelQueued: 0,
    reelProcessing: 0,
    reelFailed: 0,
  });
  const [lastPublished, setLastPublished] = useState<any | null>(null);
  const [stuckPosting, setStuckPosting] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle()
      .then(({ data }) => {
        const ok = !!data;
        setAllowed(ok);
        if (!ok) navigate("/dashboard");
      });
  }, [user, navigate]);

  const load = async () => {
    setLoading(true);
    const [{ data, error }, { data: plans }, expenseRes] = await Promise.all([
      supabase.rpc("admin_overview"),
      supabase.from("plan_limits").select("plan, price_brl"),
      supabase.from("admin_expenses" as any).select("*").order("spent_at", { ascending: false }).limit(100),
    ]);
    if (error) { toast.error("Erro ao carregar: " + error.message); setRows([]); }
    else setRows((data || []) as Row[]);
    if (plans) {
      const map: Record<string, number> = {};
      plans.forEach((p: any) => { map[p.plan] = Number(p.price_brl || 0); });
      setPlanPrices(map);
    }
    if (!expenseRes.error) setExpenses((expenseRes.data || []) as unknown as AdminExpense[]);
    setLoading(false);
  };

  const loadSystem = async () => {
    setSysLoading(true);
    const nowIso = new Date().toISOString();
    const dayAgo = new Date(Date.now() - 86400000).toISOString();
    const fifteenMinAgo = new Date(Date.now() - 15 * 60000).toISOString();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const checkEndpoint = async (path: string, label: string): Promise<EndpointHealth> => {
      const started = Date.now();
      try {
        const res = await fetch(path, { cache: "no-store" });
        return {
          label,
          status: res.ok ? "online" : "offline",
          detail: res.ok ? `${Date.now() - started} ms` : `HTTP ${res.status}`,
        };
      } catch {
        return { label, status: "offline", detail: "sem resposta" };
      }
    };

    const [
      a, b, c, d, health, deployHealth, scheduledCount, postingCount,
      failedCount, postedTodayCount, reelQueuedCount, reelProcessingCount,
      reelFailedCount, lastPost, stuck,
    ] = await Promise.all([
      supabase.from("scheduled_posts")
        .select("id, scheduled_for, user_id, error_message, news_items(rewritten_title)")
        .eq("status", "scheduled")
        .lt("scheduled_for", nowIso)
        .order("scheduled_for", { ascending: true })
        .limit(20),
      supabase.from("scheduled_posts")
        .select("id, updated_at, user_id, error_message, news_items(rewritten_title)")
        .eq("status", "failed")
        .gte("updated_at", dayAgo)
        .order("updated_at", { ascending: false })
        .limit(20),
      supabase.from("news_sources")
        .select("id, name, url, user_id, last_fetched_at, fetch_interval_minutes, active")
        .eq("active", true)
        .order("last_fetched_at", { ascending: true, nullsFirst: true })
        .limit(20),
      supabase.from("activity_logs")
        .select("id, created_at, user_id, action, entity_type, details")
        .order("created_at", { ascending: false })
        .limit(15),
      checkEndpoint("/health", "Site"),
      checkEndpoint("/deploy-health", "Deploy"),
      supabase.from("scheduled_posts").select("id", { count: "exact", head: true }).eq("status", "scheduled"),
      supabase.from("scheduled_posts").select("id", { count: "exact", head: true }).eq("status", "posting"),
      supabase.from("scheduled_posts").select("id", { count: "exact", head: true }).eq("status", "failed").gte("updated_at", dayAgo),
      supabase.from("scheduled_posts").select("id", { count: "exact", head: true }).eq("status", "posted").gte("posted_at", todayStart.toISOString()),
      supabase.from("reel_render_jobs").select("id", { count: "exact", head: true }).eq("status", "queued"),
      supabase.from("reel_render_jobs").select("id", { count: "exact", head: true }).eq("status", "processing"),
      supabase.from("reel_render_jobs").select("id", { count: "exact", head: true }).eq("status", "failed").gte("updated_at", dayAgo),
      supabase.from("scheduled_posts")
        .select("id, posted_at, media_type, ig_media_id, error_message, news_items(rewritten_title)")
        .eq("status", "posted")
        .order("posted_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("scheduled_posts")
        .select("id, updated_at, user_id, media_type, error_message, news_items(rewritten_title)")
        .eq("status", "posting")
        .lt("updated_at", fifteenMinAgo)
        .order("updated_at", { ascending: true })
        .limit(10),
    ]);
    setOverdue(a.data || []);
    setRecentFailed(b.data || []);
    setEndpointHealth([health, deployHealth]);
    setQueueSummary({
      scheduled: scheduledCount.count || 0,
      posting: postingCount.count || 0,
      failed: failedCount.count || 0,
      postedToday: postedTodayCount.count || 0,
      reelQueued: reelQueuedCount.count || 0,
      reelProcessing: reelProcessingCount.count || 0,
      reelFailed: reelFailedCount.count || 0,
    });
    setLastPublished(lastPost.data || null);
    setStuckPosting(stuck.data || []);
    // filter sources where last_fetched is older than 3x interval
    const stale = (c.data || []).filter((s: any) => {
      if (!s.last_fetched_at) return true;
      const ageMin = (Date.now() - new Date(s.last_fetched_at).getTime()) / 60000;
      return ageMin > (s.fetch_interval_minutes || 30) * 3;
    });
    setStaleSources(stale);
    setRecentActivity(d.data || []);
    setSysLoading(false);
  };

  useEffect(() => {
    if (allowed) {
      load();
      loadSystem();
    }
  }, [allowed]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    let arr = rows;
    if (q) arr = arr.filter(r =>
      r.email.toLowerCase().includes(q) ||
      (r.display_name || "").toLowerCase().includes(q) ||
      r.plan.toLowerCase().includes(q)
    );
    switch (quickFilter) {
      case "pending": arr = arr.filter(r => r.approval_status === "pending"); break;
      case "paying": arr = arr.filter(r => r.plan !== "free" && r.sub_status === "active"); break;
      case "blocked": arr = arr.filter(r => r.sub_status === "blocked" || r.approval_status === "rejected"); break;
      case "failing": arr = arr.filter(r => (r.posts_failed || 0) > 0); break;
      case "token_expiring": arr = arr.filter(r => {
        if (!r.ig_accounts || !r.ig_token_expires) return false;
        const days = (new Date(r.ig_token_expires).getTime() - Date.now()) / 86400000;
        return days < 7;
      }); break;
    }
    const sorted = [...arr].sort((a: any, b: any) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return sorted;
  }, [rows, search, quickFilter, sortKey, sortDir]);

  const totals = useMemo(() => ({
    users: rows.length,
    pending: rows.filter(r => r.approval_status === "pending").length,
    paid: rows.filter(r => r.plan !== "free" && r.sub_status === "active").length,
    blocked: rows.filter(r => r.sub_status === "blocked" || r.approval_status === "rejected").length,
    published: rows.reduce((s, r) => s + (r.posts_published || 0), 0),
    failed: rows.reduce((s, r) => s + (r.posts_failed || 0), 0),
  }), [rows]);

  const mrr = useMemo(() => {
    const byPlan: Record<string, { count: number; total: number }> = {};
    let total = 0;
    rows.filter(r => r.plan !== "free" && r.sub_status === "active").forEach(r => {
      const price = planPrices[r.plan] || 0;
      total += price;
      if (!byPlan[r.plan]) byPlan[r.plan] = { count: 0, total: 0 };
      byPlan[r.plan].count++;
      byPlan[r.plan].total += price;
    });
    return { total, byPlan };
  }, [rows, planPrices]);

  const financeSummary = useMemo(() => {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const monthExpenses = expenses.filter(e => new Date(e.spent_at) >= monthStart);
    const totalExpenses = monthExpenses.reduce((sum, e) => sum + Number(e.amount_brl || 0), 0);
    const recurringExpenses = expenses.filter(e => e.recurring).reduce((sum, e) => sum + Number(e.amount_brl || 0), 0);
    const byCategory = monthExpenses.reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + Number(e.amount_brl || 0);
      return acc;
    }, {});
    return {
      totalExpenses,
      recurringExpenses,
      estimatedProfit: mrr.total - totalExpenses,
      byCategory,
    };
  }, [expenses, mrr.total]);

  const tokenStats = useMemo(() => {
    let expired = 0, soon = 0, ok = 0, none = 0;
    rows.forEach(r => {
      if (!r.ig_accounts) { none++; return; }
      if (!r.ig_token_expires) { none++; return; }
      const days = (new Date(r.ig_token_expires).getTime() - Date.now()) / 86400000;
      if (days < 0) expired++;
      else if (days < 7) soon++;
      else ok++;
    });
    return { expired, soon, ok, none };
  }, [rows]);

  const operationalAlerts = useMemo(() => {
    const alerts: { label: string; detail: string; tone: "critical" | "warning" | "ok" }[] = [];
    const offline = endpointHealth.filter(h => h.status === "offline");
    if (offline.length) alerts.push({ label: "Serviço offline", detail: offline.map(h => h.label).join(", "), tone: "critical" });
    if (stuckPosting.length) alerts.push({ label: "Posts travados", detail: `${stuckPosting.length} envio(s) em posting há mais de 15 min`, tone: "critical" });
    if (recentFailed.length) alerts.push({ label: "Falhas recentes", detail: `${recentFailed.length} falha(s) nas últimas 24h`, tone: "warning" });
    if (overdue.length) alerts.push({ label: "Fila atrasada", detail: `${overdue.length} post(s) com horário vencido`, tone: "warning" });
    if (staleSources.length) alerts.push({ label: "RSS parado", detail: `${staleSources.length} fonte(s) sem atualização`, tone: "warning" });
    if (tokenStats.expired || tokenStats.soon) alerts.push({ label: "Tokens IG", detail: `${tokenStats.expired} expirado(s), ${tokenStats.soon} vencendo`, tone: "warning" });
    if (!alerts.length) alerts.push({ label: "Operação saudável", detail: "Sem alertas críticos no momento", tone: "ok" });
    return alerts.slice(0, 5);
  }, [endpointHealth, stuckPosting, recentFailed, overdue, staleSources, tokenStats]);

  const customerHealth = (r: Row): CustomerHealth => {
    if (r.sub_status === "blocked" || r.approval_status === "rejected") return "critical";
    if ((r.posts_failed || 0) > 0) return "attention";
    if (r.ig_accounts > 0 && r.ig_token_expires) {
      const days = (new Date(r.ig_token_expires).getTime() - Date.now()) / 86400000;
      if (days < 0) return "critical";
      if (days < 7) return "attention";
    }
    if (!r.ig_accounts || !r.sources_active) return "attention";
    return "healthy";
  };

  const healthBadge = (health: CustomerHealth) => {
    if (health === "critical") return <Badge variant="destructive">Crítico</Badge>;
    if (health === "attention") return <Badge className="bg-orange-500">Atenção</Badge>;
    return <Badge className="bg-green-600">Saudável</Badge>;
  };

  const setApproval = async (uid: string, status: "approved" | "rejected" | "pending") => {
    const { error } = await supabase.from("user_subscriptions")
      .upsert({ user_id: uid, approval_status: status }, { onConflict: "user_id" });
    if (error) toast.error(error.message);
    else {
      toast.success(status === "approved" ? "Usuário aprovado" : status === "rejected" ? "Usuário rejeitado" : "Voltou pra pendente");
      load();
    }
  };

  const bulkApprove = async (status: "approved" | "rejected") => {
    if (selected.size === 0) return;
    const ids = [...selected];
    const rows = ids.map(id => ({ user_id: id, approval_status: status }));
    const { error } = await supabase.from("user_subscriptions").upsert(rows, { onConflict: "user_id" });
    if (error) toast.error(error.message);
    else { toast.success(`${ids.length} usuário(s) atualizados`); setSelected(new Set()); load(); }
  };

  const bulkChangePlan = async () => {
    if (selected.size === 0) return;
    const ids = [...selected];
    const rows = ids.map(id => ({ user_id: id, plan: bulkPlan }));
    const { error } = await supabase.from("user_subscriptions").upsert(rows, { onConflict: "user_id" });
    if (error) toast.error(error.message);
    else { toast.success(`Plano alterado para ${ids.length} usuário(s)`); setSelected(new Set()); setBulkOpen(false); load(); }
  };

  const toggleSelect = (uid: string) => {
    setSelected(prev => {
      const n = new Set(prev);
      if (n.has(uid)) n.delete(uid); else n.add(uid);
      return n;
    });
  };

  const impersonate = async (target_user_id: string) => {
    if (!confirm("Gerar link mágico de acesso como este usuário?\n\nAbra em uma janela anônima — entrar no link nesta aba vai derrubar sua sessão de admin.")) return;
    const { data, error } = await supabase.functions.invoke("admin-impersonate", {
      body: { target_user_id, redirect_to: `${window.location.origin}/dashboard` },
    });
    if (error || !data?.url) return toast.error(error?.message || "Falha ao gerar link");
    try { await navigator.clipboard.writeText(data.url); toast.success(`Link copiado (${data.email})`); }
    catch { window.prompt("Copie o link de acesso:", data.url); }
  };

  const approvalBadge = (s: string) => {
    if (s === "approved") return <Badge className="bg-green-600">Aprovado</Badge>;
    if (s === "rejected") return <Badge variant="destructive">Rejeitado</Badge>;
    return <Badge className="bg-orange-500">Pendente</Badge>;
  };

  const openEdit = (r: Row) => {
    setEditing(r);
    setEditPlan(r.plan || "free");
    setEditStatus(r.sub_status || "active");
    setEditExpires(r.expires_at ? r.expires_at.slice(0, 10) : "");
    setEditNotes("");
  };

  const saveEdit = async () => {
    if (!editing) return;
    const { error } = await supabase.from("user_subscriptions").upsert({
      user_id: editing.user_id,
      plan: editPlan,
      status: editStatus,
      expires_at: editExpires ? new Date(editExpires).toISOString() : null,
      notes: editNotes || null,
    }, { onConflict: "user_id" });
    if (error) toast.error(error.message);
    else { toast.success("Atualizado"); setEditing(null); load(); }
  };

  const saveExpense = async () => {
    const amount = Number(String(expenseForm.amount_brl).replace(",", "."));
    if (!expenseForm.description.trim()) return toast.error("Informe a descrição do gasto.");
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Informe um valor válido.");
    const { error } = await supabase.from("admin_expenses" as any).insert({
      category: expenseForm.category,
      description: expenseForm.description.trim(),
      amount_brl: amount,
      spent_at: new Date(expenseForm.spent_at).toISOString(),
      recurring: expenseForm.recurring,
      notes: expenseForm.notes.trim() || null,
      created_by: user?.id,
    } as any);
    if (error) return toast.error(error.message);
    toast.success("Gasto adicionado");
    setExpenseOpen(false);
    setExpenseForm({
      category: "IA",
      description: "",
      amount_brl: "",
      spent_at: new Date().toISOString().slice(0, 10),
      recurring: true,
      notes: "",
    });
    load();
  };

  const deleteExpense = async (id: string) => {
    if (!confirm("Remover este gasto?")) return;
    const { error } = await supabase.from("admin_expenses" as any).delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Gasto removido"); load(); }
  };

  const tokenBadge = (date: string | null, count: number) => {
    if (!count) return <Badge variant="outline">Sem IG</Badge>;
    if (!date) return <Badge variant="outline">?</Badge>;
    const days = Math.round((new Date(date).getTime() - Date.now()) / 86400000);
    if (days < 0) return <Badge variant="destructive">Expirado</Badge>;
    if (days < 7) return <Badge variant="destructive">{days}d</Badge>;
    if (days < 20) return <Badge className="bg-orange-500">{days}d</Badge>;
    return <Badge className="bg-green-600">{days}d</Badge>;
  };

  const statusBadge = (s: string) => {
    if (s === "active") return <Badge className="bg-green-600">Ativo</Badge>;
    if (s === "trialing") return <Badge className="bg-blue-500">Trial</Badge>;
    if (s === "past_due") return <Badge className="bg-orange-500">Atraso</Badge>;
    if (s === "blocked") return <Badge variant="destructive">Bloqueado</Badge>;
    if (s === "canceled") return <Badge variant="outline">Cancelado</Badge>;
    return <Badge variant="outline">{s}</Badge>;
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("desc"); }
  };

  const SortHeader = ({ k, children, align = "left" }: { k: SortKey; children: React.ReactNode; align?: "left" | "center" }) => (
    <th className={`p-2 text-${align}`}>
      <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-foreground">
        {children}<ArrowUpDown className={`h-3 w-3 ${sortKey === k ? "text-primary" : "opacity-40"}`} />
      </button>
    </th>
  );

  const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (allowed === null) return <div className="p-6">Verificando...</div>;
  if (!allowed) return null;

  const kpis = [
    { key: "users", icon: Users, label: "Usuários", value: totals.users, tint: "bg-blue-500/10 text-blue-400" },
    { key: "pending", icon: Clock, label: "Pendentes", value: totals.pending, tint: "bg-amber-500/10 text-amber-400", emphasis: totals.pending > 0 },
    { key: "paid", icon: DollarSign, label: "Pagantes", value: totals.paid, tint: "bg-emerald-500/10 text-emerald-400" },
    { key: "mrr", icon: TrendingUp, label: "MRR estimado", value: fmtBRL(mrr.total), tint: "bg-green-500/10 text-green-400" },
    { key: "blocked", icon: XCircle, label: "Bloqueados", value: totals.blocked, tint: "bg-rose-500/10 text-rose-400" },
    { key: "queue", icon: ListChecks, label: "Na fila", value: queueSummary.scheduled, tint: "bg-cyan-500/10 text-cyan-400" },
    { key: "pub", icon: CheckCircle2, label: "Posts publicados", value: totals.published, tint: "bg-fuchsia-500/10 text-fuchsia-400" },
    { key: "fail", icon: AlertTriangle, label: "Falhas", value: totals.failed, tint: "bg-orange-500/10 text-orange-400" },
  ];

  const adminTabs = [
    { value: "users", label: "Usuários", icon: Users },
    { value: "system", label: "Saúde", icon: Activity },
    { value: "finance", label: "Financeiro", icon: DollarSign },
    { value: "plans", label: "Planos", icon: Settings2 },
    { value: "team", label: "Equipe", icon: UserCog },
    { value: "tokens", label: "Tokens", icon: ShieldCheck },
    { value: "meta", label: "Saúde API Meta", icon: Gauge },
    { value: "releases", label: "Novidades", icon: Megaphone },
    { value: "support", label: "Suporte", icon: LifeBuoy },
    { value: "roadmap", label: "Roadmap", icon: Map },
  ];

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-[1600px] mx-auto">
      {/* Header com breadcrumb */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            <span>Dashboard</span>
            <span>/</span>
            <span className="text-primary">Admin</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-display font-bold tracking-tight flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
              <Shield className="h-5 w-5 text-primary" />
            </span>
            Painel Admin
          </h1>
          <p className="text-muted-foreground text-sm">Controle global de usuários, planos e saúde do sistema.</p>
        </div>
        <Button variant="outline" onClick={() => { load(); loadSystem(); }} disabled={loading} className="self-start md:self-auto">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      {/* KPIs refinados */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        {kpis.map(k => (
          <Card key={k.key} className={`border-border/60 transition-colors hover:border-primary/30 ${k.emphasis ? "border-amber-500/40" : ""}`}>
            <CardContent className="pt-5 pb-4 space-y-3">
              <div className={`inline-flex items-center justify-center h-8 w-8 rounded-lg ${k.tint}`}>
                <k.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{k.label}</p>
                <p className="text-2xl font-bold mt-0.5">{k.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr_0.9fr]">
        <Card className={operationalAlerts.some(a => a.tone === "critical") ? "border-destructive/50" : ""}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-400" /> Central de alertas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {operationalAlerts.map((alert) => (
              <div key={alert.label} className="flex items-start justify-between gap-3 rounded-lg border border-border/50 bg-background/45 p-3">
                <div>
                  <div className="text-sm font-medium">{alert.label}</div>
                  <div className="text-xs text-muted-foreground">{alert.detail}</div>
                </div>
                <Badge
                  variant={alert.tone === "critical" ? "destructive" : "outline"}
                  className={alert.tone === "ok" ? "bg-green-600 text-white border-green-600" : alert.tone === "warning" ? "border-orange-500/60 text-orange-400" : ""}
                >
                  {alert.tone === "ok" ? "OK" : alert.tone === "critical" ? "Crítico" : "Atenção"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-cyan-400" /> Fila operacional
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3">
            {([
              ["Agendados", queueSummary.scheduled, "text-cyan-400"],
              ["Enviando", queueSummary.posting, "text-fuchsia-400"],
              ["Publicados hoje", queueSummary.postedToday, "text-green-500"],
              ["Falhas 24h", queueSummary.failed, "text-orange-500"],
              ["Reels na fila", queueSummary.reelQueued, "text-blue-400"],
              ["Reels processando", queueSummary.reelProcessing, "text-primary"],
            ] as const).map(([label, value, color]) => (
              <div key={label as string} className="rounded-lg bg-background/50 p-3">
                <div className={`text-2xl font-bold ${color}`}>{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-green-500" /> Financeiro rápido
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-xs text-muted-foreground">MRR estimado</div>
              <div className="text-3xl font-bold text-green-600">{fmtBRL(mrr.total)}</div>
            </div>
            <div className="space-y-2">
              {Object.entries(mrr.byPlan).length === 0 && <p className="text-sm text-muted-foreground">Sem assinantes pagantes ainda.</p>}
              {Object.entries(mrr.byPlan).map(([plan, info]) => (
                <div key={plan} className="flex items-center justify-between text-sm">
                  <Badge variant="outline" className="capitalize">{plan}</Badge>
                  <span className="text-muted-foreground">{info.count} cliente(s)</span>
                  <span className="font-medium">{fmtBRL(info.total)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertsCard rows={rows} />

      {/* Tabs com sidebar vertical interna */}
      <Tabs defaultValue="users" orientation="vertical" onValueChange={(v) => { if (v === "system") loadSystem(); }} className="flex flex-col lg:flex-row gap-4">
        <TabsList className="lg:flex-col lg:h-auto lg:items-stretch lg:justify-start lg:w-56 lg:shrink-0 lg:p-2 lg:bg-card lg:border lg:border-border lg:rounded-xl flex-wrap h-auto">
          {adminTabs.map(t => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              className="lg:justify-start lg:w-full lg:px-3 lg:py-2.5 lg:data-[state=active]:bg-primary/10 lg:data-[state=active]:text-primary lg:data-[state=active]:shadow-none"
            >
              <t.icon className="h-4 w-4 mr-1.5" /> {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="flex-1 min-w-0">


        {/* ====== USUÁRIOS ====== */}
        <TabsContent value="users" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-3 flex-wrap">
                <span className="flex items-center gap-2"><Users className="h-5 w-5"/> Usuários ({filtered.length})</span>
                <Input placeholder="Buscar email, nome, plano..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs" />
              </CardTitle>
              <div className="flex flex-wrap gap-1.5 pt-2">
                {([
                  ["all", "Todos", rows.length],
                  ["pending", "Pendentes", totals.pending],
                  ["paying", "Pagantes", totals.paid],
                  ["token_expiring", "Token expirando", tokenStats.expired + tokenStats.soon],
                  ["failing", "Com falhas", rows.filter(r => (r.posts_failed || 0) > 0).length],
                  ["blocked", "Bloqueados", totals.blocked],
                ] as [QuickFilter, string, number][]).map(([key, label, count]) => (
                  <button
                    key={key}
                    onClick={() => setQuickFilter(key)}
                    className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                      quickFilter === key ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-secondary"
                    }`}
                  >
                    {label} <span className="opacity-70">({count})</span>
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {selected.size > 0 && (
                <div className="flex items-center justify-between gap-3 p-3 mb-3 rounded-lg bg-primary/10 border border-primary/30 flex-wrap">
                  <span className="text-sm font-medium">{selected.size} selecionado(s)</span>
                  <div className="flex gap-2 flex-wrap">
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 h-8" onClick={() => bulkApprove("approved")}>
                      <Check className="h-3 w-3 mr-1"/> Aprovar todos
                    </Button>
                    <Button size="sm" variant="destructive" className="h-8" onClick={() => bulkApprove("rejected")}>
                      <X className="h-3 w-3 mr-1"/> Rejeitar todos
                    </Button>
                    <Button size="sm" variant="outline" className="h-8" onClick={() => setBulkOpen(true)}>Mudar plano</Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => setSelected(new Set())}>Limpar</Button>
                  </div>
                </div>
              )}
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="p-2 w-8">
                      <Checkbox
                        checked={filtered.length > 0 && filtered.every(r => selected.has(r.user_id))}
                        onCheckedChange={(v) => {
                          if (v) setSelected(new Set(filtered.map(r => r.user_id)));
                          else setSelected(new Set());
                        }}
                      />
                    </th>
                    <SortHeader k="created_at">Usuário</SortHeader>
                    <th className="text-left p-2">Saúde</th>
                    <th className="text-left p-2">Aprovação</th>
                    <SortHeader k="plan">Plano / Status</SortHeader>
                    <th className="text-left p-2">Expira</th>
                    <th className="text-center p-2">Token IG</th>
                    <SortHeader k="posts_published" align="center">Pub</SortHeader>
                    <SortHeader k="posts_failed" align="center">Falha</SortHeader>
                    <SortHeader k="last_activity" align="center">Últ. atividade</SortHeader>
                    <th className="text-center p-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr
                      key={r.user_id}
                      className={`border-b hover:bg-muted/30 cursor-pointer ${r.approval_status === "pending" ? "bg-orange-500/5" : ""} ${selected.has(r.user_id) ? "bg-primary/5" : ""}`}
                      onClick={() => setDetail(r)}
                    >
                      <td className="p-2" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selected.has(r.user_id)} onCheckedChange={() => toggleSelect(r.user_id)} />
                      </td>
                      <td className="p-2">
                        <div className="font-medium">{r.display_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{r.email}</div>
                        <div className="text-[10px] text-muted-foreground">Cadastro: {new Date(r.created_at).toLocaleDateString("pt-BR")}</div>
                      </td>
                      <td className="p-2">{healthBadge(customerHealth(r))}</td>
                      <td className="p-2">{approvalBadge(r.approval_status)}</td>
                      <td className="p-2">
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline" className="w-fit capitalize">{r.plan}</Badge>
                          {statusBadge(r.sub_status)}
                        </div>
                      </td>
                      <td className="p-2 text-xs">{r.expires_at ? new Date(r.expires_at).toLocaleDateString("pt-BR") : "—"}</td>
                      <td className="p-2 text-center">{tokenBadge(r.ig_token_expires, r.ig_accounts)}</td>
                      <td className="p-2 text-center text-green-600 font-medium">{r.posts_published}</td>
                      <td className="p-2 text-center text-orange-500">{r.posts_failed}</td>
                      <td className="p-2 text-center text-xs text-muted-foreground">
                        {r.last_activity ? new Date(r.last_activity).toLocaleDateString("pt-BR") : "—"}
                      </td>
                      <td className="p-2" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-wrap gap-1 justify-center">
                          {r.approval_status !== "approved" && (
                            <Button size="sm" className="bg-green-600 hover:bg-green-700 h-7 px-2" onClick={() => setApproval(r.user_id, "approved")}>
                              <Check className="h-3 w-3 mr-1"/> Aprovar
                            </Button>
                          )}
                          {r.approval_status !== "rejected" && (
                            <Button size="sm" variant="destructive" className="h-7 px-2" onClick={() => setApproval(r.user_id, "rejected")}>
                              <X className="h-3 w-3 mr-1"/> Rejeitar
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => openEdit(r)}>Plano</Button>
                          <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => impersonate(r.user_id)} title="Logar como (gera link mágico)">
                            <LogIn className="h-3 w-3"/>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!filtered.length && !loading && (
                    <tr><td colSpan={11} className="text-center text-muted-foreground p-6">Nenhum usuário</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ====== SISTEMA ====== */}
        <TabsContent value="system" className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold">Saúde operacional</h2>
              <p className="text-sm text-muted-foreground">Visão admin do VPS, fila de publicação e geração de Reels.</p>
            </div>
            <Button variant="outline" size="sm" onClick={loadSystem} disabled={sysLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${sysLoading ? "animate-spin" : ""}`}/> Recarregar
            </Button>
          </div>

          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
            {endpointHealth.map((h) => (
              <Card key={h.label} className={h.status === "offline" ? "border-destructive/50" : "border-green-600/30"}>
                <CardContent className="pt-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      {h.label === "Deploy" ? <Radio className="h-4 w-4" /> : <Server className="h-4 w-4" />}
                    </div>
                    <Badge className={h.status === "online" ? "bg-green-600" : "bg-destructive"}>
                      {h.status === "online" ? "Online" : "Offline"}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-sm font-medium">{h.label}</p>
                    <p className="text-xs text-muted-foreground">{h.detail}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
            {endpointHealth.length === 0 && (
              <>
                <Card><CardContent className="pt-5"><div className="h-20 animate-pulse rounded-md bg-muted" /></CardContent></Card>
                <Card><CardContent className="pt-5"><div className="h-20 animate-pulse rounded-md bg-muted" /></CardContent></Card>
              </>
            )}
            <Card>
              <CardContent className="pt-5 space-y-3">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400">
                  <ListChecks className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Fila de publicação</p>
                  <p className="text-xs text-muted-foreground">
                    {queueSummary.scheduled} agendados · {queueSummary.posting} enviando · {queueSummary.failed} falhas 24h
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 space-y-3">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-fuchsia-500/10 text-fuchsia-400">
                  <Database className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Reels no worker</p>
                  <p className="text-xs text-muted-foreground">
                    {queueSummary.reelQueued} na fila · {queueSummary.reelProcessing} processando · {queueSummary.reelFailed} falhas 24h
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><CheckCircle2 className="h-4 w-4"/> Última publicação</CardTitle></CardHeader>
              <CardContent>
                {!lastPublished ? (
                  <p className="text-sm text-muted-foreground">Nenhuma publicação encontrada.</p>
                ) : (
                  <div className="space-y-2 text-sm">
                    <div className="font-medium line-clamp-2">{lastPublished.news_items?.rewritten_title || "Sem título"}</div>
                    <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
                      <Badge variant="outline">{lastPublished.media_type}</Badge>
                      <span>{new Date(lastPublished.posted_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</span>
                      {lastPublished.ig_media_id && <span>ID {lastPublished.ig_media_id}</span>}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className={stuckPosting.length ? "border-destructive/50" : ""}>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4"/> Envios travados</CardTitle></CardHeader>
              <CardContent className="space-y-2 max-h-40 overflow-y-auto">
                {stuckPosting.length === 0 && <p className="text-sm text-muted-foreground">Nenhum post travado em envio.</p>}
                {stuckPosting.map((p: any) => (
                  <div key={p.id} className="text-xs border-b border-border/50 pb-2">
                    <div className="font-medium line-clamp-1">{p.news_items?.rewritten_title || "—"}</div>
                    <div className="text-destructive">
                      Enviando desde {new Date(p.updated_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-4 gap-3">
            <Card><CardContent className="pt-5">
              <div className="flex items-center gap-2 text-muted-foreground text-xs"><Calendar className="h-3.5 w-3.5"/> Atrasados na fila</div>
              <div className="text-2xl font-bold text-orange-500">{overdue.length}</div>
            </CardContent></Card>
            <Card><CardContent className="pt-5">
              <div className="flex items-center gap-2 text-muted-foreground text-xs"><AlertTriangle className="h-3.5 w-3.5"/> Falhas (24h)</div>
              <div className="text-2xl font-bold text-destructive">{recentFailed.length}</div>
            </CardContent></Card>
            <Card><CardContent className="pt-5">
              <div className="flex items-center gap-2 text-muted-foreground text-xs"><Rss className="h-3.5 w-3.5"/> Fontes paradas</div>
              <div className="text-2xl font-bold text-orange-500">{staleSources.length}</div>
            </CardContent></Card>
            <Card><CardContent className="pt-5">
              <div className="flex items-center gap-2 text-muted-foreground text-xs"><Instagram className="h-3.5 w-3.5"/> Tokens IG</div>
              <div className="flex items-baseline gap-2 text-sm mt-1">
                <span className="text-destructive font-bold">{tokenStats.expired}</span>exp
                <span className="text-orange-500 font-bold ml-2">{tokenStats.soon}</span>{"<7d"}
                <span className="text-green-600 font-bold ml-2">{tokenStats.ok}</span>ok
              </div>
            </CardContent></Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4"/> Posts atrasados</CardTitle></CardHeader>
              <CardContent className="space-y-2 max-h-80 overflow-y-auto">
                {overdue.length === 0 && <p className="text-sm text-muted-foreground">Fila em dia ✓</p>}
                {overdue.map((p: any) => (
                  <div key={p.id} className="text-xs border-b border-border/50 pb-2">
                    <div className="font-medium line-clamp-1">{p.news_items?.rewritten_title || "—"}</div>
                    <div className="text-muted-foreground">Era {new Date(p.scheduled_for).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4"/> Falhas recentes</CardTitle></CardHeader>
              <CardContent className="space-y-2 max-h-80 overflow-y-auto">
                {recentFailed.length === 0 && <p className="text-sm text-muted-foreground">Sem falhas nas últimas 24h ✓</p>}
                {recentFailed.map((p: any) => (
                  <div key={p.id} className="text-xs border-b border-border/50 pb-2">
                    <div className="font-medium line-clamp-1">{p.news_items?.rewritten_title || "—"}</div>
                    <div className="text-destructive line-clamp-2">{p.error_message || "erro desconhecido"}</div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Rss className="h-4 w-4"/> Fontes RSS paradas</CardTitle></CardHeader>
              <CardContent className="space-y-2 max-h-80 overflow-y-auto">
                {staleSources.length === 0 && <p className="text-sm text-muted-foreground">Todas atualizadas ✓</p>}
                {staleSources.map((s: any) => (
                  <div key={s.id} className="text-xs border-b border-border/50 pb-2">
                    <div className="font-medium line-clamp-1">{s.name}</div>
                    <div className="text-muted-foreground line-clamp-1">{s.url}</div>
                    <div className="text-orange-500">
                      Última: {s.last_fetched_at ? new Date(s.last_fetched_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "nunca"}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Zap className="h-4 w-4"/> Atividade recente</CardTitle></CardHeader>
              <CardContent className="space-y-2 max-h-80 overflow-y-auto">
                {recentActivity.length === 0 && <p className="text-sm text-muted-foreground">Sem atividade</p>}
                {recentActivity.map((a: any) => (
                  <div key={a.id} className="text-xs border-b border-border/50 pb-2">
                    <div className="font-medium">{a.action} <span className="text-muted-foreground">{a.entity_type}</span></div>
                    <div className="text-muted-foreground">{new Date(a.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ====== FINANCEIRO ====== */}
        <TabsContent value="finance" className="mt-4 space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold">Finanças do projeto</h2>
              <p className="text-sm text-muted-foreground">Receita, custos, lucro estimado e gastos operacionais.</p>
            </div>
            <Button onClick={() => setExpenseOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> Adicionar gasto
            </Button>
          </div>

          <div className="grid md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 text-muted-foreground text-xs"><TrendingUp className="h-3.5 w-3.5"/> MRR estimado</div>
                <div className="text-3xl font-bold text-green-600 mt-1">{fmtBRL(mrr.total)}</div>
                <div className="text-xs text-muted-foreground mt-1">{totals.paid} assinantes ativos</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 text-muted-foreground text-xs"><DollarSign className="h-3.5 w-3.5"/> Gastos do mês</div>
                <div className="text-3xl font-bold text-orange-500 mt-1">{fmtBRL(financeSummary.totalExpenses)}</div>
                <div className="text-xs text-muted-foreground mt-1">{expenses.length} gasto(s) registrados</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 text-muted-foreground text-xs"><RefreshCw className="h-3.5 w-3.5"/> Custos recorrentes</div>
                <div className="text-3xl font-bold text-fuchsia-500 mt-1">{fmtBRL(financeSummary.recurringExpenses)}</div>
                <div className="text-xs text-muted-foreground mt-1">Base mensal cadastrada</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5">
                <div className="flex items-center gap-2 text-muted-foreground text-xs"><Activity className="h-3.5 w-3.5"/> Lucro estimado</div>
                <div className={`text-3xl font-bold mt-1 ${financeSummary.estimatedProfit >= 0 ? "text-green-600" : "text-destructive"}`}>
                  {fmtBRL(financeSummary.estimatedProfit)}
                </div>
                <div className="text-xs text-muted-foreground mt-1">MRR - gastos do mês</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Receita por plano</CardTitle></CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(mrr.byPlan).length === 0 && <p className="text-sm text-muted-foreground">Sem assinantes pagantes ainda.</p>}
                  {Object.entries(mrr.byPlan).map(([plan, info]) => (
                    <div key={plan} className="flex items-center justify-between text-sm border-b border-border/50 pb-1.5">
                      <Badge variant="outline" className="capitalize">{plan}</Badge>
                      <div className="text-muted-foreground">{info.count} × {fmtBRL(planPrices[plan] || 0)}</div>
                      <div className="font-bold text-green-600">{fmtBRL(info.total)}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Gastos por categoria</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(financeSummary.byCategory).length === 0 && <p className="text-sm text-muted-foreground">Nenhum gasto registrado neste mês.</p>}
                {Object.entries(financeSummary.byCategory).map(([category, total]) => (
                  <div key={category} className="flex items-center justify-between text-sm border-b border-border/50 pb-1.5">
                    <Badge variant="outline">{category}</Badge>
                    <div className="font-bold text-orange-500">{fmtBRL(total)}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between gap-3">
                <span>Gastos cadastrados</span>
                <Button size="sm" variant="outline" onClick={() => setExpenseOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Novo gasto
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="text-left p-2">Data</th>
                    <th className="text-left p-2">Categoria</th>
                    <th className="text-left p-2">Descrição</th>
                    <th className="text-left p-2">Recorrente</th>
                    <th className="text-right p-2">Valor</th>
                    <th className="text-right p-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map(e => (
                    <tr key={e.id} className="border-b hover:bg-muted/30">
                      <td className="p-2 text-xs">{new Date(e.spent_at).toLocaleDateString("pt-BR")}</td>
                      <td className="p-2"><Badge variant="outline">{e.category}</Badge></td>
                      <td className="p-2">
                        <div className="font-medium">{e.description}</div>
                        {e.notes && <div className="text-xs text-muted-foreground line-clamp-1">{e.notes}</div>}
                      </td>
                      <td className="p-2">{e.recurring ? <Badge className="bg-blue-600">Sim</Badge> : <Badge variant="outline">Não</Badge>}</td>
                      <td className="p-2 text-right font-medium text-orange-500">{fmtBRL(Number(e.amount_brl || 0))}</td>
                      <td className="p-2 text-right">
                        <Button size="sm" variant="ghost" onClick={() => deleteExpense(e.id)} title="Remover gasto">
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {expenses.length === 0 && (
                    <tr><td colSpan={6} className="text-center text-muted-foreground p-6">Nenhum gasto cadastrado</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Assinantes pagantes</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b">
                  <tr>
                    <th className="text-left p-2">Usuário</th>
                    <th className="text-left p-2">Plano</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Expira</th>
                    <th className="text-right p-2">Valor/mês</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.filter(r => r.plan !== "free").map(r => (
                    <tr key={r.user_id} className="border-b hover:bg-muted/30 cursor-pointer" onClick={() => setDetail(r)}>
                      <td className="p-2">
                        <div className="font-medium">{r.display_name || "—"}</div>
                        <div className="text-xs text-muted-foreground">{r.email}</div>
                      </td>
                      <td className="p-2"><Badge variant="outline" className="capitalize">{r.plan}</Badge></td>
                      <td className="p-2">{statusBadge(r.sub_status)}</td>
                      <td className="p-2 text-xs">{r.expires_at ? new Date(r.expires_at).toLocaleDateString("pt-BR") : "—"}</td>
                      <td className="p-2 text-right font-medium">{fmtBRL(planPrices[r.plan] || 0)}</td>
                    </tr>
                  ))}
                  {rows.filter(r => r.plan !== "free").length === 0 && (
                    <tr><td colSpan={5} className="text-center text-muted-foreground p-6">Nenhum assinante pago</td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ====== PLANOS ====== */}
        <TabsContent value="plans" className="mt-4">
          <PlanLimitsEditor />
        </TabsContent>

        {/* ====== EQUIPE ====== */}
        <TabsContent value="team" className="mt-4">
          <AdminManager allUsers={rows} />
        </TabsContent>

        <TabsContent value="tokens" className="mt-4 -mx-4 md:-mx-6">
          <Suspense fallback={<div className="p-6 text-muted-foreground">Carregando…</div>}>
            <TokenHealth />
          </Suspense>
        </TabsContent>

        <TabsContent value="meta" className="mt-4 -mx-4 md:-mx-6">
          <Suspense fallback={<div className="p-6 text-muted-foreground">Carregando…</div>}>
            <MetaApiHealth />
          </Suspense>
        </TabsContent>

        <TabsContent value="releases" className="mt-4 -mx-4 md:-mx-6">
          <Suspense fallback={<div className="p-6 text-muted-foreground">Carregando…</div>}>
            <AdminReleases />
          </Suspense>
        </TabsContent>

        <TabsContent value="support" className="mt-4 -mx-4 md:-mx-6">
          <Suspense fallback={<div className="p-6 text-muted-foreground">Carregando…</div>}>
            <AdminSupport />
          </Suspense>
        </TabsContent>

        <TabsContent value="roadmap" className="mt-4">
          <RoadmapCard totalClients={rows.length} />
        </TabsContent>
        </div>
      </Tabs>

      <Dialog open={expenseOpen} onOpenChange={setExpenseOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Adicionar gasto do projeto</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium mb-1 block">Categoria</label>
                <Select value={expenseForm.category} onValueChange={(category) => setExpenseForm(f => ({ ...f, category }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Data</label>
                <Input type="date" value={expenseForm.spent_at} onChange={e => setExpenseForm(f => ({ ...f, spent_at: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Descrição</label>
              <Input
                value={expenseForm.description}
                onChange={e => setExpenseForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Ex: OpenAI, Contabo VPS, Meta Ads..."
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Valor em R$</label>
              <Input
                inputMode="decimal"
                value={expenseForm.amount_brl}
                onChange={e => setExpenseForm(f => ({ ...f, amount_brl: e.target.value }))}
                placeholder="Ex: 129,90"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={expenseForm.recurring}
                onCheckedChange={(checked) => setExpenseForm(f => ({ ...f, recurring: !!checked }))}
              />
              Gasto recorrente mensal
            </label>
            <div>
              <label className="text-sm font-medium mb-1 block">Notas</label>
              <Textarea
                value={expenseForm.notes}
                onChange={e => setExpenseForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Observação interna opcional"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExpenseOpen(false)}>Cancelar</Button>
            <Button onClick={saveExpense}>Salvar gasto</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk: mudar plano */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mudar plano de {selected.size} usuário(s)</DialogTitle></DialogHeader>
          <Select value={bulkPlan} onValueChange={setBulkPlan}>
            <SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>{PLANS.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancelar</Button>
            <Button onClick={bulkChangePlan}>Aplicar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de plano (mantido) */}
      <Dialog open={!!editing} onOpenChange={o => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Gerenciar {editing?.email}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Plano</label>
              <Select value={editPlan} onValueChange={setEditPlan}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>{PLANS.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Status</label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">"blocked" impede publicações automáticas (a verificar nas funções).</p>
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Expira em</label>
              <Input type="date" value={editExpires} onChange={e => setEditExpires(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Notas internas</label>
              <Textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} placeholder="Pago via PIX em 07/05..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={saveEdit}><Activity className="h-4 w-4 mr-2"/> Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drawer de detalhe do usuário */}
      <UserDetailDrawer row={detail} onClose={() => setDetail(null)} onEdit={(r) => { setDetail(null); openEdit(r); }} onImpersonate={impersonate} />
    </div>
  );
}

function UserDetailDrawer({ row, onClose, onEdit, onImpersonate }: { row: Row | null; onClose: () => void; onEdit: (r: Row) => void; onImpersonate: (uid: string) => void }) {
  const [igAccounts, setIgAccounts] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [recentPosts, setRecentPosts] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!row) return;
    setLoading(true);
    supabase.rpc("admin_get_user_details", { _uid: row.user_id }).then(({ data }) => {
      const d: any = data || {};
      setIgAccounts(d.instagram_accounts || []);
      setSources(d.news_sources || []);
      setRecentPosts(d.scheduled_posts || []);
      setLogs(d.activity_logs || []);
      setLoading(false);
    });
  }, [row]);

  return (
    <Sheet open={!!row} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{row?.display_name || row?.email}</SheetTitle>
        </SheetHeader>
        {row && (
          <div className="space-y-5 mt-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="capitalize">{row.plan}</Badge>
              <Badge variant="outline">{row.sub_status}</Badge>
              <Badge variant="outline">{row.approval_status}</Badge>
              <div className="ml-auto flex gap-2">
                <Button size="sm" variant="outline" onClick={() => onImpersonate(row.user_id)} title="Gera link mágico de acesso">
                  <LogIn className="h-3.5 w-3.5 mr-1"/> Logar como
                </Button>
                <Button size="sm" variant="outline" onClick={() => onEdit(row)}>Editar plano</Button>
              </div>
            </div>
            <div className="text-xs text-muted-foreground">
              {row.email} · cadastro {new Date(row.created_at).toLocaleDateString("pt-BR")}
            </div>

            <section>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><Instagram className="h-4 w-4"/> Contas Instagram ({igAccounts.length})</h3>
              {loading ? <p className="text-xs text-muted-foreground">Carregando...</p> :
                igAccounts.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma conta.</p> :
                <div className="space-y-1">
                  {igAccounts.map((a: any) => (
                    <div key={a.id} className="text-xs flex justify-between border-b border-border/50 py-1">
                      <span>@{a.username} {!a.active && <span className="text-muted-foreground">(inativa)</span>}</span>
                      <span className="text-muted-foreground">
                        {a.token_expires_at ? `exp ${new Date(a.token_expires_at).toLocaleDateString("pt-BR")}` : "sem token"}
                      </span>
                    </div>
                  ))}
                </div>
              }
            </section>

            <section>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><Rss className="h-4 w-4"/> Fontes ({sources.length})</h3>
              {sources.length === 0 ? <p className="text-xs text-muted-foreground">Nenhuma fonte.</p> :
                <div className="space-y-1">
                  {sources.slice(0, 8).map((s: any) => (
                    <div key={s.id} className="text-xs border-b border-border/50 py-1">
                      <div className="flex justify-between">
                        <span className="font-medium">{s.name}</span>
                        {!s.active && <Badge variant="outline" className="text-[10px]">off</Badge>}
                      </div>
                      <div className="text-muted-foreground line-clamp-1">{s.url}</div>
                    </div>
                  ))}
                </div>
              }
            </section>

            <section>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><Calendar className="h-4 w-4"/> Últimos 10 posts</h3>
              {recentPosts.length === 0 ? <p className="text-xs text-muted-foreground">Nenhum post.</p> :
                <div className="space-y-1">
                  {recentPosts.map((p: any) => (
                    <div key={p.id} className="text-xs border-b border-border/50 py-1">
                      <div className="flex justify-between gap-2">
                        <span className="line-clamp-1 flex-1">{p.news_items?.rewritten_title || "—"}</span>
                        <Badge variant="outline" className="text-[10px] shrink-0">{p.status}</Badge>
                      </div>
                      <div className="text-muted-foreground text-[10px]">{p.media_type} · {new Date(p.scheduled_for).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</div>
                      {p.error_message && <div className="text-destructive line-clamp-1">{p.error_message}</div>}
                    </div>
                  ))}
                </div>
              }
            </section>

            <section>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2"><Activity className="h-4 w-4"/> Atividade</h3>
              {logs.length === 0 ? <p className="text-xs text-muted-foreground">Sem registros.</p> :
                <div className="space-y-1">
                  {logs.map((l: any) => (
                    <div key={l.id} className="text-xs border-b border-border/50 py-1">
                      <div><b>{l.action}</b> <span className="text-muted-foreground">{l.entity_type}</span></div>
                      <div className="text-muted-foreground text-[10px]">{new Date(l.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</div>
                    </div>
                  ))}
                </div>
              }
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
