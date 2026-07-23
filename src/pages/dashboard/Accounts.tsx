import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Instagram, Trash2, Pencil, ShieldCheck, Loader2, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Settings as SettingsIcon } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { UpgradeModal } from "@/components/UpgradeModal";
import { useLanguage } from "@/contexts/LanguageContext";

const empty = { username: "", niche: "" };
const ACCOUNT_PUBLIC_COLUMNS = "id,user_id,username,ig_user_id,page_id,niche,active,created_at,updated_at,custom_hashtags,token_expires_at,last_verified_at,verification_status";

const Check = ({ ok, label }: { ok: boolean; label: string }) => (
  <li className="flex items-center gap-2">
    {ok ? <CheckCircle2 className="h-3.5 w-3.5 text-green-600" /> : <XCircle className="h-3.5 w-3.5 text-destructive" />}
    <span>{label}</span>
  </li>
);

function friendlyInstagramConnectError(reason: string | null, t: (source: string) => string): string {
  const text = reason || t("erro desconhecido");
  if (/authorization_code_already_used|authorization code has been used/i.test(text)) {
    return t("Esse link de autorização do Instagram já foi usado. Clique em Conectar com Instagram novamente e conclua em uma nova tentativa.");
  }
  if (/state_expired/i.test(text)) {
    return t("A autorização expirou. Clique em Conectar com Instagram novamente.");
  }
  if (/account_limit_reached/i.test(text)) {
    return t("Limite de contas Instagram atingido para este plano.");
  }
  if (/long_token_failed/i.test(text)) {
    return t("O Instagram autorizou, mas falhou ao gerar o token de longa duração. Tente conectar novamente.");
  }
  return text;
}

export default function Accounts() {
  const { language, locale, t } = useLanguage();
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
    const { data } = await supabase.from("instagram_accounts").select(ACCOUNT_PUBLIC_COLUMNS).order("created_at", { ascending: false });
    setAccounts(data || []);
  };
  useEffect(() => {
    load();
    // Handle OAuth return params
    const url = new URL(window.location.href);
    const ig = url.searchParams.get("ig");
    if (ig === "connected") {
      toast.success(language === "en-US" ? `Account @${url.searchParams.get("u") || ""} connected successfully!` : `Conta @${url.searchParams.get("u") || ""} conectada com sucesso!`);
      url.searchParams.delete("ig"); url.searchParams.delete("u");
      window.history.replaceState({}, "", url.pathname);
    } else if (ig === "error") {
      toast.error(`${t("Falha ao conectar")}: ${friendlyInstagramConnectError(url.searchParams.get("reason"), t)}`);
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
    if (error || !data?.url) return toast.error(error?.message || t("Falha ao iniciar conexão"));
    window.location.href = data.url;
  };


  const openEdit = (a: any) => {
    setEditingId(a.id);
    setForm({ username: a.username || "", niche: a.niche || "" });
    setOpen(true);
  };

  const save = async () => {
    if (!form.username) return toast.error(t("Username obrigatório"));
    if (!editingId) return toast.error(t("Conecte novas contas pelo Instagram."));
    const { error } = await supabase.from("instagram_accounts").update(form).eq("id", editingId);
    if (error) return toast.error(error.message);
    toast.success(t("Conta atualizada"));
    setOpen(false); setEditingId(null); setForm(empty);
    load();
  };

  const verify = async (id: string) => {
    setVerifying(id);
    const { data, error } = await supabase.functions.invoke("verify-ig-token", { body: { account_id: id } });
    setVerifying(null);
    if (error) return toast.error(error.message);
    setResults(r => ({ ...r, [id]: data }));
    if (data?.ready) toast.success(t("Tudo pronto para publicar! ✨"));
    else toast.error(t("Token incompleto — veja os detalhes abaixo"));
    load();
  };

  const refresh = async (account: any) => {
    const id = account.id;
    setRefreshing(id);
    const { data, error } = await supabase.functions.invoke("refresh-ig-token", { body: { account_id: id } });
    setRefreshing(null);
    if (error || data?.error) return toast.error(data?.error || error?.message || t("Falha ao renovar"));
    toast.success(data.message);
    load();
    verify(id);
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold">{t("Contas Instagram")}</h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">{t("Conta comercial via Meta Graph API.")}</p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto flex-wrap">
          <Button onClick={connectInstagram} disabled={connecting} className="bg-gradient-brand">
            {connecting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Instagram className="h-4 w-4 mr-2" />}
            {t("Conectar com Instagram")}
          </Button>
        </div>
      </div>

      <div className="rounded-md border bg-secondary/40 p-3 text-xs text-muted-foreground">
        {t("A conexão via Instagram usa OAuth direto e não precisa de Page ID nem de “token permanente”. Ela é renovável por 60 dias e deve ficar ativa quando o botão Verificar mostrar tudo pronto.")}
      </div>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditingId(null); setForm(empty); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("Editar conta Instagram")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Username</Label><Input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} placeholder="meuperfil" /></div>
            <div><Label>{t("Nicho")}</Label><Input value={form.niche} onChange={e => setForm({ ...form, niche: e.target.value })} /></div>
            <p className="text-xs text-muted-foreground">{t("A credencial da Meta fica protegida no servidor e nunca é exibida no navegador.")}</p>
            <Button onClick={save} className="w-full">{t("Salvar alterações")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {accounts.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground border-dashed">
          <Instagram className="h-10 w-10 mx-auto mb-3 opacity-50" />
          {t("Nenhuma conta. Conecte uma conta comercial do Instagram.")}
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
                      {a.verification_status === "ready" && <Badge className="bg-green-600 text-[10px] h-5">{t("verificado")}</Badge>}
                      {expired && <Badge variant="destructive" className="text-[10px] h-5"><AlertTriangle className="h-3 w-3 mr-1" /> {t("Token expirado")}</Badge>}
                      {expiringSoon && !expired && <Badge variant="outline" className="text-[10px] h-5 border-warning text-warning"><AlertTriangle className="h-3 w-3 mr-1" /> {language === "en-US" ? `Expires in ${expDays}d` : `Expira em ${expDays}d`}</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground break-all">{a.niche || t("Sem nicho")} · IG ID: {a.ig_user_id || "—"} · Page: {a.page_id || "—"}</p>
                    <p className="text-xs text-muted-foreground break-all">{t("Credencial protegida no servidor")} {a.last_verified_at && `· ${language === "en-US" ? "verified" : "verificada"} ${new Date(a.last_verified_at).toLocaleString(locale, { timeZone: "America/Sao_Paulo" })}`}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap md:flex-nowrap shrink-0">
                  <Button variant="outline" size="sm" asChild title={t("Configurar marca, ritmo e tom só desta conta")}>
                    <Link to={`/dashboard/accounts/${a.id}/settings`}>
                      <SettingsIcon className="h-4 w-4 mr-2" /> {t("Configurar")}
                    </Link>
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => verify(a.id)} disabled={verifying === a.id}>
                    {verifying === a.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
                    {t("Verificar")}
                  </Button>
                  <Button variant="default" size="sm" onClick={() => refresh(a)} disabled={refreshing === a.id} title={t("Renovar a conexão segura com a Meta")}>
                    {refreshing === a.id ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                    {t("Renovar conexão")}
                  </Button>
                  <Switch checked={a.active} onCheckedChange={async v => {
                    const { error } = await supabase.from("instagram_accounts").update({ active: v }).eq("id", a.id);
                    if (error) return toast.error(error.message);
                    load();
                  }} />
                  <Button variant="ghost" size="icon" onClick={() => openEdit(a)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={async () => {
                    if (!confirm(language === "en-US" ? `Remove @${a.username}?` : `Remover @${a.username}?`)) return;
                    const { error } = await supabase.from("instagram_accounts").delete().eq("id", a.id);
                    if (error) return toast.error(error.message);
                    toast.success(t("Conta removida"));
                    load();
                  }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
              {r && (
                <div className="rounded-lg border bg-secondary/40 p-3 space-y-2 text-sm">
                  <div className="flex items-center gap-2 flex-wrap">
                    {r.ready ? <Badge className="bg-green-600">✅ {t("Pronto para publicar")}</Badge> : <Badge variant="destructive">⚠️ {t("Não está pronto")}</Badge>}
                    {r.days_until_expiry !== null && r.days_until_expiry !== undefined && (
                      <Badge variant="outline" className={r.days_until_expiry < 7 ? "border-warning text-warning" : ""}>
                        {language === "en-US" ? `Expires in ${r.days_until_expiry}d` : `Expira em ${r.days_until_expiry}d`} ({new Date(r.expires_at).toLocaleDateString(locale)})
                      </Badge>
                    )}
                    {r.token_mode === "instagram_login" && <Badge variant="outline">OAuth Instagram</Badge>}
                  </div>
                  <ul className="space-y-1 text-xs">
                    <Check ok={r.token_valid} label={t("Token válido")} />
                    <Check ok={r.has_publish_permission} label={t("Permissão instagram_content_publish")} />
                    <Check ok={r.ig_user_id_valid} label={`Instagram User ID${r.ig_username ? ` — @${r.ig_username}` : ""}`} />
                    {!r.page_id_required && <li className="text-muted-foreground">{t("Page ID não é necessário para OAuth direto do Instagram")}</li>}
                    {r.page_id_required && <Check ok={r.page_id_valid} label={`Page ID${r.page_name ? ` — ${r.page_name}` : ""}`} />}
                  </ul>
                  {r.scopes?.length > 0 && (
                    <p className="text-xs text-muted-foreground"><b>{t("Escopos:")}</b> {r.scopes.join(", ")}</p>
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
        resource={t("contas Instagram")}
        used={upgrade.used} limit={upgrade.limit}
      />
    </div>
  );
}
