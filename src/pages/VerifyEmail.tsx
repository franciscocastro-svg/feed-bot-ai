import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Loader2, MailCheck, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { BrandLogo } from "@/components/BrandLogo";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { trackMetaEvent } from "@/lib/metaPixel";

const codeSchema = z.string().regex(/^\d{6}$/, "Digite os 6 números do código");

export default function VerifyEmail() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setInterval(() => setCooldown(v => Math.max(0, v - 1)), 1000);
    return () => window.clearInterval(t);
  }, [cooldown]);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth", { replace: true });
  }, [authLoading, user, navigate]);

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    const parsed = codeSchema.safeParse(code);
    if (!parsed.success) return toast.error(parsed.error.errors[0].message);
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("verify-code", { body: { code: parsed.data } });
    setLoading(false);
    if (error) return toast.error("Não foi possível verificar agora. Tente novamente.");
    const res = data as { ok: boolean; error?: string; retry_after?: number; already?: boolean } | null;
    if (!res?.ok) {
      if (res?.error === "expired") return toast.error("Código expirado. Solicite um novo.");
      if (res?.error === "no_code") return toast.error("Nenhum código pendente. Solicite um novo.");
      if (res?.error === "blocked") return toast.error("Muitas tentativas. Tente novamente em alguns minutos.");
      if (res?.error === "payment_required") return toast.error("Pagamento ainda não confirmado. Aguarde.");
      return toast.error("Código incorreto.");
    }
    trackMetaEvent("CompleteRegistration", { content_name: "email_verified" });
    setConfirmed(true);
    toast.success("E-mail confirmado! Acesso liberado.");
    window.setTimeout(() => navigate("/dashboard", { replace: true }), 1200);
  };

  const resend = async () => {
    if (cooldown > 0) return;
    setResending(true);
    const { data, error } = await supabase.functions.invoke("send-verification-code", { body: {} });
    setResending(false);
    if (error) return toast.error("Não foi possível reenviar agora.");
    const res = data as { ok: boolean; error?: string; retry_after?: number } | null;
    if (!res?.ok) {
      if (res?.error === "cooldown") {
        setCooldown(res.retry_after ?? 60);
        return toast.error(`Aguarde ${res.retry_after ?? 60}s para reenviar.`);
      }
      if (res?.error === "payment_required")
        return toast.error("Confirme o pagamento antes de solicitar o código.");
      if (res?.error === "blocked") return toast.error("Envio temporariamente bloqueado.");
      return toast.error("Não foi possível reenviar agora.");
    }
    setCooldown(60);
    toast.success("Novo código enviado. O código anterior foi invalidado.");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <SEO
        title="Confirmar e-mail — Flux & Feed"
        description="Confirme seu e-mail para ativar seu acesso no Flux & Feed."
        path="/verify-email"
        noindex
      />
      <Card className="w-full max-w-md p-8 glass border-border shadow-card">
        <div className="mb-6 flex justify-center">
          <BrandLogo priority className="h-9 max-w-[230px]" />
        </div>
        {confirmed ? (
          <div className="space-y-4 text-center" role="status">
            <CheckCircle2 className="mx-auto h-14 w-14 text-green-500" />
            <h1 className="font-display text-2xl font-bold">E-mail confirmado</h1>
            <p className="text-sm text-muted-foreground">Abrindo o painel...</p>
          </div>
        ) : (
          <>
            <div className="mb-6 space-y-2 text-center">
              <MailCheck className="mx-auto h-12 w-12 text-primary" />
              <h1 className="font-display text-2xl font-bold">Digite o código</h1>
              <p className="text-sm text-muted-foreground">
                Enviamos um código de 6 números para <strong>{user?.email}</strong>. Ele expira em 15 minutos.
              </p>
            </div>
            <form onSubmit={verify} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="verification-code">Código de confirmação</Label>
                <Input
                  id="verification-code"
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  className="h-14 text-center text-2xl font-semibold tracking-[0.35em]"
                  maxLength={6}
                  autoFocus
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading || code.length !== 6}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar e liberar acesso"}
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={resend} disabled={resending || cooldown > 0}>
                {resending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {cooldown > 0 ? `Reenviar em ${cooldown}s` : "Reenviar código"}
              </Button>
              <Button variant="ghost" className="w-full" asChild>
                <Link to="/auth"><ArrowLeft className="h-4 w-4" /> Sair</Link>
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
