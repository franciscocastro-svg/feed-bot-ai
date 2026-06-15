import { useEffect, useState } from "react";
import { SEO } from "@/components/SEO";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";

const schema = z.object({
  password: z.string().min(8, "Mínimo 8 caracteres").max(72),
  confirm: z.string(),
}).refine((d) => d.password === d.confirm, { message: "As senhas não coincidem", path: ["confirm"] });

export default function ResetPassword() {
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase coloca os tokens no hash; o client trata via onAuthStateChange
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    // fallback: se já houver sessão de recovery
    supabase.auth.getSession().then(({ data }) => { if (data.session) setReady(true); });
    return () => sub.subscription.unsubscribe();
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
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="h-10 w-10 rounded-xl bg-gradient-brand flex items-center justify-center shadow-glow">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display text-xl font-bold">Flux & Feed</span>
        </div>
        <h1 className="font-display text-2xl font-bold mb-2">Nova senha</h1>
        <p className="text-sm text-muted-foreground mb-6">Defina uma nova senha para acessar sua conta.</p>
        {!ready ? (
          <p className="text-sm text-muted-foreground">Validando link…</p>
        ) : (
          <form onSubmit={handle} className="space-y-4">
            <div className="space-y-2">
              <Label>Nova senha</Label>
              <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required maxLength={72} />
            </div>
            <div className="space-y-2">
              <Label>Confirmar senha</Label>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required maxLength={72} />
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
