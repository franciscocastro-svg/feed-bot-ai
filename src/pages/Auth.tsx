import { useState } from "react";
import { SEO } from "@/components/SEO";
import { useNavigate, Link } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Eye, EyeOff, Loader2, Sparkles, Newspaper, Instagram } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { trackMetaEvent } from "@/lib/metaPixel";

const schema = z.object({
  email: z.string().trim().email("Email inválido").max(255),
  password: z.string().min(6, "Mínimo 6 caracteres").max(72),
});

const signupSchema = schema.extend({
  name: z.string().trim().min(2, "Informe seu nome").max(100),
  whatsapp: z.string().trim().min(8, "WhatsApp inválido").max(20),
  city: z.string().trim().min(2, "Informe a cidade").max(100),
  state: z.string().trim().min(2, "Informe o estado").max(100),
  country: z.string().trim().min(2, "Informe o país").max(100),
  confirmPassword: z.string().min(6, "Confirme sua senha").max(72),
}).refine((data) => data.password === data.confirmPassword, {
  message: "As senhas não coincidem",
  path: ["confirmPassword"],
});

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
        onChange={e => onChange(e.target.value)}
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

export default function Auth() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [name, setName] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [city, setCity] = useState("");
  const [stateUf, setStateUf] = useState("");
  const [country, setCountry] = useState("Brasil");

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) return toast.error(parsed.error.errors[0].message);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Bem-vindo!");
    nav("/dashboard");
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = signupSchema.safeParse({ email, password, confirmPassword, name, whatsapp, city, state: stateUf, country });
    if (!parsed.success) return toast.error(parsed.error.errors[0].message);
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: window.location.origin + "/verify-email",
        data: {
          display_name: parsed.data.name,
          whatsapp: parsed.data.whatsapp,
          city: parsed.data.city,
          state: parsed.data.state,
          country: parsed.data.country,
        },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    trackMetaEvent("Lead", { content_name: "signup" });
    sessionStorage.setItem("ff_pending_verification_email", parsed.data.email);
    toast.success("Conta criada! Digite o código enviado ao seu e-mail.");
    nav(`/verify-email?email=${encodeURIComponent(parsed.data.email)}`);
  };

  const handleGoogle = async () => {
    setLoading(true);
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/dashboard" });
    if (r.error) { setLoading(false); toast.error("Falha ao entrar com Google"); return; }
    if (r.redirected) return;
    nav("/dashboard");
  };

  const handleApple = async () => {
    setLoading(true);
    const r = await lovable.auth.signInWithOAuth("apple", { redirect_uri: window.location.origin + "/dashboard" });
    if (r.error) { setLoading(false); toast.error("Falha ao entrar com Apple"); return; }
    if (r.redirected) return;
    nav("/dashboard");
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <SEO
        title="Entrar ou criar conta — Flux & Feed"
        description="Acesse o Flux & Feed ou crie sua conta para ativar 7 dias de teste com cartão e automatizar publicações no Instagram."
        path="/auth"
        noindex
      />
      <div className="hidden lg:flex flex-col justify-between p-12 bg-gradient-subtle border-r border-border relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-radial opacity-50" />
        <div className="relative">
          <BrandLogo priority className="h-9 max-w-[230px]" />
        </div>
        <div className="relative space-y-8">
          <h1 className="font-display text-5xl font-bold leading-tight">
            Notícias em <span className="text-gradient">posts virais</span>, no piloto automático.
          </h1>
          <p className="text-lg text-muted-foreground max-w-md">
            Capte, reescreva com IA e publique no Instagram. Tudo num só painel.
          </p>
          <div className="grid gap-3 max-w-sm">
            {[
              { icon: Newspaper, t: "RSS de qualquer fonte" },
              { icon: Sparkles, t: "Reescrita inteligente com IA" },
              { icon: Instagram, t: "Publicação automática no Instagram" },
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center"><f.icon className="h-4 w-4 text-primary" /></div>
                <span>{f.t}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="relative text-xs text-muted-foreground">© Flux & Feed</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-8 glass border-border shadow-card">
          <div className="lg:hidden flex flex-col items-center gap-3 mb-6">
            <BrandLogo priority className="h-9 max-w-[230px]" />
            <h1 className="font-display text-xl font-bold text-center">Entrar no Flux & Feed</h1>
          </div>
          <h1 className="hidden lg:sr-only">Entrar ou criar conta no Flux & Feed</h1>
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid grid-cols-2 w-full mb-6">
              <TabsTrigger value="signin">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Criar conta</TabsTrigger>
            </TabsList>
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2"><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} required maxLength={255} /></div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Senha</Label>
                    <Link to="/forgot-password" className="text-xs text-primary hover:underline">Esqueci minha senha</Link>
                  </div>
                  <PasswordInput
                    value={password}
                    onChange={setPassword}
                    visible={showPassword}
                    onToggle={() => setShowPassword(value => !value)}
                    autoComplete="current-password"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}</Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2"><Label>Nome completo</Label><Input value={name} onChange={e => setName(e.target.value)} maxLength={100} required /></div>
                <div className="space-y-2"><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} required maxLength={255} /></div>
                <div className="space-y-2"><Label>WhatsApp</Label><Input type="tel" placeholder="+55 11 99999-9999" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} required maxLength={20} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Cidade</Label><Input value={city} onChange={e => setCity(e.target.value)} required maxLength={100} /></div>
                  <div className="space-y-2"><Label>Estado</Label><Input value={stateUf} onChange={e => setStateUf(e.target.value)} required maxLength={100} /></div>
                </div>
                <div className="space-y-2"><Label>País</Label><Input value={country} onChange={e => setCountry(e.target.value)} required maxLength={100} /></div>
                <div className="space-y-2">
                  <Label>Senha</Label>
                  <PasswordInput
                    value={password}
                    onChange={setPassword}
                    visible={showPassword}
                    onToggle={() => setShowPassword(value => !value)}
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Confirmar senha</Label>
                  <PasswordInput
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    visible={showConfirmPassword}
                    onToggle={() => setShowConfirmPassword(value => !value)}
                    autoComplete="new-password"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar conta"}</Button>
              </form>
            </TabsContent>
          </Tabs>
          <div className="my-6 flex items-center gap-3"><div className="h-px flex-1 bg-border" /><span className="text-xs text-muted-foreground">ou</span><div className="h-px flex-1 bg-border" /></div>
          <Button variant="outline" className="w-full" onClick={handleGoogle} disabled={loading}>
            <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Entrar com Google
          </Button>
          <Button variant="outline" className="w-full mt-2" onClick={handleApple} disabled={loading}>
            <svg className="h-4 w-4 mr-2" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
            Entrar com Apple
          </Button>
        </Card>
      </div>
    </div>
  );
}
