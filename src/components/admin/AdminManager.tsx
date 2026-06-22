import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Shield, ShieldOff, Plus, Settings2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { ADMIN_PERMISSION_OPTIONS, ALL_ADMIN_PERMISSION_KEYS } from "@/config/adminPermissions";
import { useAuth } from "@/contexts/AuthContext";

type AdminRole = {
  id: string;
  user_id: string;
  created_at: string;
  full_access?: boolean;
  sections?: string[];
};

type PermissionDraft = {
  userId: string;
  fullAccess: boolean;
  sections: string[];
};

export function AdminManager({ allUsers }: { allUsers: any[] }) {
  const { user } = useAuth();
  const [admins, setAdmins] = useState<AdminRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<PermissionDraft | null>(null);
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [draftFullAccess, setDraftFullAccess] = useState(true);
  const [draftSections, setDraftSections] = useState<string[]>([...ALL_ADMIN_PERMISSION_KEYS]);

  const load = async () => {
    setLoading(true);
    const [{ data: roles }, { data: permissions, error: permissionsError }] = await Promise.all([
      supabase.from("user_roles").select("id, user_id, created_at").eq("role", "admin"),
      supabase.from("admin_permissions" as any).select("user_id, sections, full_access"),
    ]);

    const permissionMap = new Map<string, { full_access: boolean; sections: string[] }>();
    if (!permissionsError) {
      (permissions || []).forEach((p: any) => {
        permissionMap.set(p.user_id, {
          full_access: p.full_access ?? false,
          sections: (p.sections as string[] | null) || [],
        });
      });
    }

    setAdmins((roles || []).map((role: any) => {
      const permission = permissionMap.get(role.user_id);
      return {
        ...role,
        full_access: permission?.full_access ?? false,
        sections: permission?.sections || [],
      };
    }));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const adminsWithProfile = useMemo(() => admins.map(a => {
    const u = allUsers.find(x => x.user_id === a.user_id);
    return { ...a, email: u?.email, display_name: u?.display_name };
  }), [admins, allUsers]);

  const selectedUser = allUsers.find(u => u.user_id === selectedUserId);

  const resetDraft = () => {
    setSelectedUserId("");
    setDraftFullAccess(true);
    setDraftSections([...ALL_ADMIN_PERMISSION_KEYS]);
    setSearch("");
  };

  const remove = async (uid: string) => {
    if (uid === user?.id) return toast.error("Você não pode remover seu próprio acesso por aqui.");
    if (!confirm("Remover privilégio de admin deste usuário?")) return;
    const { error } = await supabase.rpc("set_admin_permissions" as any, {
      _target_user_id: uid,
      _is_admin: false,
      _full_access: false,
      _sections: [],
    } as any);
    if (error) toast.error(error.message || "Erro ao remover");
    else { toast.success("Removido"); load(); }
  };

  const savePermissions = async (uid: string, fullAccess: boolean, sections: string[]) => {
    const normalizedSections = fullAccess ? [...ALL_ADMIN_PERMISSION_KEYS] : sections;
    if (!fullAccess && normalizedSections.length === 0) {
      toast.error("Escolha pelo menos uma área para este admin.");
      return false;
    }
    const { error } = await supabase.rpc("set_admin_permissions" as any, {
      _target_user_id: uid,
      _is_admin: true,
      _full_access: fullAccess,
      _sections: normalizedSections,
    } as any);
    if (error) {
      toast.error(error.message);
      return false;
    }
    return true;
  };

  const promote = async () => {
    if (!selectedUserId) return toast.error("Escolha um usuário.");
    const ok = await savePermissions(selectedUserId, draftFullAccess, draftSections);
    if (!ok) return;
    toast.success("Admin promovido com permissões");
    setAdding(false);
    resetDraft();
    load();
  };

  const openEdit = (admin: AdminRole) => {
    setEditing({
      userId: admin.user_id,
      fullAccess: admin.full_access ?? true,
      sections: admin.sections || [...ALL_ADMIN_PERMISSION_KEYS],
    });
  };

  const updateEditingSection = (section: string, checked: boolean) => {
    if (!editing) return;
    setEditing({
      ...editing,
      sections: checked
        ? Array.from(new Set([...editing.sections, section]))
        : editing.sections.filter((item) => item !== section),
    });
  };

  const updateDraftSection = (section: string, checked: boolean) => {
    setDraftSections((current) =>
      checked
        ? Array.from(new Set([...current, section]))
        : current.filter((item) => item !== section)
    );
  };

  const candidates = allUsers
    .filter(u => !admins.find(a => a.user_id === u.user_id))
    .filter(u => {
      const q = search.toLowerCase().trim();
      if (!q) return false;
      return u.email?.toLowerCase().includes(q) || (u.display_name || "").toLowerCase().includes(q);
    })
    .slice(0, 5);

  const renderPermissionPicker = (
    fullAccess: boolean,
    sections: string[],
    onFullAccess: (checked: boolean) => void,
    onSection: (section: string, checked: boolean) => void,
  ) => (
    <div className="space-y-3 rounded-lg border border-border/70 p-3">
      <label className="flex items-start gap-3 cursor-pointer">
        <Checkbox checked={fullAccess} onCheckedChange={(v) => onFullAccess(Boolean(v))} className="mt-0.5" />
        <span>
          <span className="block text-sm font-medium">Acesso total</span>
          <span className="block text-xs text-muted-foreground">Pode ver e administrar todas as áreas do painel.</span>
        </span>
      </label>
      {!fullAccess && (
        <div className="grid gap-2 sm:grid-cols-2">
          {ADMIN_PERMISSION_OPTIONS.map((option) => (
            <label key={option.key} className="flex items-start gap-2 rounded-md border border-border/50 p-2 cursor-pointer hover:bg-muted/40">
              <Checkbox checked={sections.includes(option.key)} onCheckedChange={(v) => onSection(option.key, Boolean(v))} className="mt-0.5" />
              <span>
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="block text-[11px] text-muted-foreground leading-snug">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2"><Shield className="h-4 w-4"/> Administradores ({admins.length})</span>
          <Button size="sm" onClick={() => setAdding(true)}><Plus className="h-4 w-4 mr-1"/> Promover</Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? <p className="text-sm text-muted-foreground">Carregando...</p> :
          <div className="space-y-3">
            {adminsWithProfile.map(a => (
              <div key={a.id} className="flex flex-col gap-3 rounded-lg border border-border/60 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="font-medium text-sm">{a.display_name || "—"} {a.user_id === user?.id && <Badge variant="outline" className="ml-2">Você</Badge>}</div>
                  <div className="text-xs text-muted-foreground truncate">{a.email || a.user_id}</div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {a.full_access ? (
                      <Badge className="bg-green-600 text-white border-green-600">Acesso total</Badge>
                    ) : (
                      (a.sections || []).map((section) => {
                        const option = ADMIN_PERMISSION_OPTIONS.find((item) => item.key === section);
                        return <Badge key={section} variant="outline">{option?.label || section}</Badge>;
                      })
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => openEdit(a)}>
                    <Settings2 className="h-4 w-4 mr-1"/> Permissões
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => remove(a.user_id)} disabled={a.user_id === user?.id}>
                    <ShieldOff className="h-4 w-4 mr-1"/> Remover
                  </Button>
                </div>
              </div>
            ))}
          </div>
        }
      </CardContent>

      <Dialog open={adding} onOpenChange={(open) => { setAdding(open); if (!open) resetDraft(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Promover a admin</DialogTitle>
            <DialogDescription>Escolha a pessoa e defina quais áreas do Painel Admin ela poderá ver.</DialogDescription>
          </DialogHeader>
          <Input placeholder="Buscar email ou nome..." value={search} onChange={e => setSearch(e.target.value)} />
          <div className="space-y-1 max-h-52 overflow-y-auto">
            {candidates.map(u => (
              <button key={u.user_id} onClick={() => setSelectedUserId(u.user_id)}
                className={`w-full text-left p-2 rounded transition-colors ${selectedUserId === u.user_id ? "bg-primary/10 border border-primary/40" : "hover:bg-muted border border-transparent"}`}>
                <div className="font-medium text-sm">{u.display_name || "—"}</div>
                <div className="text-xs text-muted-foreground">{u.email}</div>
              </button>
            ))}
            {search && candidates.length === 0 && <p className="text-xs text-muted-foreground p-2">Nenhum usuário encontrado.</p>}
          </div>
          {selectedUser && (
            <div className="space-y-3">
              <div className="text-sm">
                Selecionado: <span className="font-medium">{selectedUser.display_name || selectedUser.email}</span>
              </div>
              {renderPermissionPicker(draftFullAccess, draftSections, setDraftFullAccess, updateDraftSection)}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)}>Fechar</Button>
            <Button onClick={promote} disabled={!selectedUserId}>Promover com permissões</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar permissões</DialogTitle>
            <DialogDescription>Atualize o que este admin pode ver dentro do Painel Admin.</DialogDescription>
          </DialogHeader>
          {editing && renderPermissionPicker(
            editing.fullAccess,
            editing.sections,
            (checked) => setEditing({ ...editing, fullAccess: checked }),
            updateEditingSection,
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={async () => {
              if (!editing) return;
              const ok = await savePermissions(editing.userId, editing.fullAccess, editing.sections);
              if (!ok) return;
              toast.success("Permissões atualizadas");
              setEditing(null);
              load();
            }}>
              Salvar permissões
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
