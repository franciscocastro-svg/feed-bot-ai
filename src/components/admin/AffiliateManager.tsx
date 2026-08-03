import { useEffect, useMemo, useState } from "react";
import { Copy, Link2, Loader2, PauseCircle, PlayCircle, Plus, RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { normalizeAffiliateReferralCode } from "@/lib/affiliateReferrals";

type AdminUser = {
  user_id: string;
  email?: string | null;
  display_name?: string | null;
};

type AffiliateRow = {
  affiliate_id: string;
  user_id: string;
  email: string;
  display_name: string | null;
  referral_code: string;
  status: "active" | "paused";
  activated_at: string;
  registered_count: number;
  paid_active_count: number;
  not_active_count: number;
  conversion_rate: number;
  last_referral_at: string | null;
};

function friendlyAffiliateError(message: string) {
  if (message.includes("referral_code_in_use")) return "Este código de indicação já está em uso.";
  if (message.includes("invalid_referral_code")) return "Use de 6 a 32 caracteres: letras, números, hífen ou sublinhado.";
  if (message.includes("not_allowed")) return "Seu administrador não possui permissão para gerenciar afiliados.";
  return "Não foi possível salvar o afiliado.";
}

export function AffiliateManager({ allUsers }: { allUsers: AdminUser[] }) {
  const [affiliates, setAffiliates] = useState<AffiliateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [code, setCode] = useState("");
  const [notes, setNotes] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_affiliate_overview");
    if (error) {
      toast.error("Não foi possível carregar os afiliados.");
      setAffiliates([]);
    } else {
      setAffiliates((data || []) as AffiliateRow[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const affiliateUserIds = useMemo(
    () => new Set(affiliates.map((affiliate) => affiliate.user_id)),
    [affiliates],
  );

  const candidates = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    return allUsers
      .filter((user) => !affiliateUserIds.has(user.user_id))
      .filter((user) =>
        (user.email || "").toLowerCase().includes(query)
        || (user.display_name || "").toLowerCase().includes(query)
      )
      .slice(0, 6);
  }, [affiliateUserIds, allUsers, search]);

  const selectedUser = allUsers.find((user) => user.user_id === selectedUserId);

  const reset = () => {
    setSearch("");
    setSelectedUserId("");
    setCode("");
    setNotes("");
  };

  const activate = async () => {
    if (!selectedUserId) return toast.error("Escolha um cliente.");
    const normalizedCode = code.trim() ? normalizeAffiliateReferralCode(code) : null;
    if (code.trim() && !normalizedCode) {
      return toast.error("Use de 6 a 32 caracteres: letras, números, hífen ou sublinhado.");
    }

    setSavingId(selectedUserId);
    const { error } = await supabase.rpc("admin_set_affiliate", {
      _user_id: selectedUserId,
      _active: true,
      _referral_code: normalizedCode || undefined,
      _notes: notes.trim() || undefined,
    });
    setSavingId(null);
    if (error) return toast.error(friendlyAffiliateError(error.message));

    toast.success("Afiliado ativado com link exclusivo.");
    setOpen(false);
    reset();
    load();
  };

  const changeStatus = async (affiliate: AffiliateRow, active: boolean) => {
    const action = active ? "reativar" : "pausar";
    if (!confirm(`${action[0].toUpperCase()}${action.slice(1)} este afiliado?`)) return;
    setSavingId(affiliate.user_id);
    const { error } = await supabase.rpc("admin_set_affiliate", {
      _user_id: affiliate.user_id,
      _active: active,
      _referral_code: affiliate.referral_code,
      _notes: undefined,
    });
    setSavingId(null);
    if (error) return toast.error(friendlyAffiliateError(error.message));
    toast.success(active ? "Afiliado reativado." : "Afiliado pausado. Novos cadastros não serão atribuídos.");
    load();
  };

  const copyLink = async (referralCode: string) => {
    const link = `${window.location.origin}/auth?ref=${encodeURIComponent(referralCode)}`;
    await navigator.clipboard.writeText(link);
    toast.success("Link copiado.");
  };

  const totals = useMemo(() => ({
    active: affiliates.filter((affiliate) => affiliate.status === "active").length,
    registrations: affiliates.reduce((sum, affiliate) => sum + Number(affiliate.registered_count || 0), 0),
    paid: affiliates.reduce((sum, affiliate) => sum + Number(affiliate.paid_active_count || 0), 0),
  }), [affiliates]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Programa de afiliados</h2>
          <p className="text-sm text-muted-foreground">Ative clientes, copie os links e acompanhe cadastros e conversão.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
          <Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" /> Ativar afiliado</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="p-4"><div className="text-2xl font-bold">{totals.active}</div><div className="text-xs text-muted-foreground">Afiliados ativos</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-bold">{totals.registrations}</div><div className="text-xs text-muted-foreground">Cadastros atribuídos</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-2xl font-bold">{totals.paid}</div><div className="text-xs text-muted-foreground">Clientes pagos ativos</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="h-4 w-4" /> Afiliados ({affiliates.length})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-sm">
            <thead className="border-b text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2">Cliente</th><th className="p-2">Código</th><th className="p-2">Status</th>
                <th className="p-2 text-center">Cadastros</th><th className="p-2 text-center">Pagos ativos</th>
                <th className="p-2 text-center">Conversão</th><th className="p-2">Último cadastro</th><th className="p-2 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {affiliates.map((affiliate) => (
                <tr key={affiliate.affiliate_id} className="border-b hover:bg-muted/30">
                  <td className="p-2"><div className="font-medium">{affiliate.display_name || "—"}</div><div className="text-xs text-muted-foreground">{affiliate.email}</div></td>
                  <td className="p-2 font-mono text-xs">{affiliate.referral_code}</td>
                  <td className="p-2"><Badge className={affiliate.status === "active" ? "bg-emerald-600" : "bg-muted text-muted-foreground"}>{affiliate.status === "active" ? "Ativo" : "Pausado"}</Badge></td>
                  <td className="p-2 text-center font-medium">{affiliate.registered_count}</td>
                  <td className="p-2 text-center text-emerald-500">{affiliate.paid_active_count}</td>
                  <td className="p-2 text-center">{Number(affiliate.conversion_rate || 0).toFixed(1)}%</td>
                  <td className="p-2 text-xs text-muted-foreground">{affiliate.last_referral_at ? new Date(affiliate.last_referral_at).toLocaleDateString("pt-BR") : "—"}</td>
                  <td className="p-2"><div className="flex justify-end gap-1">
                    <Button variant="outline" size="sm" onClick={() => copyLink(affiliate.referral_code)}><Copy className="h-3.5 w-3.5" /></Button>
                    <Button variant="outline" size="sm" disabled={savingId === affiliate.user_id} onClick={() => changeStatus(affiliate, affiliate.status !== "active")}>
                      {savingId === affiliate.user_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : affiliate.status === "active" ? <PauseCircle className="h-3.5 w-3.5" /> : <PlayCircle className="h-3.5 w-3.5" />}
                    </Button>
                  </div></td>
                </tr>
              ))}
              {!affiliates.length && !loading && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Nenhum afiliado habilitado.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) reset(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ativar cliente como afiliado</DialogTitle>
            <DialogDescription>O menu “Indicações” aparecerá somente para este cliente. Nenhum plano ou pagamento será alterado.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Buscar cliente</label>
              <Input value={search} onChange={(event) => { setSearch(event.target.value); setSelectedUserId(""); }} placeholder="Nome ou e-mail" />
              {search && !selectedUserId && <div className="mt-2 overflow-hidden rounded-md border">
                {candidates.map((user) => <button key={user.user_id} type="button" onClick={() => { setSelectedUserId(user.user_id); setSearch(user.email || user.display_name || "Cliente"); }} className="block w-full border-b px-3 py-2 text-left text-sm last:border-0 hover:bg-muted"><span className="block font-medium">{user.display_name || "—"}</span><span className="text-xs text-muted-foreground">{user.email}</span></button>)}
                {!candidates.length && <div className="px-3 py-2 text-xs text-muted-foreground">Nenhum cliente disponível.</div>}
              </div>}
              {selectedUser && <div className="mt-2 text-xs text-emerald-500">Selecionado: {selectedUser.display_name || selectedUser.email}</div>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Código personalizado (opcional)</label>
              <Input value={code} onChange={(event) => setCode(event.target.value.toLowerCase())} placeholder="Deixe vazio para gerar automaticamente" maxLength={32} />
              <p className="mt-1 text-xs text-muted-foreground">6 a 32 caracteres: letras, números, hífen ou sublinhado.</p>
            </div>
            <div><label className="mb-1 block text-sm font-medium">Observação interna (opcional)</label><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={activate} disabled={!selectedUserId || savingId === selectedUserId}>
              {savingId === selectedUserId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />} Ativar e gerar link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
