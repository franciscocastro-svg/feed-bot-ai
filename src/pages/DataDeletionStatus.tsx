import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Trash2 } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function DataDeletionStatus() {
  const [searchParams] = useSearchParams();
  const confirmationCode = searchParams.get("code");
  const isConfirmation = Boolean(confirmationCode);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <SEO
        title={isConfirmation ? "Dados removidos — Flux & Feed" : "Exclusão de dados — Flux & Feed"}
        description="Instruções para solicitar exclusão dos dados vinculados ao Facebook, Instagram e Flux & Feed."
        path="/data-deletion"
        noindex
      />
      <Card className="w-full max-w-2xl p-6 text-center sm:p-8">
        <BrandLogo priority className="mx-auto h-9 max-w-[230px]" />
        {isConfirmation ? (
          <>
            <CheckCircle2 className="mx-auto mt-8 h-12 w-12 text-emerald-500" />
            <h1 className="mt-4 font-display text-2xl font-bold">Dados removidos</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Os dados da conta do Instagram vinculada foram removidos do Flux & Feed.
            </p>
            <p className="mt-4 break-all rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              Código de confirmação: {confirmationCode}
            </p>
          </>
        ) : (
          <>
            <Trash2 className="mx-auto mt-8 h-12 w-12 text-primary" />
            <h1 className="mt-4 font-display text-2xl font-bold">Exclusão de dados</h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Você pode solicitar a remoção dos dados vinculados ao Flux & Feed, incluindo dados de cadastro, fontes, rascunhos, agendamentos e contas do Instagram conectadas.
            </p>

            <div className="mt-6 space-y-4 text-left text-sm leading-relaxed text-muted-foreground">
              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <h2 className="font-semibold text-foreground">Como solicitar</h2>
                <ol className="mt-3 list-decimal space-y-2 pl-5">
                  <li>Acesse sua conta no Flux & Feed e desconecte as contas do Instagram que não deseja mais manter vinculadas.</li>
                  <li>Envie uma solicitação para <a className="text-primary underline" href="mailto:diassiscastroficial@gmail.com">diassiscastroficial@gmail.com</a> ou pelo WhatsApp <a className="text-primary underline" href="https://wa.me/5547996080134">+55 47 99608-0134</a>.</li>
                  <li>Informe o email cadastrado na plataforma e, se aplicável, o @ da conta do Instagram conectada.</li>
                </ol>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 p-4">
                <h2 className="font-semibold text-foreground">O que removemos</h2>
                <p className="mt-2">
                  Removemos ou anonimizamos dados pessoais, tokens de acesso, contas conectadas, fontes cadastradas, rascunhos e agendamentos vinculados à conta, salvo quando a retenção for necessária por obrigação legal, fiscal, segurança, prevenção a fraude ou defesa de direitos.
                </p>
                <p className="mt-2">
                  O prazo padrão de atendimento é de até 15 dias para confirmação da solicitação. Conteúdos já publicados em serviços de terceiros, como Instagram, devem ser removidos diretamente na plataforma correspondente.
                </p>
              </div>
            </div>
          </>
        )}
        <Button asChild className="mt-6">
          <Link to="/">Voltar ao início</Link>
        </Button>
      </Card>
    </main>
  );
}
