import { useEffect, useMemo, useState } from "react";
import { BookOpenCheck, Clock3, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  buildEditorialPilotProposal,
  type EditorialPilotProfileInput,
} from "@/lib/editorial-pilot/buildProposal";
import type { EditorialPilotProposal } from "@/lib/editorial-pilot/schema";

type EditorialPilotAccount = {
  id: string;
  username: string;
};

type EditorialPilotPreviewProps = {
  account: EditorialPilotAccount;
  profile: EditorialPilotProfileInput;
};

const formatLabels: Record<string, string> = {
  feed: "Feed",
  reel: "Reel",
  story: "Story",
  carousel: "Carrossel",
};

export function EditorialPilotPreview({ account, profile }: EditorialPilotPreviewProps) {
  const [proposal, setProposal] = useState<EditorialPilotProposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const profileSignature = useMemo(() => JSON.stringify(profile), [profile]);

  useEffect(() => {
    setProposal(null);
    setError(null);
  }, [account.id, profileSignature]);

  const buildPreview = async () => {
    setBuilding(true);
    setError(null);
    try {
      const nextProposal = await buildEditorialPilotProposal({
        instagramAccountId: account.id,
        instagramUsername: account.username,
        profile,
      });
      setProposal(nextProposal);
    } catch {
      setProposal(null);
      setError("Não foi possível montar a prévia local. Revise o Perfil de Criador e tente novamente.");
    } finally {
      setBuilding(false);
    }
  };

  return (
    <Card className="border-fuchsia-500/30 bg-card/95">
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Sparkles className="h-6 w-6 text-fuchsia-500" />
                Piloto Editorial Inteligente
              </CardTitle>
              <Badge variant="secondary">Prévia local</Badge>
              <Badge variant="outline">Somente leitura</Badge>
            </div>
            <CardDescription>
              Monte uma proposta editorial para @{account.username.replace(/^@/, "")} usando somente os dados preenchidos acima.
            </CardDescription>
          </div>
          <Button type="button" onClick={buildPreview} disabled={building}>
            {building ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {proposal ? "Atualizar proposta" : "Montar proposta local"}
          </Button>
        </div>

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground">
          Esta prévia não cria nem altera fontes, pautas, configurações, filas ou publicações.
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardHeader>

      {proposal && (
        <CardContent className="space-y-6">
          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border p-4">
              <h3 className="font-semibold">Posicionamento sugerido</h3>
              <p className="mt-2 text-sm text-muted-foreground">{proposal.strategy.positioning}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {proposal.strategy.pillars.map((pillar) => <Badge key={pillar} variant="secondary">{pillar}</Badge>)}
              </div>
            </div>
            <div className="rounded-xl border p-4">
              <h3 className="font-semibold">Distribuição editorial</h3>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-muted-foreground">Educação</dt><dd className="font-semibold">{proposal.content_mix.educational}%</dd></div>
                <div><dt className="text-muted-foreground">Autoridade</dt><dd className="font-semibold">{proposal.content_mix.authority}%</dd></div>
                <div><dt className="text-muted-foreground">Engajamento</dt><dd className="font-semibold">{proposal.content_mix.engagement}%</dd></div>
                <div><dt className="text-muted-foreground">Conversão</dt><dd className="font-semibold">{proposal.content_mix.conversion}%</dd></div>
              </dl>
            </div>
          </section>

          <section>
            <h3 className="flex items-center gap-2 font-semibold"><BookOpenCheck className="h-4 w-4 text-fuchsia-500" /> Fontes para pesquisar e revisar</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {proposal.source_suggestions.map((source) => (
                <article key={source.client_ref} className="rounded-xl border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline">{source.kind.toUpperCase()}</Badge>
                    <span className="text-xs text-muted-foreground">risco {source.risk}</span>
                  </div>
                  <p className="mt-3 text-sm font-medium">{source.query}</p>
                  <p className="mt-2 text-xs text-muted-foreground">{source.reason}</p>
                </article>
              ))}
            </div>
          </section>

          <section>
            <h3 className="font-semibold">Pautas sugeridas</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {proposal.topic_suggestions.map((topic) => (
                <article key={topic.client_ref} className="rounded-xl border p-4">
                  <div className="flex flex-wrap gap-2">
                    <Badge>{topic.objective}</Badge>
                    {topic.formats.map((format) => <Badge key={format} variant="outline">{formatLabels[format]}</Badge>)}
                  </div>
                  <p className="mt-3 font-medium">{topic.title}</p>
                  <p className="mt-2 text-sm text-muted-foreground">{topic.reason}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border p-4">
              <h3 className="flex items-center gap-2 font-semibold"><Clock3 className="h-4 w-4 text-fuchsia-500" /> Cadência sugerida</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {proposal.cadence.suggested_posts_per_week} publicações por semana, com horários iniciais às {proposal.cadence.preferred_hours.map((hour) => `${hour}h`).join(", ")}.
              </p>
            </div>
            <div className="rounded-xl border p-4">
              <h3 className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-fuchsia-500" /> Proteções</h3>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {proposal.guardrails.notes.map((note) => <li key={note}>• {note}</li>)}
              </ul>
            </div>
          </section>
        </CardContent>
      )}
    </Card>
  );
}
