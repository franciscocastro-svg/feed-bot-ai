import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, ShieldOff, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export function AdminManager({ allUsers }: { allUsers: any[] }) {
  const [admins, setAdmins] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("user_roles").select("id, user_id, created_at").eq("role", "admin");
    setAdmins(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const adminsWithProfile = admins.map(a => {
    const u = allUsers.find(x => x.user_id === a.user_id);
    return { ...a, email: u?.email, display_name: u?.display_name };
  });

  const remove = async (uid: string) => {
    if (!confirm("Remover privilégio de admin deste usuário?")) return;
    const { error } = await supabase.from("user_roles").delete().eq("user_id", uid).eq("role", "admin");
    if (error) toast.error(error.message);
    else { toast.success("Removido"); load(); }
  };

  const promote = async (uid: string) => {
    const { error } = await supabase.from("user_roles").insert({ user_id: uid, role: "admin" });
    if (error) toast.error(error.message);
    else { toast.success("Promovido"); setAdding(false); setSearch(""); load(); }
  };

  const candidates = allUsers
    .filter(u => !admins.find(a => a.user_id === u.user_id))
    .filter(u => {
      const q = search.toLowerCase().trim();
      if (!q) return false;
      return u.email?.toLowerCase().includes(q) || (u.display_name || "").toLowerCase().includes(q);
    })
    .slice(0, 5);

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
          <div className="space-y-2">
            {adminsWithProfile.map(a => (
              <div key={a.id} className="flex items-center justify-between border-b border-border/50 pb-2">
                <div>
                  <div className="font-medium text-sm">{a.display_name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{a.email || a.user_id}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => remove(a.user_id)}>
                  <ShieldOff className="h-4 w-4 mr-1"/> Remover
                </Button>
              </div>
            ))}
          </div>
        }
      </CardContent>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader><DialogTitle>Promover a admin</DialogTitle></DialogHeader>
          <Input placeholder="Buscar email ou nome..." value={search} onChange={e => setSearch(e.target.value)} />
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {candidates.map(u => (
              <button key={u.user_id} onClick={() => promote(u.user_id)}
                className="w-full text-left p-2 rounded hover:bg-muted transition-colors">
                <div className="font-medium text-sm">{u.display_name || "—"}</div>
                <div className="text-xs text-muted-foreground">{u.email}</div>
              </button>
            ))}
            {search && candidates.length === 0 && <p className="text-xs text-muted-foreground p-2">Nenhum usuário encontrado.</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
