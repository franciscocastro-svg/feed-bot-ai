import { useState } from "react";
import { SEO } from "@/components/SEO";
import { Link } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, Sparkles, ArrowLeft } from "lucide-react";

const schema = z.object({ email: z.string().trim().email("Email inválido").max(255) });

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = schema.safeParse({ email });
    if (!parsed.success) return toast.error(parsed.error.errors[0].message);
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    setSent(true);
    toast.success("Email enviado! Verifique sua caixa de entrada.");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <SEO
        title="Recuperar senha — NewsFlow"
        description="Esqueceu sua senha do NewsFlow? Informe seu email e receba um link seguro para criar uma nova senha de acesso."
        path="/forgot-password"
      />
      <Card className="w-full max-w-md p-8 glass">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="h-10 w-10 rounded-xl bg-gradient-brand flex items-center justify-center shadow-glow">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="font-display text-xl font-bold">NewsFlow</span>
        </div>
        <h1 className="font-display text-2xl font-bold mb-2">Esqueceu a senha?</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Informe seu email e enviaremos um link para criar uma nova senha.
        </p>
        {sent ? (
          <div className="space-y-4">
            <p className="text-sm">Enviamos um link de recuperação para <strong>{email}</strong>. Pode levar alguns minutos.</p>
            <Button variant="outline" className="w-full" asChild>
              <Link to="/auth"><ArrowLeft className="h-4 w-4 mr-2" /> Voltar para o login</Link>
            </Button>
          </div>
        ) : (
          <form onSubmit={handle} className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={255} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Enviar link"}
            </Button>
            <Button variant="ghost" className="w-full" asChild>
              <Link to="/auth"><ArrowLeft className="h-4 w-4 mr-2" /> Voltar</Link>
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
