import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Instagram, Trash2, Pencil, ShieldCheck, Loader2, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Settings as SettingsIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { UpgradeModal } from "@/components/UpgradeModal";

const empty = { username: "", ig_user_id: "", page_id: "", access_token: "", niche: "" };

const Check = ({ ok, label }: { ok: boolean; label: string }) => (
  <li className="flex items-center gap-2">
    {ok ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <XCircle className="h-3.5 w-3.5 text-destructive" />}
    <span>{label}</span>
  </li>
);

export default function Accounts() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [results, setResults] = useState<Record<string, any>>({});
  const [upgrade, setUpgrade] = useState<{ open: boolean; used?: number; limit?: number }>({ open: false });

  const load = async () => {
    const { data } = await supabase.from("instagram_accounts").select("*").order("created_at", { ascending: false });
    setAccounts(data || []);
  };
  useEffect(() => {
    load();
    // Handle OAuth return params
    const url = new URL(window.location.href);
    const ig = url.searchParams.get("ig");
    if (ig === "connected") {
      toast.success(`Conta @${url.searchParams.get("u") || ""} conectada com sucesso!`);
      url.searchParams.delete("ig"); url.searchParams.delete("u");
      window.history.replaceState({}, "", url.pathname);
    } else if (ig === "error") {
      toast.error(`Falha ao conectar: ${url.searchParams.get("reason") || "erro desconhecido"}`);
      url.searchParams.delete("ig"); url.searchParams.delete("reason");
      window.history.replaceState({}, "", url.pathname);
    }
  }, []);

  const connectInstagram = async () => {
    setConnecting(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: check } = await supabase.rpc("can_create_resource", { _user_id: user!.id, _resource: "ig_account" });
    const c = check as any;
    if (c && !c.allowed) {
      setConnecting(false);
      setUpgrade({ open: true, used: c.used, limit: c.limit });
      return;
    }
    const { data, error } = await supabase.functions.invoke("instagram-oauth-start");
    setConnecting(false);
    if (error || !data?.url) return toast.error(error?.message || "Falha ao iniciar conexão");
    window.location.href = data.url;
  };


  const openNew = () => { setEditingId(null); setForm(empty); setOpen(true); };
  const openEdit = (a: any) => {
    setEditingId(a.id);
    setForm({ username: a.username || "", ig_user_id: a.ig_user_id || "", page_id: a.page_id || "", access_token: a.access_token || "", niche: a.niche || "" });
    setOpen(true);
  };

  const save = async () => {
    if (!form.username) return toast.error("Username obrigatório");
    if (editingId) {
      const { error } = await supabase.from("instagram_accounts").update(form).eq("id", editingId);
      if (error) return toast.error(error.message);
      toast.success("Conta atualizada");
    } else {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: check } = await supabase.rpc("can_create_resource", {
        _user_id: user!.id, _resource: "ig_account",
      });
      const c = check as any;
      if (c && !c.allowed) {
        setOpen(false);
        setUpgrade({ open: true, used: c.used, limit: c.limit });
        return;
      }
      const { error } = await supabase.from("instagram_accounts").insert({ ...form, user_id: user!.id });
      if (error) return toast.error(error.message);
      toast.success("Conta adicionada");
    }
    setOpen(false); setEditingId(null); setForm(empty);
    load();
  };

  const verify = async (id: string) => {
    setVerifying(id);
    const { data, error } = await supabase.functions.invoke("verify-ig-token", { body: { account_id: id } });
    setVerifying(null);
    if (error) return toast.error(error.message);
    setResults(r => ({ ...r, [id]: data }));
    if (data?.ready) toast.success("Tudo pronto para publicar! ✨");
    else toast.error("Token incompleto — veja os detalhes abaixo");
    load();
  };

  const refresh = async (account: any) => {
    const id = account.id;
    const isInstagramOAuth = /^IG/i.test(String(account.access_token || ""));
    if (!isInstagramOAuth && !confirm("Trocar o token atual pelo Page Access Token permanente da Meta? O token atual será sobrescrito.")) return;
    setRefreshing(id);
    const { data, error } = await supabase.functions.invoke("refresh-ig-token", { body: { account_id: id } });
    setRefreshing(null);
    if (error || data?.error) return toast.error(data?.error || error?.message || "Falha ao renovar");
    toast.success(data.message);
    load();
    verify(id);
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold">Contas Instagram</h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">Conta comercial via Meta Graph API.</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto flex-wrap">
          <Button onClick={connectInstagram} disabled={connecting} className="bg-gradient-brand">
            {connecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Instagram className="h-4 w-4 mr-2" />}
            Conectar com Instagram
          </Button>
          <Button onClick={openNew} variant="outline"><Plus className="h-4 w-4 mr-2" /> Adicionar manual</Button>
        </div>
      </div>

      <div className="rounded-md border bg-secondary/40 p-3 text-xs text-muted-foreground">
        A conexão via Instagram usa OAuth direto e não precisa de Page ID nem de “token permanente”. Ela é renovável por 60 dias e deve ficar ativa quando o botão Verificar mostrar tudo pronto.
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setForm(empty); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? "Editar conta Instagram" : "Adicionar conta Instagram"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">Use uma conta comercial do Instagram conectada a uma Página do Facebook. Pegue os dados em <a className="underline text-primary" href="https://developers.facebook.com/apps/" target="_blank">developers.facebook.com</a>. Permissões necessárias: <code>instagram_basic</code>, <code>instagram_content_publish</code>, <code>pages_show_list</code>, <code>pages_read_engagement</code>.</p>
            <div><Label>Username</Label><Input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="meuperfil" /></div>
            <div><Label>Instagram Business User ID</Label><Input value={form.ig_user_id} onChange={e => setForm({ ...form, ig_user_id: e.target.value })} /></div>
            <div><Label>Page ID (Facebook)</Label><Input value={form.page_id} onChange={e => setForm({ ...form, page_id: e.target.value })} /></div>
            <div><Label>Access Token (longa duração)</Label><Textarea rows={4} value={form.access_token} onChange={e => setForm({ ...form, access_token: e.target.value })} placeholder="EAA..." /></div>
            <div><Label>Nicho</Label><Input value={form.niche} onChange={e => setForm({ ...form, niche: e.target.value })} /></div>
            <Button onClick={save} className="w-full">{editingId ? "Salvar alterações" : "Salvar"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {accounts.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground border-dashed">
          <Instagram className="h-10 w-10 mx-auto mb-3 opacity-50" />
          Nenhuma conta. Conecte uma conta comercial do Instagram.
        </Card>
      ) : (
        <div className="grid gap-3">
          {accounts.map(a => {
            const r = results[a.id];
            const expDays = a.token_expires_at ? Math.floor((new Date(a.token_expires_at).getTime() - Date.now()) / 86400000) : null;
            const expiringSoon = expDays !== null && expDays < 7;
            const expired = expDays !== null && expDays < 0;
            return (
            <Card key={a.id} className={`p-4 md:p-5 space-y-3 ${expired ? "border-destructive/40" : expiringSoon ? "border-warning/40" : ""}`}>
              <div className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                <div className="flex items-start gap-3 md:gap-4 min-w-0 flex-1">
                  <div className="h-10 w-10 rounded-lg bg-gradient-brand flex items-center justify-center shrink-0"><Instagram className="h-5 w-5 text-primary-foreground" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">@{a.username}</p>
                      {a.verification_status === "ready" && <Badge className="bg-green-600 text-[10px] h-5">verificado</Badge>}
                      {expired && <Badge variant="destructive" className="text-[10px] h-5"><AlertTriangle className="h-3 w-3 mr-1" /> Token expirado</Badge>}
                      {expiringSoon && !expired && <Badge variant="outline" className="text-[10px] h-5 border-warning text-warning"><AlertTriangle className="h-3 w-3 mr-1" /> Expira em {expDays}d</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground break-all">{a.niche || "Sem nicho"} · IG ID: {a.ig_user_id || "—"} · Page: {a.page_id || "—"}</p>
                    <p className="text-xs text-muted-foreground break-all">Token: {a.access_token ? `${a.access_token.slice(0, 12)}…${a.access_token.slice(-6)}` : "—"} {a.last_verified_at && `· verificado ${new Date(a.last_verified_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap md:flex-nowrap shrink-0">
                  <Button variant="outline" size="sm" asChild title="Configurar marca, ritmo e tom só desta conta">
                    <Link to={`/dashboard/accounts/${a.id}/settings`}>
                      <SettingsIcon className="h-4 w-4 mr-2" /> Configurar
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => verify(a.id)} disabled={verifying === a.id}>
                    {verifying === a.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
                    Verificar
                  </Button>
                  <Button variant="default" size="sm" onClick={() => refresh(a)} disabled={refreshing === a.id} title={/^IG/i.test(String(a.access_token || "")) ? "Renova o token OAuth do Instagram por mais 60 dias" : "Converte o token atual no Page Access Token permanente"}>
                    {refreshing === a.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                    {/^IG/i.test(String(a.access_token || "")) ? "Renovar token" : "Tornar permanente"}
                  </Button>
                  <Switch checked={a.active} onCheckedChange={async v => { await supabase.from("instagram_accounts").update({ active: v }).eq("id", a.id); load(); }} />
                  <Button variant="ghost" size="icon" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={async () => { await supabase.from("instagram_accounts").delete().eq("id", a.id); load(); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
              {r && (
                <div className="rounded-lg border bg-secondary/40 p-3 space-y-2 text-sm">
                  <div className="flex items-center gap-2 flex-wrap">
                    {r.ready ? <Badge className="bg-green-600">✅ Pronto para publicar</Badge> : <Badge variant="destructive">⚠️ Não está pronto</Badge>}
                    {r.days_until_expiry !== null && r.days_until_expiry !== undefined && (
                      <Badge variant="outline" className={r.days_until_expiry < 7 ? "border-warning text-warning" : ""}>
                        Expira em {r.days_until_expiry}d ({new Date(r.expires_at).toLocaleDateString("pt-BR")})
                      </Badge>
                    )}
                    {r.token_mode === "instagram_login" && <Badge variant="outline">OAuth Instagram</Badge>}
                  </div>
                  <ul className="space-y-1 text-xs">
                    <Check ok={r.token_valid} label="Token válido" />
                    <Check ok={r.has_publish_permission} label="Permissão instagram_content_publish" />
                    <Check ok={r.ig_user_id_valid} label={`Instagram User ID${r.ig_username ? ` — @${r.ig_username}` : ""}`} />
                    {!r.page_id_required && <li className="text-muted-foreground">Page ID não é necessário para OAuth direto do Instagram</li>}
                    {r.page_id_required && <Check ok={r.page_id_valid} label={`Page ID${r.page_name ? ` — ${r.page_name}` : ""}`} />}
                  </ul>
                  {r.scopes?.length > 0 && (
                    <p className="text-xs text-muted-foreground"><b>Escopos:</b> {r.scopes.join(", ")}</p>
                  )}
                  {r.errors?.length > 0 && (
                    <div className="text-xs text-destructive space-y-1">
                      {r.errors.map((e: string, i: number) => <p key={i}>• {e}</p>)}
                    </div>
                  )}
                </div>
              )}
            </Card>
            );
          })}
        </div>
      )}
      <UpgradeModal
        open={upgrade.open}
        onOpenChange={(o) => setUpgrade({ ...upgrade, open: o })}
        resource="contas Instagram"
        used={upgrade.used} limit={upgrade.limit}
      />
    </div>
  );
}
