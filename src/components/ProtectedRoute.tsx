import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Clock, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  const [approval, setApproval] = useState<"loading" | "approved" | "pending" | "rejected">("loading");
  const { signOut } = useAuth();

  useEffect(() => {
    if (!user) return;
    (async () => {
      // Usa isAdmin do contexto em vez de query duplicada
      const { data: roleData } = await supabase
        .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      if (roleData) { setApproval("approved"); return; }
      const { data } = await supabase
        .from("user_subscriptions").select("approval_status").eq("user_id", user.id).maybeSingle();
      const s = data?.approval_status || "pending";
      setApproval(s === "approved" ? "approved" : s === "rejected" ? "rejected" : "pending");
    })();
  }, [user]);

  if (loading || (user && approval === "loading"))
    return <div className="flex h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!user) return <Navigate to="/auth" replace />;

  if (approval !== "approved") {
    const isRejected = approval === "rejected";
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="max-w-md text-center space-y-4">
          {isRejected ? (
            <XCircle className="h-16 w-16 text-destructive mx-auto" />
          ) : (
            <Clock className="h-16 w-16 text-orange-500 mx-auto" />
          )}
          <h1 className="text-2xl font-bold">
            {isRejected ? "Acesso negado" : "Aguardando aprovação"}
          </h1>
          <p className="text-muted-foreground">
            {isRejected
              ? "Seu cadastro foi rejeitado pelo administrador. Entre em contato para mais informações."
              : "Seu cadastro foi recebido e está aguardando aprovação manual do administrador. Você receberá acesso assim que for liberado."}
          </p>
          <p className="text-sm text-muted-foreground">{user.email}</p>
          <Button variant="outline" onClick={() => signOut()}>Sair</Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};
