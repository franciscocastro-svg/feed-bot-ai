import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Map, CheckCircle2, AlertTriangle, Rocket, Lock, Users, Unlock,
  Link2, Clapperboard, Wand2, Server, Sparkles, Flag,
} from "lucide-react";
import { ADMIN_ONLY_PATHS } from "@/config/featureFlags";

type Phase = {
  range: string;
  clients: string;
  infra: string;
  cost: string;
  action: string;
  threshold: number;
};

const PHASES: Phase[] = [
  {
    range: "Hoje → 50",
    clients: "0-50",
    infra: "Nada (navegador do cliente gera os reels)",
    cost: "R$ 0",
    action: "Focar em vender. Arquitetura atual aguenta.",
    threshold: 0,
  },
  {
    range: "50 → 300",
    clients: "até 300",
    infra: "1 PC seu em casa rodando como worker global 24/7",
    cost: "R$ 30/mês (luz)",
    action: "Implementar worker em Node.js + FFmpeg no PC de casa. Roda fila do Supabase.",
    threshold: 50,
  },
  {
    range: "300+",
    clients: "300 → 5k+",
    infra: "2-3 VPS + load balancer + painel de monitoramento",
    cost: "R$ 150-300/mês",
    action: "Pular direto pra infra robusta — com ~R$ 30k de faturamento, R$ 300/mês é irrisório. Múltiplos workers consumindo a mesma fila, escala horizontal.",
    threshold: 300,
  },
];

// ---------------------------------------------------------------------------
// Pequenos componentes pra deixar o template do card limpinho.
// ---------------------------------------------------------------------------

function SectionHeader({
  icon: Icon, number, title, subtitle,
}: { icon: any; number: string; title: string; subtitle: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
          {number}
        </div>
        <Icon className="h-4 w-4 text-primary" />
        <h3 className="font-semibold text-base">{title}</h3>
      </div>
      <p className="text-sm text-muted-foreground pl-9">{subtitle}</p>
    </div>
  );
}

function PhaseRow({
  icon: Icon, title, status, statusVariant, children,
}: {
  icon: any;
  title: string;
  status?: string;
  statusVariant?: "active" | "next" | "future";
  children: React.ReactNode;
}) {
  const border =
    statusVariant === "active"
      ? "border-primary/40 bg-primary/5"
      : statusVariant === "next"
      ? "border-amber-500/40 bg-amber-500/5"
      : "border-border/60";
  const badge =
    statusVariant === "active" ? (
      <Badge className="bg-primary ml-auto">{status}</Badge>
    ) : statusVariant === "next" ? (
      <Badge variant="outline" className="ml-auto border-amber-500/60 text-amber-500">{status}</Badge>
    ) : status ? (
      <Badge variant="outline" className="ml-auto">{status}</Badge>
    ) : null;

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${border}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium text-sm">{title}</span>
        {badge}
      </div>
      <div className="text-xs text-muted-foreground space-y-1">{children}</div>
    </div>
  );
}

export function RoadmapCard({ totalClients }: { totalClients: number }) {
  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Map className="h-5 w-5 text-primary" />
          Planejamento do produto
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Três frentes que evoluem em paralelo: <strong>infraestrutura</strong> (quando escalar),{" "}
          <strong>rollout de features</strong> (como liberar sem quebrar) e{" "}
          <strong>novas funcionalidades</strong> (o que vem por aí).
          Hoje você tem <strong className="text-foreground">{totalClients}</strong> cliente(s) ativo(s).
        </p>
      </CardHeader>

      <CardContent className="space-y-8">
        {/* =================================================================
            1. INFRAESTRUTURA
           ================================================================= */}
        <section className="space-y-3">
          <SectionHeader
            icon={Server}
            number="1"
            title="Infraestrutura — escalar só quando precisar"
            subtitle="Cada fase é atacada quando chegar lá, não antes. Sem gastar com servidor que ninguém usa."
          />

          <div className="space-y-3">
            {PHASES.map((p, i) => {
              const reached = totalClients >= p.threshold;
              const current =
                reached &&
                (i === PHASES.length - 1 || totalClients < PHASES[i + 1].threshold);
              const nextUp =
                !reached &&
                (i === 0 || totalClients >= PHASES[i - 1].threshold);

              return (
                <div
                  key={p.range}
                  className={`rounded-lg border p-4 transition-colors ${
                    current
                      ? "border-primary/60 bg-primary/5"
                      : nextUp
                      ? "border-amber-500/50 bg-amber-500/5"
                      : "border-border/60"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2">
                      {current ? (
                        <Rocket className="h-4 w-4 text-primary" />
                      ) : nextUp ? (
                        <AlertTriangle className="h-4 w-4 text-amber-500" />
                      ) : reached ? (
                        <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <div className="h-4 w-4 rounded-full border border-border" />
                      )}
                      <span className="font-semibold">{p.range}</span>
                      <Badge variant="outline" className="text-xs">{p.clients}</Badge>
                    </div>
                    {current && <Badge className="bg-primary">Você está aqui</Badge>}
                    {nextUp && <Badge className="bg-amber-500 text-black">Próxima meta</Badge>}
                  </div>
                  <div className="grid md:grid-cols-3 gap-2 text-sm">
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Infra</p>
                      <p>{p.infra}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Custo/mês</p>
                      <p className="font-mono">{p.cost}</p>
                    </div>
                    <div>
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">O que fazer</p>
                      <p>{p.action}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-3 rounded-lg bg-muted/40 border border-border/60 text-xs text-muted-foreground">
            <strong className="text-foreground">Premissa:</strong> mix realista de ~15-20 reels/dia/cliente
            (limite Meta: ~50 posts/dia/conta). Plano Start = 30 posts/dia, plano premium = 60 posts/dia.
          </div>
        </section>

        <Separator />

        {/* =================================================================
            2. ROLLOUT DE FEATURES
           ================================================================= */}
        <section className="space-y-3">
          <SectionHeader
            icon={Flag}
            number="2"
            title="Como liberamos features novas"
            subtitle="Toda novidade passa por 3 portas antes de chegar pra todo mundo. Reduz risco de quebrar quem já paga."
          />

          <PhaseRow icon={Lock} title="Porta 1 — só admin (hoje)" status="ativo" statusVariant="active">
            <p>Você testa em produção sozinho. Clientes não veem no menu nem conseguem abrir a URL.</p>
            <p className="pt-1"><span className="text-foreground font-medium">Hoje em teste:</span></p>
            <ul className="pl-4 list-disc space-y-0.5">
              {ADMIN_ONLY_PATHS.map(p => <li key={p}><code className="text-foreground">{p}</code></li>)}
            </ul>
          </PhaseRow>

          <PhaseRow icon={Users} title="Porta 2 — beta fechado (3-5 clientes)" status="próximo" statusVariant="next">
            <p>
              Escolhe 3 a 5 clientes que dão bom feedback e adiciona o <code>user_id</code> deles em{" "}
              <code>BETA_USER_IDS</code> (arquivo <code>featureFlags.ts</code>). Eles passam a ver a feature; o resto continua sem.
            </p>
          </PhaseRow>

          <PhaseRow icon={Unlock} title="Porta 3 — liberação geral">
            <p>
              Quando estabilizar (sem erros nos logs por ~1 semana e feedback positivo do beta),
              tira o path de <code>ADMIN_ONLY_PATHS</code>. Aí entra pra todos os planos pagos.
            </p>
          </PhaseRow>
        </section>

        <Separator />

        {/* =================================================================
            3. FEATURE NOVA EM CONSTRUÇÃO
           ================================================================= */}
        <section className="space-y-3">
          <SectionHeader
            icon={Sparkles}
            number="3"
            title="Próxima feature — Reels por Link"
            subtitle="Usuário cola um link de Reels/TikTok/Shorts e a IA recria o conteúdo. Entrega em 3 fases — a primeira já dá pra ligar agora."
          />

          <PhaseRow icon={Link2} title="Fase 1 — Roubar pauta" status="dá pra ligar hoje" statusVariant="active">
            <ol className="pl-4 list-decimal space-y-0.5">
              <li>Usuário cola o link do vídeo</li>
              <li>Sistema extrai transcrição/áudio com IA</li>
              <li>IA gera pauta + roteiro novos no estilo do canal</li>
              <li>Usuário grava manualmente seguindo o roteiro</li>
            </ol>
            <p className="pt-1">
              <strong className="text-foreground">Sem infra nova:</strong> roda 100% em Edge Function (limite 150s).
              Custo ~R$ 0,02 por vídeo em créditos de IA.
            </p>
          </PhaseRow>

          <PhaseRow icon={Wand2} title="Fase 2 — Reels IA (vídeo gerado do zero)" status="depende da infra fase 2" statusVariant="next">
            <ul className="pl-4 list-disc space-y-0.5">
              <li>IA monta vídeo <strong>novo</strong> com imagens stock + voz sintetizada + trilha livre</li>
              <li>Zero risco de copyright — conteúdo 100% original</li>
              <li>Aplica template do canal (overlay, cores, fonte)</li>
            </ul>
            <p className="pt-1">
              <strong className="text-foreground">Precisa do worker da fase 2 da infra</strong> (PC em casa com FFmpeg).
              Custo ~R$ 0,10/vídeo vs R$ 5-15 cobrados por Submagic/OpusClip.
            </p>
          </PhaseRow>

          <PhaseRow icon={Clapperboard} title="Fase 3 — Repost inteligente">
            <ul className="pl-4 list-disc space-y-0.5">
              <li>Baixa o vídeo original, remove marca d'água/créditos</li>
              <li>Aplica template do canal e gera legenda nova</li>
              <li>Reposta com crédito ou como conteúdo próprio</li>
            </ul>
            <p className="pt-1">
              <strong className="text-foreground">Só pra nichos seguros</strong> (motivação, finanças, saúde).
              Fofoca/entretenimento = risco de ban por direitos autorais.
            </p>
          </PhaseRow>
        </section>
      </CardContent>
    </Card>
  );
}
