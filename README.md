# Flux & Feed

Plataforma SaaS de automação editorial e publicação para Instagram. O Flux & Feed transforma notícias, fontes RSS, pautas e vídeos em conteúdo preparado para Feed, Reels, Stories e carrosséis, mantendo identidade, limites e configurações independentes por conta Instagram.

> **Regra de contexto:** antes de trabalhar no projeto, leia integralmente `README.md`, `PRODUCT.md`, `ARCHITECTURE.md`, `TASKS.md` e `HANDOFF.md`. Esses arquivos são a fonte principal de contexto; o histórico de chats é apenas complementar.

## Estado confirmado desta árvore

Documentação reconciliada em **2026-08-01** com a `origin/main`, o banco e o frontend Pix live publicados.

- Release funcional publicada confirmada: `6b362bf`, merge do PR [#45](https://github.com/franciscocastro-svg/feed-bot-ai/pull/45), com fluxo administrativo Pix sempre em `live`.
- O PR #42 integrou a correção Pix/manual, 19 testes de regressão e os cinco documentos reconciliados.
- Os PRs #30 a #41 e respectivos commits de quatro planos, Stripe, identidade, fontes, legendas, imagens e Piloto Editorial estão presentes na ancestralidade da `main`.
- Validação do release: `npm run ci` aprovado com scanner de secrets, typecheck, lint por fases, 544 testes principais, 33 testes herméticos de deploy, 15 testes de reconciliação, worker, gates de migrations/MCP e build Vite.
- O Lovable sincronizou e publicou `6b362bf`; [feed-bot-ai.lovable.app](https://feed-bot-ai.lovable.app) redireciona para [fluxifeed.com](https://fluxifeed.com). O bundle público contém a nova ação Pix.
- A migration `20260801134000` foi aplicada e registrada no histórico do Supabase. O cliente afetado recebeu assinatura Creator/`starter` Pix em `live`, válida por um mês, a RPC confirmou `has_access=true` e o cliente confirmou o acesso autenticado.
- Edge Functions, catálogo Stripe, Meta e worker VPS continuam dependendo de auditoria separada.
- A pasta original `/Users/decastro/Downloads/feed-bot-ai-main` permanece intacta e contém mudanças locais que não devem ser incluídas ou apagadas sem autorização. Consulte `HANDOFF.md`.

Use estas etiquetas na documentação:

- **Confirmado na `main`:** código funcional Pix live integrado em `6b362bf`.
- **Confirmado externamente:** migration, liberação do cliente e publicação Lovable executadas em 2026-08-01.
- **Confirmado por teste local:** reproduzido na worktree limpa.
- **Revalidar externamente:** depende de GitHub Actions, Supabase, Stripe, Meta, Lovable ou VPS.

## Objetivo do sistema

O Flux & Feed reduz o trabalho manual necessário para manter perfis de Instagram ativos. O sistema:

1. captura notícias e temas de fontes configuradas;
2. filtra, deduplica e adapta conteúdo ao nicho e à voz de cada conta;
3. gera arte, legenda, Reel, Story ou carrossel;
4. agenda e publica pela API oficial da Meta;
5. acompanha filas, limites, assinaturas e saúde operacional;
6. transforma vídeos longos em cortes curtos com o worker e FFmpeg;
7. propõe, em preview local, uma estratégia editorial por Instagram.

## Tecnologias

| Camada | Tecnologias principais |
|---|---|
| Frontend | React 18, TypeScript, Vite 5, Tailwind CSS, Radix UI, TanStack Query, React Router 7, Zod |
| Backend | Supabase/PostgreSQL, Supabase Auth, Storage e Edge Functions em Deno/TypeScript |
| Processamento | Node.js, `@napi-rs/canvas`, FFmpeg/ffprobe e yt-dlp |
| IA | Gemini, Groq e gateway Lovable; xAI/Grok opcional no worker para análise de cortes |
| Publicação | Meta Instagram Graph API |
| Pagamentos | Stripe Checkout, Billing Portal, webhooks e reconciliação; liberação manual/Pix no banco |
| Qualidade | Vitest, TypeScript, ESLint por fases, secret scan, lint ratchet e gates operacionais |
| Operação | VPS com PM2, nginx, fila durável e webhook de deploy controlado |

OpenRouter permanece apenas no backlog. Não confundir o adaptador xAI já existente no worker com uma integração OpenRouter.

## Estrutura de pastas

```text
.
├── docs/                   # Runbooks, diagnósticos e documentação histórica
├── ops/                    # Evidências e artefatos operacionais
├── public/                 # Assets públicos do frontend
├── quality/                # Baselines e controles de qualidade
├── scripts/                # CI, auditorias, deploy e reconciliação
├── src/
│   ├── components/         # UI e componentes de negócio
│   ├── config/             # Feature flags
│   ├── contexts/           # Autenticação, idioma e estado transversal
│   ├── integrations/       # Cliente e tipos do Supabase
│   ├── lib/                # Regras e contratos compartilhados
│   ├── pages/              # Site, autenticação, dashboard e administração
│   └── test/               # Testes de regressão e contratos
├── supabase/
│   ├── functions/          # Edge Functions e módulos `_shared`
│   └── migrations/         # Histórico SQL append-only
├── worker/                 # Render, mídia, cortes e filas da VPS
├── README.md
├── PRODUCT.md
├── ARCHITECTURE.md
├── TASKS.md
└── HANDOFF.md
```

## Como executar

### Pré-requisitos

- Node.js 20 ou versão compatível mais recente;
- npm;
- acesso a um projeto Supabase para fluxos integrados;
- FFmpeg, ffprobe e yt-dlp para o worker;
- Supabase CLI/Deno quando houver validação de Edge Functions ou migrations.

### Instalação

```bash
npm ci
cp .env.example .env.local
npm run dev
```

O Vite usa, por padrão, a porta `8080`. Preencha `.env.local` somente com valores adequados ao ambiente e nunca versione chaves secretas.

### Variáveis do frontend

```dotenv
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_PAYMENTS_CLIENT_TOKEN=
VITE_FEATURE_EDITORIAL_PILOT_PREVIEW=false

# Opcionais
VITE_META_PIXEL_ID=
VITE_GOOGLE_ANALYTICS_ID=
VITE_FFMPEG_CORE_URL=
VITE_SUPABASE_ANON_KEY=
```

`VITE_PAYMENTS_CLIENT_TOKEN` deve ser uma chave publicável Stripe: `pk_test_` em sandbox e `pk_live_` em produção. O arquivo rastreado `.env.development` habilita o Piloto apenas para desenvolvimento/preview; `.env.example` mantém a flag desligada.

### Worker

O worker usa `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` no backend, além das credenciais dos provedores habilitados. Consulte `worker/.env.example` e `worker/README.md`. Secrets nunca pertencem ao frontend.

## Scripts importantes

| Script | Uso |
|---|---|
| `npm run dev` | servidor Vite local |
| `npm run build` | build de produção |
| `npm run typecheck` | TypeScript do app e scripts Node |
| `npm run test` | suíte Vitest |
| `npm run check:worker` | sintaxe dos módulos do worker |
| `npm run check:delivery` | gates herméticos de deploy e reconciliação |
| `npm run check:production-audit` | contrato da auditoria de produção |
| `npm run check:secrets` | detecção de credenciais indevidas |
| `npm run check:lint-ratchet` | prevenção de regressão do baseline de lint |
| `npm run check:edge-functions` | cobertura das Edge Functions |
| `npm run check:mcp-build` | build reprodutível do MCP |
| `npm run ci` | pipeline local completo |

O gate `entrega-segura-1a-deploy.test.ts` pode depender de `/usr/bin/grep` em alguns sandboxes. A validação de 2026-08-01 passou integralmente na worktree limpa.

## Integrações e ofertas

- **Supabase:** Auth, Postgres, RLS/RPC, Storage, cron e Edge Functions.
- **Meta:** OAuth/manual, tokens, publicação, métricas e consumo de API.
- **Stripe:** Creator, Pro e Business usam checkout com cartão; Agência usa contato comercial.
- **Pix/manual:** o administrador financeiro informa plano e valor recebido; o sistema cria ou renova por um mês uma assinatura `live`, sem cartão ou IDs Stripe.
- **IA:** Gemini, Groq e Lovable em fluxos distintos; xAI é opcional para análise de cortes no worker.
- **VPS:** renderização, captura, cortes, mídia e processos PM2.

Ofertas confirmadas no código:

| Plano | Preço-base no banco | Instagram | Publicações/dia por Instagram |
|---|---:|---:|---:|
| Creator (`starter`) | R$ 97,97 | 1 | 20 |
| Pro | R$ 197,97 | 3 | 30 |
| Business | R$ 437,97 | 10 | 40 |
| Agência | negociável | 50 | 60 |

Os valores reais do catálogo Stripe live precisam ser revalidados externamente antes de venda.

## Convenções obrigatórias

1. **Isolamento por conta:** todo fluxo específico usa `instagram_account_id`.
2. **Fail-closed:** autorização, credencial, contrato, orçamento ou estado inválido interrompem a ação sensível.
3. **Secrets no backend:** nunca colocar service role, token Meta ou chave secreta em `VITE_*`, logs, commits ou prompts.
4. **Contratos validados:** respostas de IA e payloads críticos usam JSON estruturado e validação.
5. **Feature flags off por padrão:** ativação em desenvolvimento não implica produção.
6. **Preview sem escrita:** o Piloto não cria fontes, pautas, configurações, filas nem publicações.
7. **Deploy controlado:** confirmar SHA, migrations, funções, artefato, health check e rollback.
8. **Documentação obrigatória:** finalizar trabalho inclui atualizar os cinco documentos da raiz.
9. **Preservar trabalho local:** não apagar, resetar ou misturar alterações do usuário.
10. **Idioma e fuso:** UI principal em português do Brasil e operação em `America/Sao_Paulo` quando aplicável.

## Próximo passo

O cliente Pix confirmou que já consegue entrar. A auditoria seguinte identificou o próximo P0: uma assinatura Agência Pix `live` está ativa e registra o valor negociado, mas `get_user_plan()` ainda pode selecionar uma linha Business `sandbox`, fazendo limites e cartão de uso aparecerem como Business. O financeiro também calcula Agência pelo preço-base nulo e ignora o valor manual. O próximo passo exato é tornar a resolução de plano `live` determinística e fazer MRR/listagens usarem `manual_amount_paid_brl` para Pix.
