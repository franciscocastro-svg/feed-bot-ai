import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider, useLanguage } from "@/contexts/LanguageContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminOnlyRoute } from "@/components/AdminOnlyRoute";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { AnalyticsConsentBanner } from "@/components/AnalyticsConsentBanner";
import { AnalyticsTracker } from "@/components/AnalyticsTracker";
import { Loader2 } from "lucide-react";
import Index from "./pages/Index";
import Admin from "./pages/dashboard/Admin";

function lazyRoute<T extends { default: React.ComponentType<Record<string, never>> }>(factory: () => Promise<T>) {
  return lazy(() =>
    factory().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      const isChunkLoadError = /Failed to fetch dynamically imported module|Loading chunk|Importing a module script failed/i.test(message);

      if (isChunkLoadError && !sessionStorage.getItem("ff_chunk_reload")) {
        sessionStorage.setItem("ff_chunk_reload", "1");
        window.location.reload();
      }

      throw error;
    })
  );
}

// Lazy-loaded routes (reduces initial bundle, defers Stripe SDK to /pricing only)
const DashboardLayout = lazyRoute(() => import("@/components/DashboardLayout"));
const Auth = lazyRoute(() => import("./pages/Auth"));
const Overview = lazyRoute(() => import("./pages/dashboard/Overview"));
const Sources = lazyRoute(() => import("./pages/dashboard/Sources"));
const Topics = lazyRoute(() => import("./pages/dashboard/Topics"));
const CreatorProfile = lazyRoute(() => import("./pages/dashboard/CreatorProfile"));
const News = lazyRoute(() => import("./pages/dashboard/News"));
const Scheduled = lazyRoute(() => import("./pages/dashboard/Scheduled"));
const Accounts = lazyRoute(() => import("./pages/dashboard/Accounts"));
const Settings = lazyRoute(() => import("./pages/dashboard/Settings"));
const AccountSettings = lazyRoute(() => import("./pages/dashboard/AccountSettings"));
const Logs = lazyRoute(() => import("./pages/dashboard/Logs"));
const Insights = lazyRoute(() => import("./pages/dashboard/Insights"));
const Templates = lazyRoute(() => import("./pages/dashboard/Templates"));
const Cuts = lazyRoute(() => import("./pages/dashboard/Cuts"));
const TokenHealth = lazyRoute(() => import("./pages/dashboard/TokenHealth"));
const MetaApiHealth = lazyRoute(() => import("./pages/dashboard/MetaApiHealth"));
const ChannelConfig = lazyRoute(() => import("./pages/dashboard/ChannelConfig"));
const AdminReleases = lazyRoute(() => import("./pages/dashboard/AdminReleases"));
const Support = lazyRoute(() => import("./pages/dashboard/Support"));
const AdminSupport = lazyRoute(() => import("./pages/dashboard/AdminSupport"));
const Pricing = lazyRoute(() => import("./pages/Pricing"));
const CheckoutReturn = lazyRoute(() => import("./pages/CheckoutReturn"));
const Terms = lazyRoute(() => import("./pages/Terms"));
const Privacy = lazyRoute(() => import("./pages/Privacy"));
const ForgotPassword = lazyRoute(() => import("./pages/ForgotPassword"));
const VerifyEmail = lazyRoute(() => import("./pages/VerifyEmail"));
const ResetPassword = lazyRoute(() => import("./pages/ResetPassword"));
const DataDeletionStatus = lazyRoute(() => import("./pages/DataDeletionStatus"));
const NotFound = lazyRoute(() => import("./pages/NotFound"));
const OAuthConsent = lazyRoute(() => import("./pages/OAuthConsent"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutos — evita refetch excessivo
      retry: 1,
    },
  },
});

function AppRoutes() {
  const { t } = useLanguage();
  return (
    <BrowserRouter>
      <AuthProvider>
        <AnalyticsTracker />
        <AnalyticsConsentBanner />
        <AppErrorBoundary>
        <Suspense fallback={
          <div className="flex min-h-[60vh] items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" /> {t("Carregando área...")}
          </div>
        }>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/verify-email" element={<VerifyEmail />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/data-deletion" element={<DataDeletionStatus />} />
          <Route path="/pricing" element={<Pricing />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/checkout/return" element={<CheckoutReturn />} />
          <Route path="/.lovable/oauth/consent" element={<OAuthConsent />} />
          <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
            <Route index element={<Overview />} />
            <Route path="news" element={<News />} />
            <Route path="sources" element={<Sources />} />
            <Route path="topics" element={<Topics />} />
            <Route path="creator-profile" element={<CreatorProfile />} />
            <Route path="scheduled" element={<Scheduled />} />
            <Route path="accounts" element={<Accounts />} />
            <Route path="accounts/:id/settings" element={<AccountSettings />} />
            <Route path="settings" element={<Settings />} />
            <Route path="logs" element={<Logs />} />
            <Route path="insights" element={<Insights />} />
            <Route path="templates" element={<Templates />} />
            <Route path="cortes" element={<Cuts />} />
            <Route path="token-health" element={<AdminOnlyRoute permission="tokens"><TokenHealth /></AdminOnlyRoute>} />
            <Route path="meta-api-health" element={<AdminOnlyRoute permission="meta"><MetaApiHealth /></AdminOnlyRoute>} />
            <Route path="channels/:channel" element={<ChannelConfig />} />
            <Route path="admin" element={<AdminOnlyRoute><Admin /></AdminOnlyRoute>} />
            <Route path="admin/releases" element={<AdminOnlyRoute permission="releases"><AdminReleases /></AdminOnlyRoute>} />
            <Route path="support" element={<Support />} />
            <Route path="admin/support" element={<AdminOnlyRoute permission="support"><AdminSupport /></AdminOnlyRoute>} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Suspense>
        </AppErrorBoundary>
      </AuthProvider>
    </BrowserRouter>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <AppRoutes />
      </TooltipProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;
