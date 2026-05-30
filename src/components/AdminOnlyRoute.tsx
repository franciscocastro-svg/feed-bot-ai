import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Lock } from "lucide-react";
import { isPathVisible } from "@/config/featureFlags";

/**
 * Gate para features em rollout gradual.
 * isAdmin agora vem do AuthContext centralizado — sem query duplicada.
 */
export function AdminOnlyRoute({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const isAdminArea = location.pathname.startsWith("/dashboard/admin");
  const allowed = !!user && (
    isAdminArea
      ? isAdmin
      : isPathVisible(location.pathname, { isAdmin, userId: user.id })
  );

  if (!allowed) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center space-y-3 p-6 rounded-lg border border-border/60 bg-card">
        <Lock className="h-10 w-10 mx-auto text-muted-foreground" />
        <h2 className="text-xl font-semibold">Em breve</h2>
        <p className="text-sm text-muted-foreground">
          Esta funcionalidade está em fase de testes e ainda não foi liberada para sua conta.
          Vamos disponibilizar em breve.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
