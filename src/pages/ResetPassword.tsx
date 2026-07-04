import { useEffect, useState } from "react";
import { SEO } from "@/components/SEO";
import { Link, useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";

const schema = z.object({
  password: z.string().min(8, "Mínimo 8 caracteres").max(72),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, { message: "As senhas não coincidem", path: ["confirm"] });

type RecoveryStatus = "validating" | "ready" | "invalid";

const INVALID_LINK_MESSAGE =
  "Este link de recuperação está inválido ou expirou. Solicite um novo link para definir sua senha.";

function getRecoveryParams() {
  const searchParams = new URLSearchParams(window.location.search);
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  const hashParams = new URLSearchParams(hash);

  return {
    code: searchParams.get("code") || hashParams.get("code"),
    accessToken: searchParams.get("access_token") || hashParams.get("access_token"),
    refreshToken: searchParams.get("refresh_token") || hashParams.get("refresh_token"),
    error: searchParams.get("error_description")
      || hashParams.get("error_description")
      || searchParams.get("error")
      || hashParams.get("error"),
  };
}

function clearRecoveryParams() {
  window.history.replaceState(null, document.title, window.location.pathname);
}

type PasswordInputProps = {
  value: string;
  onChange: (value: string) => void;
  visible: boolean;
  onToggle: () => void;
  autoComplete: string;
};

function PasswordInput({ value, onChange, visible, onToggle, autoComplete }: PasswordInputProps) {
  const label = visible ? "Ocultar senha" : "Mostrar senha";
  const Icon = visible ? EyeOff : Eye;

  return (
    <div className="relative">
      <Input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        maxLength={72}
        autoComplete={autoComplete}
        className="pr-11"
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={label}
        aria-pressed={visible}
        title={label}
        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export default function ResetPassword() {
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<RecoveryStatus>("validating");
  const [linkError, setLinkError] = useState("");

  useEffect(() => {
    let active = true;

    const markReady = () => {
      if (!active) return;
      setLinkError("");
      setStatus("ready");
    };

    const markInvalid = (message = INVALID_LINK_MESSAGE) => {
      if (!active) return;
      setLinkError(message);
      setStatus("invalid");
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        markReady();
      }
    });

    const validateRecoveryLink = async () => {
      const params = getRecoveryParams();

      if (params.error) {
        markInvalid(params.error);
        return;
      }

      if (params.accessToken && params.refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: params.accessToken,
          refresh_token: params.refreshToken,
        });

        if (error) {
          markInvalid(error.message);
          return;
        }

        clearRecoveryParams();
        markReady();
        return;
      }

      if (params.code) {
        const { error } = await supabase.auth.exchangeCodeForSession(params.code);

        if (error) {
          markInvalid(error.message);
          return;
        }

        clearRecoveryParams();
        markReady();
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (data.session) {
        markReady();
        return;
      }

      markInvalid();
    };

    validateRecoveryLink();

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ password, confirm });
    if (!parsed.success) return toast.error(parsed.error.errors[0].message);
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Senha atualizada!");
    nav("/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <SEO
        title="Definir nova senha — Flux & Feed"
        description="Crie uma nova senha segura para sua conta Flux & Feed e volte a automatizar suas publicações no Instagram."
        path="/reset-password"
        noindex
      />
      <Card className="w-full max-w-md p-8 glass">
        <div className="mb-6 flex justify-center">
          <BrandLogo priority className="h-9 max-w-[230px]" />
        </div>
        <h1 className="font-display text-2xl font-bold mb-2">Nova senha</h1>
        <p className="text-sm text-muted-foreground mb-6">Defina uma nova senha para acessar sua conta.</p>
        {status === "validating" ? (
          <p className="text-sm text-muted-foreground">Validando link…</p>
        ) : status === "invalid" ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{linkError}</p>
            <Button className="w-full" asChild>
              <Link to="/forgot-password">Solicitar novo link</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handle} className="space-y-4">
            <div className="space-y-2">
              <Label>Nova senha</Label>
              <PasswordInput
                value={password}
                onChange={setPassword}
                visible={showPassword}
                onToggle={() => setShowPassword((value) => !value)}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label>Confirmar senha</Label>
              <PasswordInput
                value={confirm}
                onChange={setConfirm}
                visible={showConfirm}
                onToggle={() => setShowConfirm((value) => !value)}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar nova senha"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
