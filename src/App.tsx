import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminOnlyRoute } from "@/components/AdminOnlyRoute";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { Loader2 } from "lucide-react";
import Index from "./pages/Index";
import Admin from "./pages/dashboard/Admin";

// Lazy-loaded routes (reduces initial bundle, defers Stripe SDK to /pricing only)
const DashboardLayout = lazy(() => import("@/components/DashboardLayout"));
const Auth = lazy(() => import("./pages/Auth"));
const Overview = lazy(() => import("./pages/dashboard/Overview"));
const Sources = lazy(() => import("./pages/dashboard/Sources"));
const Topics = lazy(() => import("./pages/dashboard/Topics"));
const CreatorProfile = lazy(() => import("./pages/dashboard/CreatorProfile"));
const News = lazy(() => import("./pages/dashboard/News"));
const Scheduled = lazy(() => import("./pages/dashboard/Scheduled"));
const Accounts = lazy(() => import("./pages/dashboard/Accounts"));
const Settings = lazy(() => import("./pages/dashboard/Settings"));
const AccountSettings = lazy(() => import("./pages/dashboard/AccountSettings"));
const Logs = lazy(() => import("./pages/dashboard/Logs"));
const Insights = lazy(() => import("./pages/dashboard/Insights"));
const Templates = lazy(() => import("./pages/dashboard/Templates"));
const TokenHealth = lazy(() => import("./pages/dashboard/TokenHealth"));
const MetaApiHealth = lazy(() => import("./pages/dashboard/MetaApiHealth"));
const ChannelConfig = lazy(() => import("./pages/dashboard/ChannelConfig"));
const AdminReleases = lazy(() => import("./pages/dashboard/AdminReleases"));
const Support = lazy(() => import("./pages/dashboard/Support"));
const AdminSupport = lazy(() => import("./pages/dashboard/AdminSupport"));
const Pricing = lazy(() => import("./pages/Pricing"));
const CheckoutReturn = lazy(() => import("./pages/CheckoutReturn"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacy = lazy(() => import("./pages/Privacy"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const DataDeletionStatus = lazy(() => import("./pages/DataDeletionStatus"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutos — evita refetch excessivo
      retry: 1,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <AppErrorBoundary>
          <Suspense fallback={
            <div className="flex min-h-[60vh] items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-primary" /> Carregando área...
            </div>
          }>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/data-deletion" element={<DataDeletionStatus />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/checkout/return" element={<CheckoutReturn />} />
            <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
              <Route index element={<Overview />} />
              <Route path="news" element={<News />} />
              <Route path="sources" element={<Sources />} />
              <Route path="topics" element={<AdminOnlyRoute><Topics /></AdminOnlyRoute>} />
              <Route path="creator-profile" element={<AdminOnlyRoute><CreatorProfile /></AdminOnlyRoute>} />
              <Route path="scheduled" element={<Scheduled />} />
              <Route path="accounts" element={<Accounts />} />
              <Route path="accounts/:id/settings" element={<AccountSettings />} />
              <Route path="settings" element={<Settings />} />
              <Route path="logs" element={<Logs />} />
              <Route path="insights" element={<Insights />} />
              <Route path="templates" element={<Templates />} />
              <Route path="token-health" element={<TokenHealth />} />
              <Route path="meta-api-health" element={<MetaApiHealth />} />
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
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
