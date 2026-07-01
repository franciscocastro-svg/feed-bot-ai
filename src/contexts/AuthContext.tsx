import { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
  adminPermissionsLoading: boolean;
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
  adminPermissionsLoading: true,
  isAdmin: false,
  adminFullAccess: false,
  adminPermissions: [],
  hasAdminPermission: () => false,
  signOut: async () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminPermissionsLoading, setAdminPermissionsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminFullAccess, setAdminFullAccess] = useState(false);
  const [adminPermissions, setAdminPermissions] = useState<string[]>([]);
  const resolvedPermissionUserId = useRef<string | null>(null);

  useEffect(() => {
    // Fix: usar APENAS onAuthStateChange (evita race condition com getSession)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      // Authentication is ready as soon as Supabase resolves the session.
      // Regular customer routes must not wait for an admin-only query.
      setLoading(false);
      const nextUserId = s?.user?.id || null;
      if (!nextUserId) {
        resolvedPermissionUserId.current = null;
        setAdminPermissionsLoading(false);
      } else if (resolvedPermissionUserId.current !== nextUserId) {
        // Only wait when the authenticated identity actually changes. Token
        // refresh events for the same user must not restart the route loader.
        setAdminPermissionsLoading(true);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Fix: verificação de admin centralizada aqui (evita 3 queries duplicadas)
  useEffect(() => {
    if (!session?.user) {
      setIsAdmin(false);
      setAdminFullAccess(false);
      setAdminPermissions([]);
      resolvedPermissionUserId.current = null;
      setAdminPermissionsLoading(false);
      return;
    }
    let cancelled = false;
    const userId = session.user.id;

    (async () => {
      try {
        const { data, error: roleError } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId)
          .eq("role", "admin")
          .maybeSingle();
        if (cancelled) return;

        const admin = !roleError && !!data;
        setIsAdmin(admin);
        if (!admin) {
          setAdminFullAccess(false);
          setAdminPermissions([]);
          return;
        }

        const { data: permissions, error } = await supabase
          .from("admin_permissions" as any)
          .select("sections, full_access")
          .eq("user_id", userId)
          .maybeSingle();
        if (cancelled) return;

        if (error) {
          // Permission lookup must fail closed. A transient database error must
          // never turn a restricted administrator into a full-access one.
          setAdminFullAccess(false);
          setAdminPermissions([]);
          return;
        }

        const perm = permissions as { full_access?: boolean; sections?: string[] | null } | null;
        setAdminFullAccess(perm?.full_access ?? false);
        setAdminPermissions(perm?.sections || []);
      } catch {
        if (cancelled) return;
        setIsAdmin(false);
        setAdminFullAccess(false);
        setAdminPermissions([]);
      } finally {
        if (!cancelled) {
          resolvedPermissionUserId.current = userId;
          setAdminPermissionsLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [session?.user?.id]);

  const hasAdminPermission = (section: string) =>
    isAdmin && (adminFullAccess || adminPermissions.includes(section));

  return (
    <Ctx.Provider
      value={{
        user: session?.user ?? null,
        session,
        loading,
        adminPermissionsLoading,
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
