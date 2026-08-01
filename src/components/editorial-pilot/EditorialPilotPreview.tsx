import { useEffect, useMemo, useState } from "react";
import {
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Loader2,
  RefreshCw,
  Rss,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import {
  editorialApplicationSummary,
  type EditorialPilotDiscoverCandidate,
} from "@/lib/editorial-pilot/applyPlan";
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

type ApplicationResult = {
  inserted_sources: number;
  linked_sources: number;
  inserted_topics: number;
  skipped_topics: number;
  replayed: boolean;
};

const formatLabels: Record<string, string> = {
  feed: "Feed",
  reel: "Reel",
  story: "Story",
  carousel: "Carrossel",
};

const discoveryErrorMessage = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || "");
  if (message.includes("account_not_approved")) return "Esta conta ainda não está aprovada para pesquisar fontes.";
  if (message.includes("no_valid_sources")) return "Nenhuma das fontes selecionadas passou pela validação final.";
  return "Não foi possível pesquisar fontes reais agora. A proposta editorial continua disponível para revisão.";
};

export function EditorialPilotPreview({ account, profile }: EditorialPilotPreviewProps) {
  const [proposal, setProposal] = useState<EditorialPilotProposal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [applying, setApplying] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [candidates, setCandidates] = useState<EditorialPilotDiscoverCandidate[]>([]);
  const [selectedSourceUrls, setSelectedSourceUrls] = useState<string[]>([]);
  const [selectedTopicRefs, setSelectedTopicRefs] = useState<string[]>([]);
  const [applicationResult, setApplicationResult] = useState<ApplicationResult | null>(null);
  const profileSignature = useMemo(() => JSON.stringify(profile), [profile]);

  useEffect(() => {
    setProposal(null);
    setError(null);
    setDiscoveryError(null);
    setCandidates([]);
    setSelectedSourceUrls([]);
    setSelectedTopicRefs([]);
    setApplicationResult(null);
    setConfirmOpen(false);
  }, [account.id, profileSignature]);

  const discoverSources = async (currentProposal: EditorialPilotProposal) => {
    setDiscovering(true);
    setDiscoveryError(null);
    setApplicationResult(null);
    setCandidates([]);
    setSelectedSourceUrls([]);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("discover-rss", {
        body: {
          niche: currentProposal.strategy.niche,
          ig_ids: [account.id],
        },
      });
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);
      const discovered = Array.isArray(data?.feeds)
        ? data.feeds as EditorialPilotDiscoverCandidate[]
        : [];
      setCandidates(discovered);
      const validUrls = discovered.filter((candidate) => candidate.valid).map((candidate) => candidate.url);
      setSelectedSourceUrls(validUrls);
      if (validUrls.length === 0) {
        setDiscoveryError("Nenhuma fonte recente e compatível com esse nicho foi encontrada. Ajuste o nicho e tente novamente.");
      }
    } catch (nextError) {
      setDiscoveryError(discoveryErrorMessage(nextError));
    } finally {
      setDiscovering(false);
    }
  };

  const buildPreview = async () => {
    setBuilding(true);
    setError(null);
    setApplicationResult(null);
    try {
      const nextProposal = await buildEditorialPilotProposal({
        instagramAccountId: account.id,
        instagramUsername: account.username,
        profile,
      });
      setProposal(nextProposal);
      setSelectedTopicRefs(nextProposal.topic_suggestions.map((topic) => topic.client_ref));
      await discoverSources(nextProposal);
    } catch {
      setProposal(null);
      setError("Não foi possível montar a proposta. Revise o Perfil de Criador e tente novamente.");
    } finally {
      setBuilding(false);
    }
  };

  const summary = useMemo(
    () => proposal
      ? editorialApplicationSummary(
        proposal,
        candidates,
        selectedSourceUrls,
        selectedTopicRefs,
      )
      : null,
    [candidates, proposal, selectedSourceUrls, selectedTopicRefs],
  );

  const toggleSource = (url: string, checked: boolean) => {
    setApplicationResult(null);
    setSelectedSourceUrls((current) => checked
      ? [...new Set([...current, url])]
      : current.filter((value) => value !== url));
  };

  const toggleTopic = (clientRef: string, checked: boolean) => {
    setApplicationResult(null);
    setSelectedTopicRefs((current) => checked
      ? [...new Set([...current, clientRef])]
      : current.filter((value) => value !== clientRef));
  };

  const applyPlan = async () => {
    if (!proposal || !summary?.canApply) return;
    setApplying(true);
    try {
      const { data, error: invokeError } = await supabase.functions.invoke("discover-rss", {
        body: {
          niche: proposal.strategy.niche,
          ig_ids: [account.id],
          insert: true,
          selected_feeds: summary.sources,
          proposal_id: proposal.proposal_id,
          profile_fingerprint: proposal.instagram.profile_fingerprint,
          selected_topics: summary.topics,
        },
      });
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);
      const result = data?.application as ApplicationResult | undefined;
      if (!result) throw new Error("application_result_missing");
      setApplicationResult(result);
      setConfirmOpen(false);
      toast.success(result.replayed
        ? "Este plano já estava aplicado nesta conta."
        : "Plano editorial aplicado com segurança.");
    } catch (nextError) {
      toast.error(discoveryErrorMessage(nextError));
    } finally {
      setApplying(false);
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
              <Badge variant="secondary">Descoberta real</Badge>
              <Badge variant="outline">Confirmação obrigatória</Badge>
            </div>
            <CardDescription>
              Analise o perfil de @{account.username.replace(/^@/, "")}, valide fontes reais e escolha o que deve ser criado.
            </CardDescription>
          </div>
          <Button type="button" onClick={buildPreview} disabled={building || discovering || applying}>
            {building || discovering
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : <Sparkles className="mr-2 h-4 w-4" />}
            {proposal ? "Refazer análise" : "Analisar perfil e buscar fontes"}
          </Button>
        </div>

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground">
          A análise não altera sua conta. Fontes e pautas só serão criadas após sua revisão e confirmação final.
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardHeader>

      {proposal && (
        <CardContent className="space-y-6">
          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border p-4">
              <h3 className="font-semibold">Posicionamento identificado</h3>
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 font-semibold">
                <Rss className="h-4 w-4 text-fuchsia-500" /> Fontes reais encontradas
              </h3>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={discovering || applying}
                onClick={() => discoverSources(proposal)}
              >
                {discovering
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <RefreshCw className="mr-2 h-4 w-4" />}
                Pesquisar novamente
              </Button>
            </div>
            {discoveryError && (
              <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground">
                {discoveryError}
              </div>
            )}
            {discovering && (
              <div className="mt-3 flex items-center gap-2 rounded-xl border p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Pesquisando e validando notícias recentes do nicho…
              </div>
            )}
            {!discovering && candidates.length > 0 && (
              <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {candidates.map((source) => {
                  const checked = selectedSourceUrls.includes(source.url);
                  const samples = source.preview?.sample_items?.slice(0, 2) || [];
                  return (
                    <article key={source.url} className={`rounded-xl border p-4 ${source.valid ? "" : "opacity-60"}`}>
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={checked}
                          disabled={!source.valid || applying}
                          onCheckedChange={(value) => toggleSource(source.url, value === true)}
                          aria-label={`Selecionar ${source.name}`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">{source.source_kind === "topic" ? "TEMA" : "RSS"}</Badge>
                            {source.valid
                              ? <Badge className="bg-emerald-600">validada</Badge>
                              : <Badge variant="destructive">rejeitada</Badge>}
                            {source.valid && <span className="text-xs text-muted-foreground">qualidade {source.quality_score || 0}</span>}
                          </div>
                          <p className="mt-2 break-words text-sm font-medium">{source.name}</p>
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 flex items-center gap-1 break-all text-xs text-fuchsia-500 hover:underline"
                          >
                            Abrir fonte <ExternalLink className="h-3 w-3" />
                          </a>
                          {source.error && <p className="mt-2 text-xs text-muted-foreground">{source.error}</p>}
                          {samples.length > 0 && (
                            <ul className="mt-3 space-y-2 border-t pt-3 text-xs text-muted-foreground">
                              {samples.map((item) => (
                                <li key={`${source.url}:${item.url}`} className="line-clamp-2">• {item.title}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section>
            <h3 className="flex items-center gap-2 font-semibold">
              <BookOpenCheck className="h-4 w-4 text-fuchsia-500" /> Pautas para criar
            </h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {proposal.topic_suggestions.map((topic) => (
                <article key={topic.client_ref} className="rounded-xl border p-4">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selectedTopicRefs.includes(topic.client_ref)}
                      disabled={applying}
                      onCheckedChange={(value) => toggleTopic(topic.client_ref, value === true)}
                      aria-label={`Selecionar pauta ${topic.title}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap gap-2">
                        <Badge>{topic.objective}</Badge>
                        {topic.formats.map((format) => <Badge key={format} variant="outline">{formatLabels[format]}</Badge>)}
                      </div>
                      <p className="mt-3 font-medium">{topic.title}</p>
                      <p className="mt-2 text-sm text-muted-foreground">{topic.reason}</p>
                    </div>
                  </div>
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
              <p className="mt-2 text-xs text-muted-foreground">A cadência permanece apenas como sugestão nesta fase.</p>
            </div>
            <div className="rounded-xl border p-4">
              <h3 className="flex items-center gap-2 font-semibold"><ShieldCheck className="h-4 w-4 text-fuchsia-500" /> Proteções</h3>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                {proposal.guardrails.notes.map((note) => <li key={note}>• {note}</li>)}
              </ul>
            </div>
          </section>

          <section className="rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/5 p-4">
            <h3 className="font-semibold">Resumo exato da aplicação</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Serão vinculadas <strong>{summary?.sources.length || 0} fonte(s)</strong> e criadas <strong>{summary?.topics.length || 0} pauta(s)</strong> somente para @{account.username.replace(/^@/, "")}.
            </p>
            {applicationResult ? (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" />
                <span>
                  Plano aplicado: {applicationResult.inserted_sources} fonte(s) nova(s), {applicationResult.linked_sources} vínculo(s) e {applicationResult.inserted_topics} pauta(s) nova(s).
                  {applicationResult.skipped_topics > 0 ? ` ${applicationResult.skipped_topics} pauta(s) já existente(s) foram preservadas.` : ""}
                </span>
              </div>
            ) : (
              <Button
                type="button"
                className="mt-4"
                disabled={!summary?.canApply || applying || discovering}
                onClick={() => setConfirmOpen(true)}
              >
                <CheckCircle2 className="mr-2 h-4 w-4" /> Revisar e aplicar plano
              </Button>
            )}
            {!summary?.canApply && !discovering && (
              <p className="mt-2 text-xs text-muted-foreground">Selecione ao menos uma fonte válida e uma pauta.</p>
            )}
          </section>
        </CardContent>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={(open) => !applying && setConfirmOpen(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar plano editorial?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação vinculará {summary?.sources.length || 0} fonte(s) e criará {summary?.topics.length || 0} pauta(s) para @{account.username.replace(/^@/, "")}. Nenhuma publicação será criada agora.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-64 space-y-3 overflow-y-auto text-sm">
            <div>
              <p className="font-medium">Fontes</p>
              <ul className="mt-1 text-muted-foreground">
                {summary?.sources.map((source) => <li key={source.url}>• {source.name}</li>)}
              </ul>
            </div>
            <div>
              <p className="font-medium">Pautas</p>
              <ul className="mt-1 text-muted-foreground">
                {summary?.topics.map((topic) => <li key={topic.client_ref}>• {topic.title}</li>)}
              </ul>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applying}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={applying || !summary?.canApply}
              onClick={(event) => {
                event.preventDefault();
                void applyPlan();
              }}
            >
              {applying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar aplicação
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
