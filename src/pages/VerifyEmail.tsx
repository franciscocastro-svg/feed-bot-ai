import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
import { trackMetaEvent } from "@/lib/metaPixel";

const emailSchema = z.string().trim().email("Informe um e-mail válido").max(255);
const codeSchema = z.string().regex(/^\d{6}$/, "Digite os 6 números do código");

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const initialEmail = useMemo(
    () => params.get("email") || sessionStorage.getItem("ff_pending_verification_email") || "",
    [params],
  );
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  const verify = async (event: FormEvent) => {
    event.preventDefault();
    const parsedEmail = emailSchema.safeParse(email);
    if (!parsedEmail.success) return toast.error(parsedEmail.error.errors[0].message);
    const parsedCode = codeSchema.safeParse(code);
    if (!parsedCode.success) return toast.error(parsedCode.error.errors[0].message);

    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email: parsedEmail.data,
      token: parsedCode.data,
      type: "signup",
    });
    setLoading(false);
    if (error) {
      toast.error("Código inválido ou expirado. Solicite um novo código.");
      return;
    }

    sessionStorage.removeItem("ff_pending_verification_email");
    trackMetaEvent("CompleteRegistration", { content_name: "email_verified" });
    setConfirmed(true);
    toast.success("E-mail confirmado! Seu cadastro foi aprovado automaticamente.");
    window.setTimeout(() => navigate("/pricing", { replace: true }), 1200);
  };

  const resend = async () => {
    const parsedEmail = emailSchema.safeParse(email);
    if (!parsedEmail.success) return toast.error(parsedEmail.error.errors[0].message);
    if (cooldown > 0) return;

    setResending(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: parsedEmail.data,
      options: { emailRedirectTo: `${window.location.origin}/verify-email` },
    });
    setResending(false);
    if (error) return toast.error("Não foi possível reenviar agora. Aguarde e tente novamente.");
    setCooldown(60);
    toast.success("Novo código enviado.");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <SEO
        title="Confirmar e-mail — Flux & Feed"
        description="Confirme seu e-mail para ativar automaticamente seu cadastro no Flux & Feed."
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
            <p className="text-sm text-muted-foreground">Cadastro aprovado. Abrindo a ativação dos 7 dias...</p>
          </div>
        ) : (
          <>
            <div className="mb-6 space-y-2 text-center">
              <MailCheck className="mx-auto h-12 w-12 text-primary" />
              <h1 className="font-display text-2xl font-bold">Digite o código</h1>
              <p className="text-sm text-muted-foreground">
                Enviamos um código de 6 números para confirmar seu cadastro automaticamente.
              </p>
            </div>
            <form onSubmit={verify} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="verification-email">E-mail</Label>
                <Input
                  id="verification-email"
                  type="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="verification-code">Código de confirmação</Label>
                <Input
                  id="verification-code"
                  value={code}
                  onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
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
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar e continuar"}
              </Button>
              <Button type="button" variant="outline" className="w-full" onClick={resend} disabled={resending || cooldown > 0}>
                {resending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {cooldown > 0 ? `Reenviar em ${cooldown}s` : "Reenviar código"}
              </Button>
              <Button variant="ghost" className="w-full" asChild>
                <Link to="/auth"><ArrowLeft className="h-4 w-4" /> Corrigir cadastro</Link>
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
