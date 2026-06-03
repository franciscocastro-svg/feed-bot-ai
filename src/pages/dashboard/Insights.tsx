import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { RefreshCw, Eye, Heart, MessageCircle, Bookmark, TrendingUp, Film, Image as ImageIcon, ExternalLink, Users, ArrowUp, ArrowDown, Instagram } from "lucide-react";

type Post = {
  id: string;
  posted_at: string | null;
  ig_media_id: string | null;
  permalink: string | null;
  media_type: string;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saves: number | null;
  impressions: number | null;
  insights_updated_at: string | null;
  instagram_account_id: string | null;
  news_items?: { rewritten_title: string | null; original_title: string; generated_image_url: string | null; generated_cover_url: string | null } | null;
};

const fmt = (n: number | null) => (n == null ? "—" : n.toLocaleString("pt-BR"));

type AccountFollowers = {
  account_id: string;
  username: string;
  current: number;
  previous_24h: number | null;
  first_ever: number | null;
  captured_at: string | null;
  history: { captured_at: string; followers_count: number }[];
};

const INSIGHTS_POST_LIMIT = 300;
const FOLLOWER_HISTORY_PER_ACCOUNT = 60;

export default function Insights() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [followers, setFollowers] = useState<AccountFollowers[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<string>("all");

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("scheduled_posts")
      .select("id, posted_at, ig_media_id, permalink, media_type, reach, likes, comments, saves, impressions, insights_updated_at, instagram_account_id, news_items(rewritten_title, original_title, generated_image_url, generated_cover_url)")
      .eq("status", "posted")
      .not("ig_media_id", "is", null)
      .order("posted_at", { ascending: false })
      .limit(INSIGHTS_POST_LIMIT);
    setPosts((data as any) || []);

    // Followers per IG account
    const { data: accs } = await supabase
      .from("instagram_accounts")
      .select("id, username")
      .eq("active", true);
    const accountIds = (accs || []).map((a) => a.id);
    const { data: allSnaps } = accountIds.length
      ? await supabase
        .from("follower_snapshots")
        .select("instagram_account_id, captured_at, followers_count")
        .in("instagram_account_id", accountIds)
        .order("captured_at", { ascending: false })
        .limit(Math.max(FOLLOWER_HISTORY_PER_ACCOUNT, accountIds.length * FOLLOWER_HISTORY_PER_ACCOUNT))
      : { data: [] };

    const snapsByAccount = new Map<string, { captured_at: string; followers_count: number }[]>();
    for (const snap of (allSnaps || []) as { instagram_account_id: string; captured_at: string; followers_count: number }[]) {
      const list = snapsByAccount.get(snap.instagram_account_id) || [];
      if (list.length < FOLLOWER_HISTORY_PER_ACCOUNT) {
        list.push({ captured_at: snap.captured_at, followers_count: snap.followers_count });
        snapsByAccount.set(snap.instagram_account_id, list);
      }
    }

    const accList: AccountFollowers[] = [];
    for (const a of accs || []) {
      const arr = snapsByAccount.get(a.id) || [];
      const current = arr[0]?.followers_count ?? 0;
      const dayAgo = Date.now() - 24 * 3600 * 1000;
      const prev = arr.find((s) => new Date(s.captured_at).getTime() <= dayAgo)?.followers_count ?? null;
      const first = arr[arr.length - 1]?.followers_count ?? null;
      accList.push({
        account_id: a.id, username: a.username,
        current, previous_24h: prev, first_ever: first,
        captured_at: arr[0]?.captured_at || null,
        history: arr.slice().reverse(),
      });
    }
    setFollowers(accList);
    setLoading(false);
  }

  async function refresh() {
    setRefreshing(true);
    try {
      const { error } = await supabase.functions.invoke("fetch-insights", { body: {} });
      if (error) throw error;
      toast.success("Métricas atualizadas");
      await load();
    } catch (e: any) {
      toast.error(e.message || "Erro ao atualizar");
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
    // auto-refresh silencioso a cada 60s enquanto a página estiver aberta
    const iv = setInterval(() => { load(); }, 60_000);
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  const filteredPosts = useMemo(
    () => selectedAccount === "all" ? posts : posts.filter(p => p.instagram_account_id === selectedAccount),
    [posts, selectedAccount]
  );
  const filteredFollowers = useMemo(
    () => selectedAccount === "all" ? followers : followers.filter(f => f.account_id === selectedAccount),
    [followers, selectedAccount]
  );

  const totals = filteredPosts.reduce(
    (a, p) => ({
      reach: a.reach + (p.reach || 0),
      likes: a.likes + (p.likes || 0),
      comments: a.comments + (p.comments || 0),
      saves: a.saves + (p.saves || 0),
    }),
    { reach: 0, likes: 0, comments: 0, saves: 0 },
  );

  const groupStats = (type: "reel" | "feed") => {
    const arr = filteredPosts.filter(p => (p.media_type || "feed").toLowerCase() === type);
    const sum = arr.reduce((a, p) => ({
      reach: a.reach + (p.reach || 0), likes: a.likes + (p.likes || 0),
      comments: a.comments + (p.comments || 0), saves: a.saves + (p.saves || 0),
    }), { reach: 0, likes: 0, comments: 0, saves: 0 });
    const c = Math.max(1, arr.length);
    return {
      count: arr.length, reach: sum.reach, likes: sum.likes, comments: sum.comments, saves: sum.saves,
      avgReach: Math.round(sum.reach / c), avgLikes: Math.round(sum.likes / c),
      engagement: sum.reach > 0 ? +(((sum.likes + sum.comments + sum.saves) / sum.reach) * 100).toFixed(1) : 0,
    };
  };
  const reelStats = groupStats("reel");
  const feedStats = groupStats("feed");
  const winner: "reel" | "feed" | null = reelStats.avgReach > feedStats.avgReach ? "reel" : feedStats.avgReach > 0 ? "feed" : null;

  const topPosts = [...filteredPosts].sort((a, b) => (b.reach || 0) - (a.reach || 0)).filter(p => (p.reach || 0) > 0).slice(0, 5);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold">Insights do Instagram</h1>
          <p className="text-sm text-muted-foreground">Alcance, curtidas, comentários e salvamentos por post</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {followers.length > 1 && (
            <Select value={selectedAccount} onValueChange={setSelectedAccount}>
              <SelectTrigger className="w-[220px]">
                <Instagram className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as contas</SelectItem>
                {followers.map(f => (
                  <SelectItem key={f.account_id} value={f.account_id}>@{f.username}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Atualizar métricas
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Alcance total", value: totals.reach, icon: Eye },
          { label: "Curtidas", value: totals.likes, icon: Heart },
          { label: "Comentários", value: totals.comments, icon: MessageCircle },
          { label: "Salvamentos", value: totals.saves, icon: Bookmark },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{s.label}</span>
                <s.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="text-2xl font-bold mt-2">{fmt(s.value)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Seguidores por conta */}
      {filteredFollowers.length > 0 && (
        <div className="grid md:grid-cols-2 gap-4">
          {filteredFollowers.map((f) => {
            const delta24 = f.previous_24h != null ? f.current - f.previous_24h : null;
            const deltaTotal = f.first_ever != null ? f.current - f.first_ever : null;
            return (
              <Card key={f.account_id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4" /> @{f.username}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-end gap-3">
                    <div className="text-3xl font-bold tabular-nums">{fmt(f.current)}</div>
                    <span className="text-xs text-muted-foreground mb-1">seguidores</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <DeltaBadge label="Últimas 24h" value={delta24} />
                    <DeltaBadge label="Desde o início" value={deltaTotal} />
                  </div>
                  {f.captured_at && (
                    <p className="text-[10px] text-muted-foreground">
                      Última leitura: {new Date(f.captured_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Reels vs Feed comparison */}
      <div className="grid md:grid-cols-2 gap-4">
        <FormatCard title="Reels" icon={Film} stats={reelStats} highlight={winner === "reel"} emptyMsg="Nenhum Reel publicado ainda." />
        <FormatCard title="Feed" icon={ImageIcon} stats={feedStats} highlight={winner === "feed"} emptyMsg="Nenhum post de Feed publicado ainda." />
      </div>

      {winner === "reel" && reelStats.count >= 1 && feedStats.count >= 1 && (
        <Card className="bg-primary/5 border-primary/30">
          <CardContent className="p-4 text-sm">
            🎬 <strong>Reels estão performando {Math.round((reelStats.avgReach / Math.max(1, feedStats.avgReach)) * 100 - 100)}% melhor</strong> em alcance médio. Continue priorizando Reels para ganhar seguidores.
          </CardContent>
        </Card>
      )}

      {topPosts.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Top 5 posts de maior alcance</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {topPosts.map((p, i) => (
              <div key={p.id} className="flex gap-4 items-center">
                <div className="w-6 text-center font-bold text-muted-foreground tabular-nums">{i + 1}</div>
                {(p.news_items?.generated_cover_url || p.news_items?.generated_image_url) && (
                  <img src={p.news_items.generated_cover_url || p.news_items.generated_image_url || ""} alt="" loading="lazy" decoding="async" className="w-16 h-16 rounded object-cover" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{p.news_items?.rewritten_title || p.news_items?.original_title}</p>
                  <p className="text-sm text-muted-foreground">Alcance: {fmt(p.reach)} · Curtidas: {fmt(p.likes)} · Salvamentos: {fmt(p.saves)}</p>
                </div>
                {p.permalink && (
                  <a href={p.permalink} target="_blank" rel="noreferrer" className="text-xs text-primary underline shrink-0">Ver</a>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Histórico de posts</CardTitle></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
          ) : filteredPosts.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">Nenhum post publicado ainda.</div>
          ) : (
            <div className="divide-y divide-border">
              {filteredPosts.map((p) => {
                const isReel = (p.media_type || "").toLowerCase() === "reel";
                const eng = p.reach && p.reach > 0 ? +(((((p.likes||0)+(p.comments||0)+(p.saves||0))/p.reach)*100).toFixed(1)) : null;
                return (
                <div key={p.id} className="p-4 flex items-center gap-4">
                  {(p.news_items?.generated_cover_url || p.news_items?.generated_image_url) ? (
                    <img src={p.news_items.generated_cover_url || p.news_items.generated_image_url || ""} alt="" loading="lazy" decoding="async" className="w-14 h-14 rounded object-cover shrink-0" />
                  ) : (
                    <div className="w-14 h-14 rounded bg-secondary shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{p.news_items?.rewritten_title || p.news_items?.original_title || "—"}</p>
                      <Badge variant={isReel ? "default" : "secondary"} className="text-[10px] uppercase gap-1">
                        {isReel ? <Film className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />} {p.media_type}
                      </Badge>
                      {eng != null && <Badge variant="outline" className="text-[10px]">{eng}% eng.</Badge>}
                      {p.permalink && <a href={p.permalink} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-primary"><ExternalLink className="h-3 w-3" /></a>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {p.posted_at ? new Date(p.posted_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—"}
                    </p>
                  </div>
                  <div className="hidden md:flex gap-6 text-sm">
                    <Stat icon={Eye} label="Alcance" value={p.reach} />
                    <Stat icon={Heart} label="Curtidas" value={p.likes} />
                    <Stat icon={MessageCircle} label="Coment." value={p.comments} />
                    <Stat icon={Bookmark} label="Salvos" value={p.saves} />
                  </div>
                </div>
              );})}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: any; label: string; value: number | null }) {
  return (
    <div className="flex flex-col items-end">
      <div className="flex items-center gap-1 text-xs text-muted-foreground"><Icon className="h-3 w-3" /> {label}</div>
      <div className="font-semibold tabular-nums">{fmt(value)}</div>
    </div>
  );
}

function FormatCard({ title, icon: Icon, stats, highlight, emptyMsg }: { title: string; icon: any; stats: any; highlight: boolean; emptyMsg: string }) {
  return (
    <Card className={highlight ? "border-primary/60 bg-primary/5" : ""}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className="h-4 w-4" /> {title}
          {highlight && <Badge className="ml-auto">Melhor formato</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {stats.count === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMsg}</p>
        ) : (
          <>
            <div className="text-xs text-muted-foreground">{stats.count} publicado(s)</div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><div className="text-xs text-muted-foreground">Alcance médio</div><div className="font-bold text-lg tabular-nums">{fmt(stats.avgReach)}</div></div>
              <div><div className="text-xs text-muted-foreground">Curtidas média</div><div className="font-bold text-lg tabular-nums">{fmt(stats.avgLikes)}</div></div>
              <div><div className="text-xs text-muted-foreground">Engajamento</div><div className="font-bold text-lg tabular-nums">{stats.engagement}%</div></div>
              <div><div className="text-xs text-muted-foreground">Alcance total</div><div className="font-bold text-lg tabular-nums">{fmt(stats.reach)}</div></div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DeltaBadge({ label, value }: { label: string; value: number | null }) {
  const positive = (value ?? 0) > 0;
  const negative = (value ?? 0) < 0;
  const Icon = positive ? ArrowUp : negative ? ArrowDown : null;
  const cls = positive ? "text-emerald-500" : negative ? "text-rose-500" : "text-muted-foreground";
  return (
    <div className="rounded-md border border-border/60 p-2">
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`flex items-center gap-1 font-semibold tabular-nums ${cls}`}>
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {value == null ? "—" : `${value > 0 ? "+" : ""}${value.toLocaleString("pt-BR")}`}
      </div>
    </div>
  );
}
