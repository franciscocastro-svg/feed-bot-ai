import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function DataDeletionStatus() {
  const [searchParams] = useSearchParams();
  const confirmationCode = searchParams.get("code");

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <SEO
        title="Exclusão de dados — Flux & Feed"
        description="Confirmação de exclusão dos dados vinculados ao Instagram no Flux & Feed."
        path="/data-deletion"
        noindex
      />
      <Card className="w-full max-w-lg p-6 text-center sm:p-8">
        <BrandLogo priority className="mx-auto h-9 max-w-[230px]" />
        <CheckCircle2 className="mx-auto mt-8 h-12 w-12 text-emerald-500" />
        <h1 className="mt-4 font-display text-2xl font-bold">Dados removidos</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Os dados da conta do Instagram vinculada foram removidos do Flux & Feed.
        </p>
        {confirmationCode && (
          <p className="mt-4 break-all rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            Código de confirmação: {confirmationCode}
          </p>
        )}
        <Button asChild className="mt-6">
          <Link to="/">Voltar ao início</Link>
        </Button>
      </Card>
    </main>
  );
}
