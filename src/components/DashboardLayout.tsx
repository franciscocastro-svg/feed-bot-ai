import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { LayoutDashboard, Newspaper, Rss, Instagram, Calendar, Settings, ScrollText, LogOut, BarChart3, Palette, Menu, Shield, Image as ImageIcon, Camera, Film, CreditCard, LifeBuoy, BookOpen, UserCircle2 } from "lucide-react";
import { ReleaseNotesBell } from "@/components/ReleaseNotes";
import { PlanUsageCard } from "@/components/PlanUsageCard";
import { PaymentTestModeBanner } from "@/components/PaymentTestModeBanner";
import { cn } from "@/lib/utils";
import { useReelVideoGenerator } from "@/hooks/useReelVideoGenerator";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TutorialModal, shouldAutoShowTutorial, incrementTutorialView } from "@/components/TutorialModal";
// isAdmin agora vem do AuthContext — sem query duplicada
import { isPathVisible } from "@/config/featureFlags";

const nav = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Visão geral" },
  { to: "/dashboard/news", icon: Newspaper, label: "Notícias" },
  { to: "/dashboard/scheduled", icon: Calendar, label: "Agendados" },
  { to: "/dashboard/sources", icon: Rss, label: "Fontes" },
  { to: "/dashboard/topics", icon: BookOpen, label: "Pautas" },
  { to: "/dashboard/creator-profile", icon: UserCircle2, label: "Perfil de Criador" },
  { to: "/dashboard/templates", icon: Palette, label: "Templates" },
  { to: "/dashboard/channels/feed", icon: ImageIcon, label: "Feed" },
  { to: "/dashboard/channels/story", icon: Camera, label: "Stories" },
  { to: "/dashboard/channels/reel", icon: Film, label: "Reels" },
  { to: "/dashboard/insights", icon: BarChart3, label: "Insights" },
  { to: "/dashboard/accounts", icon: Instagram, label: "Contas IG" },
  { to: "/dashboard/logs", icon: ScrollText, label: "Atividade" },
  { to: "/dashboard/settings", icon: Settings, label: "Configurações" },
  { to: "/dashboard/support", icon: LifeBuoy, label: "Suporte" },
  { to: "/pricing", icon: CreditCard, label: "Planos" },
];

function SidebarContent({ onNavigate, user, onSignOut, isAdmin, adminUnread }: { onNavigate?: () => void; user: any; onSignOut: () => void; isAdmin: boolean; adminUnread: number }) {
  // Esconde itens em rollout gradual de quem não é admin (ver src/config/featureFlags.ts)
  const visibleNav = nav.filter(item => isPathVisible(item.to, { isAdmin, userId: user?.id }));
  const items = isAdmin
    ? [...visibleNav, { to: "/dashboard/admin", icon: Shield, label: "Painel Admin", badge: adminUnread }]
    : visibleNav;
  return (
    <div className="flex flex-col h-full bg-sidebar">
      <div className="p-6 border-b border-border flex items-center justify-between gap-2">
        <NavLink to="/dashboard" onClick={onNavigate} className="flex items-center gap-2 min-w-0">
          <img src="/favicon.png" alt="NewsFlow logo" className="h-9 w-9 rounded-xl object-contain shadow-glow" />
          <span className="font-display font-bold text-lg truncate">NewsFlow</span>
        </NavLink>
        <ReleaseNotesBell />
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {items.map((item: any) => (
          <NavLink key={item.to} to={item.to} end={item.to === "/dashboard"} onClick={onNavigate}
            className={({ isActive }) => cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              isActive ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
            )}>
            <item.icon className="h-4 w-4" />
            <span className="flex-1">{item.label}</span>
            {item.badge > 0 && (
              <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold">
                {item.badge > 99 ? "99+" : item.badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="p-3 border-t border-border space-y-2">
        <PlanUsageCard />
        <div className="px-3 py-2 text-xs text-muted-foreground truncate">{user?.email}</div>
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={onSignOut}>
          <LogOut className="h-4 w-4 mr-2" /> Sair
        </Button>
      </div>
    </div>
  );
}

// Plays a short beep using Web Audio API (no asset needed)
function playSupportBeep() {
  try {
    const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.15);
    g.gain.setValueAtTime(0.001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.4);
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch {}
}

export default function DashboardLayout() {
  // isAdmin agora vem do AuthContext — sem query duplicada
  const { user, signOut, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [adminUnread, setAdminUnread] = useState(0);
  const [tutorialOpen, setTutorialOpen] = useState(false);
  useReelVideoGenerator();

  // Polling-based unread support tickets counter for admins (Realtime removed for security)
  useEffect(() => {
    if (!isAdmin) { setAdminUnread(0); return; }
    let prev = 0;
    let stopped = false;
    const refresh = async (notify = false) => {
      const { count } = await supabase
        .from("support_tickets")
        .select("id", { count: "exact", head: true })
        .eq("unread_for_admin", true);
      if (stopped) return;
      const next = count ?? 0;
      if (notify && next > prev) playSupportBeep();
      prev = next;
      setAdminUnread(next);
    };
    refresh(false);
    const id = setInterval(() => refresh(true), 15000);
    return () => { stopped = true; clearInterval(id); };
  }, [isAdmin]);


  useEffect(() => {
    if (!user) return;
    if (shouldAutoShowTutorial()) {
      const t = setTimeout(() => {
        setTutorialOpen(true);
        incrementTutorialView();
      }, 800);
      return () => clearTimeout(t);
    }
  }, [user]);

  const handleSignOut = async () => { await signOut(); navigate("/"); };

  return (
    <div className="min-h-screen flex w-full">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 border-r border-border flex-col">
        <SidebarContent user={user} onSignOut={handleSignOut} isAdmin={isAdmin} adminUnread={adminUnread} />
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <PaymentTestModeBanner />
        {/* Mobile top bar */}
        <header
          className="md:hidden flex items-center justify-between p-3 border-b border-border bg-sidebar sticky top-0 z-40"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.75rem)" }}
        >
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72">
              <SidebarContent user={user} onSignOut={handleSignOut} isAdmin={isAdmin} adminUnread={adminUnread} onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <NavLink to="/dashboard" className="flex items-center gap-2">
            <img src="/favicon.png" alt="NewsFlow logo" className="h-7 w-7 rounded-lg object-contain shadow-glow" />
            <span className="font-display font-bold">NewsFlow</span>
          </NavLink>
          <ReleaseNotesBell />
        </header>

        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      <TutorialModal open={tutorialOpen} onOpenChange={setTutorialOpen} />
    </div>
  );
}
