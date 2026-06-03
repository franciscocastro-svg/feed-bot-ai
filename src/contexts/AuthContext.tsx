import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { ALL_ADMIN_PERMISSION_KEYS } from "@/config/adminPermissions";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  adminFullAccess: boolean;
  adminPermissions: string[];
  hasAdminPermission: (section: string) => boolean;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  user: null,
  session: null,
  loading: true,
  isAdmin: false,
  adminFullAccess: false,
  adminPermissions: [],
  hasAdminPermission: () => false,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminFullAccess, setAdminFullAccess] = useState(false);
  const [adminPermissions, setAdminPermissions] = useState<string[]>([]);

  useEffect(() => {
    // Fix: usar APENAS onAuthStateChange (evita race condition com getSession)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Fix: verificação de admin centralizada aqui (evita 3 queries duplicadas)
  useEffect(() => {
    if (!session?.user) {
      setIsAdmin(false);
      setAdminFullAccess(false);
      setAdminPermissions([]);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session.user.id)
        .eq("role", "admin")
        .maybeSingle();
      const admin = !!data;
      setIsAdmin(admin);
      if (!admin) {
        setAdminFullAccess(false);
        setAdminPermissions([]);
        return;
      }

      const { data: permissions, error } = await supabase
        .from("admin_permissions" as any)
        .select("sections, full_access")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (error) {
        setAdminFullAccess(true);
        setAdminPermissions([...ALL_ADMIN_PERMISSION_KEYS]);
        return;
      }

      const perm = permissions as { full_access?: boolean; sections?: string[] | null } | null;
      setAdminFullAccess(perm?.full_access ?? true);
      setAdminPermissions(perm?.sections || [...ALL_ADMIN_PERMISSION_KEYS]);
    })();
  }, [session?.user?.id]);

  const hasAdminPermission = (section: string) =>
    isAdmin && (adminFullAccess || adminPermissions.includes(section));

  return (
    <Ctx.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading,
        isAdmin,
        adminFullAccess,
        adminPermissions,
        hasAdminPermission,
        signOut: async () => { await supabase.auth.signOut(); },
      }}
    >
      {children}
    </Ctx.Provider>
  );
};

export const useAuth = () => useContext(Ctx);
