# Flux & Feed

Plataforma SaaS de automação editorial e publicação para Instagram. O Flux & Feed transforma notícias, fontes RSS, pautas e vídeos em conteúdo preparado para Feed, Reels, Stories e carrosséis, mantendo identidade, limites e configurações independentes por conta Instagram.

> **Regra de contexto:** antes de trabalhar no projeto, leia integralmente `README.md`, `PRODUCT.md`, `ARCHITECTURE.md`, `TASKS.md` e `HANDOFF.md`. Esses arquivos são a fonte principal de contexto; o histórico de chats é apenas complementar.

## Estado confirmado desta árvore

Documentação reconciliada em **2026-08-02** com a `origin/main`, as publicações Lovable, o worker da VPS e o smoke autenticado do Corte Editorial.

- **Programa de afiliados em revisão, sem implantação:** o PR rascunho [#70](https://github.com/franciscocastro-svg/feed-bot-ai/pull/70), branch `codex/affiliate-referrals` e commit `fbc7153`, adiciona ativação exclusiva pelo admin, link `?ref=`, atribuição imutável de novos cadastros, painel privado com métricas agregadas e gestão administrativa de ativação/pausa. A migration `20260802230000_affiliate_referrals.sql` ainda não foi aplicada; nenhum dado, plano, pagamento, Edge Function, worker ou frontend de produção foi alterado.
- **Corte Editorial aprovado no smoke autenticado:** os PRs [#60](https://github.com/franciscocastro-svg/feed-bot-ai/pull/60), [#61](https://github.com/franciscocastro-svg/feed-bot-ai/pull/61), [#62](https://github.com/franciscocastro-svg/feed-bot-ai/pull/62), [#64](https://github.com/franciscocastro-svg/feed-bot-ai/pull/64), [#66](https://github.com/franciscocastro-svg/feed-bot-ai/pull/66) e [#67](https://github.com/franciscocastro-svg/feed-bot-ai/pull/67) foram integrados. O teste real confirmou Reel 1080 × 1920, trecho de 52 segundos, texto com 100% de confiança, identidade da conta selecionada e ausência de publicação automática.
- **Worker sincronizado com a correção:** em 2026-08-02, o deploy `DEPLOY_PM2_SCOPE=cuts-only` instalou exatamente `efc8d15a9b1a5ff00f6fc0fa3c9bc7d906d30f9c` e reiniciou somente `feedbot-cuts`. Foram aprovados 588 testes principais, 36 de deploy, 24 de reconciliação, sintaxe do worker, nginx e health HTTP 200; `feedbot-media` e `feedbot-webhook` conservaram seus PIDs. Feed 4:5 e Reel 9:16 permanecem sem autopublicação e agora aguardam o smoke com fala real.
- **Correção do smoke implantada no worker:** o PR [#66](https://github.com/franciscocastro-svg/feed-bot-ai/pull/66) foi integrado no merge `bdd5c6d`. O erro `invalid input syntax for type integer: "45.24"` foi corrigido persistindo início/fim/duração inteiros, sem ultrapassar a duração física do arquivo. Para recuperar a velocidade de vídeos de 60 minutos, arquivos com 10 minutos ou 100 MB passam por uma única análise multimodal via Gemini Files API; somente os candidatos escolhidos são extraídos e transcritos para legenda/texto. Vídeos curtos preservam a transcrição segmentada de 120 segundos e a rota segmentada continua como contingência. Se a transcrição ainda falhar, o job preserva a prévia neutra com 0% de confiança e `Revisão necessária`, em vez de publicar ou falhar por completo.
- **VPS atualizada somente em Cortes:** em 2026-08-02, `DEPLOY_PM2_SCOPE=cuts-only` instalou exatamente `bdd5c6dd396709bae0e6001413f64aba424585b2`. Foram aprovados 597 testes principais, 36 de deploy, 24 de reconciliação, sintaxe do worker, nginx e health. Somente `feedbot-cuts` reiniciou; `feedbot-media` e `feedbot-webhook` conservaram os PIDs. As duas leituras intermediárias de health, com 786 ms e 6.188 ms de uptime, eram a espera prevista pelo mínimo de 10 segundos; a verificação final passou e o deploy terminou `SUCCEEDED`/`target_healthy`.
- **Mínimo e identidade do Corte Editorial implantados:** o PR [#67](https://github.com/franciscocastro-svg/feed-bot-ai/pull/67) foi integrado no merge `40a8c0e`. A Lovable aplicou `20260802200000_enforce_editorial_cut_identity_duration.sql`, registrada como `20260802203258_da42777e-cf44-48e0-a74d-087248349ad8.sql`, recarregou o schema e publicou o frontend. A VPS instalou o SHA exato com `DEPLOY_PM2_SCOPE=cuts-only`; somente `feedbot-cuts` reiniciou e o health terminou `SUCCEEDED`/`target_healthy`. O Corte Editorial exige pelo menos 20 segundos, usa a identidade da conta selecionada e só mostra selo quando a Meta confirma a verificação.
- **Cancelamento de fila integrado, com rollout externo ainda a conferir:** o PR [#68](https://github.com/franciscocastro-svg/feed-bot-ai/pull/68) foi integrado no merge `9c0775c`; a `main` avançou depois para `a1d4d46` por commits automáticos da plataforma. `Cancelar fila` aparece somente para jobs `queued`, `analyzing` ou `processing`; a RPC bloqueia a linha, valida proprietário/admin, marca apenas o job escolhido como `cancelled` e libera sua reserva diária de forma idempotente. O worker verifica cancelamento entre etapas pesadas, impede conclusão/autopublicação posterior e remove artefatos parciais; outros jobs e processos PM2 não são interrompidos. O histórico Git da plataforma chegou a registrar uma cópia timestampada da migration e depois a removeu como duplicata, mas banco publicado, frontend público e VPS ainda precisam ser confirmados separadamente antes do smoke.
- **Correção de atualização do vídeo final integrada:** o PR [#69](https://github.com/franciscocastro-svg/feed-bot-ai/pull/69) foi integrado na `main` pelo merge `a3ce6fe`. A atualização automática agora é adiada apenas enquanto há reprodução real ou por dez segundos após a última interação. A UI consulta a fila de rerender, diferencia `Vídeo final na fila` de `Renderizando vídeo final`, bloqueia cliques duplicados e libera `Aprovar e agendar` assim que `video_url` e a confirmação chegam. Não há migration, Edge Function ou worker nessa correção; o estado publicado deve ser confirmado separadamente.
- A validação dessa correção aprovou scanner de segredos em 685 arquivos, typecheck, lints, 614 testes principais, 36 testes herméticos de deploy, 24 de reconciliação, sintaxe do worker, gates editoriais/MCP e build Vite.
- A validação local do cancelamento aprovou typecheck, lint dos arquivos alterados, sintaxe completa do worker, build Vite, 30 testes direcionados e todos os 608 testes principais. Cinco casos que abrem servidor local precisaram ser repetidos fora do sandbox e passaram junto com a regressão mobile, totalizando 21/21 no rerun.
- A validação desse ajuste aprovou 31 testes direcionados e o CI completo: scanner de segredos em 681 arquivos, typecheck, lints, 603 testes principais, 36 de deploy, 24 de reconciliação, sintaxe do worker, gates editoriais/MCP e build Vite.
- **Resultado anterior observado às 15:47:** o job iniciado às 15:12 chegou a `Pronto para revisão` e gerou uma prévia editorial de 35 segundos com fallback neutro, confiança 0% e formato divergente. Esses problemas foram corrigidos pelos PRs #66/#67 e o smoke autenticado posterior confirmou fala, identidade, duração e Reel 9:16 corretos.
- A validação dessa correção aprovou secret scan em 676 arquivos, typecheck, lints, 588 testes principais, 36 testes herméticos de deploy, 24 de reconciliação, worker, gates de migrations/MCP e build Vite. Um smoke FFmpeg sintético adicional confirmou Reel 1080×1920, H.264/yuv420p e AAC 48 kHz, sem banco, Storage ou publicação.
- Os dois erros do primeiro teste tiveram uma única causa: frontend novo contra schema antigo. A auditoria encontrou quatro jobs anteriores como `failed`/`Object not found`, sem clipes, agendamentos ou publicações; os arquivos de entrada correspondentes não existem mais no Storage.
- A validação local desta branch aprovou secret scan em 674 arquivos, typecheck, lint sem regressão, 586 testes principais, 35 testes herméticos de deploy, 24 de reconciliação, worker, gates, MCP e build Vite. Três testes antigos excederam o timeout apenas durante execuções concorrentes e passaram quando repetidos isoladamente.
- O `Validate application` do PR #61 passou antes do merge; a implantação do banco confirmou `cut_mode`, sete colunas `editorial_*`, três RPCs, dois triggers e ACL exclusiva de `authenticated`. A Edge respondeu 401 sem `Authorization`.
- O check remoto `Validate application` do PR #60 passou em 2m01s para o head funcional/documental `5dee08a`.
- A validação física isolada gerou três MP4 de 6 segundos — vertical, horizontal e baixa resolução — em 1080×1350, H.264/yuv420p e AAC, sem banco ou publicação. O teste revelou e corrigiu a reamostragem desnecessária do áudio para 96 kHz; o Corte Editorial agora fixa 48 kHz. O usuário aprovou visualmente a demonstração. Como o arquivo original não contém áudio, a sincronia foi verificada com faixa e legendas sintéticas; resta um futuro smoke com fala real.
- **Inconsistência externa identificada após o registro do PR #59:** a VPS avançou para `fbe6a2a` e os três processos permanecem online com health HTTP 200, porém a automação voltou a registrar `deploy_process_exit_unobserved` após receber `SIGINT` durante o próprio reload do webhook. O bloqueio não deve ser removido nem misturado ao Corte Editorial; exige correção operacional separada.

- Release funcional publicada confirmada: `6b362bf`, merge do PR [#45](https://github.com/franciscocastro-svg/feed-bot-ai/pull/45), com fluxo administrativo Pix sempre em `live`.
- Correção Agência/financeiro publicada: `e163226`, merge do PR [#49](https://github.com/franciscocastro-svg/feed-bot-ai/pull/49), com check remoto verde.
- O PR #42 integrou a correção Pix/manual, 19 testes de regressão e os cinco documentos reconciliados.
- Os PRs #30 a #41 e respectivos commits de quatro planos, Stripe, identidade, fontes, legendas, imagens e Piloto Editorial estão presentes na ancestralidade da `main`.
- Validação da correção Agência: `npm run ci` aprovado com scanner de secrets, typecheck, lint por fases, 548 testes principais, 33 testes herméticos de deploy, 15 testes de reconciliação, worker, gates de migrations/MCP e build Vite.
- O Lovable sincronizou e publicou `6b362bf`; [feed-bot-ai.lovable.app](https://feed-bot-ai.lovable.app) redireciona para [fluxifeed.com](https://fluxifeed.com). O bundle público contém a nova ação Pix.
- A migration `20260801134000` foi aplicada e registrada no histórico do Supabase. O cliente afetado recebeu assinatura Creator/`starter` Pix em `live`, válida por um mês, a RPC confirmou `has_access=true` e o cliente confirmou o acesso autenticado.
- A migration `20260801144500` foi aplicada e registrada; o resolvedor legado consulta somente a assinatura `live` não terminal mais recente e permite substituir por Pix apenas tentativas Stripe já canceladas, inadimplentes ou expiradas.
- A área administrativa publicada exibe `Creator`, `Pro`, `Business` e `Agência`; a chave interna `starter` permanece apenas como contrato técnico compatível com banco e Stripe.
- O financeiro publicado prioriza o valor efetivamente registrado no Pix por cliente, inclusive em planos negociáveis como Agência.
- O smoke autenticado confirmou Agência, limites 50/60/100, valor Pix de R$ 1.500,00 e MRR recalculado, sem erro do aplicativo no console.
- O PR [#51](https://github.com/franciscocastro-svg/feed-bot-ai/pull/51) foi integrado na `main` pelo merge `ad39d3e` e conecta o Perfil do Criador à descoberta real de RSS/monitoramento temático, com seleção, resumo e aplicação transacional/idempotente. Migration e Edge Function já foram implantadas; o frontend ainda não foi publicado.
- O pipeline completo da Fase 2A passou localmente: secret scan em 663 arquivos, typecheck, lint ratchet/fases, 551 testes principais, 33 testes herméticos de deploy, 15 testes de reconciliação, worker, gates de migrations/MCP e build Vite.
- O check remoto `Validate application` do PR #51 foi aprovado para o head final `401d849` antes do merge.
- O registro pós-merge do PR documental [#52](https://github.com/franciscocastro-svg/feed-bot-ai/pull/52) foi integrado na `main` pelo merge `1278649`, sem alterações de produto ou deploy.
- A migration `20260801170000_editorial_pilot_phase_2a.sql` foi aplicada e registrada no Supabase conectado em 2026-08-01. A tabela e a RPC existem, `authenticated` pode executar, `anon` não pode e ainda não há aplicações gravadas.
- `discover-rss` foi publicada pela Lovable a partir de `1278649` em 2026-08-01 17:43:35 UTC. Um smoke independente confirmou `401 {"error":"unauthorized"}` sem credenciais. O frontend não foi publicado e a flag de produção não foi ativada.
- Apesar de a resposta operacional afirmar que não criaria commit, a sincronização da Lovable criou diretamente na `main` o commit `e290ac0` (“Publicou discover-rss”), atualizando somente `src/integrations/supabase/types.ts` com a tabela/RPC recém-implantadas e nullability regenerada. A divergência foi identificada e documentada antes do frontend.
- O CI completo foi reexecutado sobre `e290ac0`: 551 testes principais, 33 testes herméticos de deploy, 15 de reconciliação, typecheck, gates editoriais/MCP e build aprovados.
- O primeiro teste autenticado do preview encontrou fontes reais, mas a confirmação falhou sem gravar fontes, pautas ou ledger. A causa exata foi a ausência, no banco publicado, de `news_sources.source_fingerprint` e de `compute_source_fingerprint(...)`, dependências que a RPC da Fase 2A presumiu disponíveis.
- A correção foi integrada pelo PR [#53](https://github.com/franciscocastro-svg/feed-bot-ai/pull/53), merge `1cb14c5`: migration aditiva de compatibilidade, erro de aplicação tratado separadamente na interface e na Edge, catálogo de entretenimento atualizado com os feeds oficiais de Quem e Metrópoles e relevância ampliada.
- A auditoria das rejeições confirmou como corretas Fofocalizando (amostra antiga), Contigo! (endereço indisponível) e Observatório da TV (RSS 404). Quem e Metrópoles eram falsos negativos; o fallback antigo do UOL Splash também retornava 404 e foi removido.
- O CI completo da correção passou: secret scan em 664 arquivos, typecheck, lints, 555 testes principais, 33 testes herméticos de deploy, 15 de reconciliação, worker, gates de migrations/MCP e build Vite.
- O check remoto `Validate application` do PR #53 também foi aprovado para o commit funcional `80debad`.
- A Lovable aplicou a compatibilidade no Supabase sob a versão real `20260801185731`, verificou coluna, função e trigger, completou o backfill de 59 fontes sem fingerprints vazios e republicou somente `discover-rss` em 2026-08-01 18:58 UTC. O teste anônimo permaneceu em HTTP 401 e o preview está pronto para o smoke autenticado; o frontend de produção não foi publicado.
- A operação criou automaticamente o merge `3512454` na `main`, adicionando o arquivo de migration com o timestamp da plataforma e a assinatura gerada da RPC nos tipos. A branch de reconciliação mantém somente a migration registrada `20260801185731`, eliminando a cópia idêntica não registrada `20260801183000`.
- O PR #54 reconciliou essa duplicação no merge `47a6652`. No segundo smoke autenticado, a descoberta e a mensagem segura funcionaram, mas a RPC abortou novamente com SQLSTATE `42702`: a variável PL/pgSQL `source_id` ficou ambígua na cláusula `ON CONFLICT (source_id, instagram_account_id)`. O rollback foi integral e as contagens de aplicações, fontes e pautas do Piloto permaneceram em zero.
- A correção mínima foi integrada pelo PR #55 no merge `d0dc3da` e registrada pela Lovable como `20260801194149_7a4ced9b-6085-4bb9-abdf-dd20361654dc.sql`: renomeia a variável para `v_source_id`, referencia explicitamente a PK `news_source_instagram_accounts_pkey` e contabiliza vínculos pelo `ROW_COUNT`. Não exigiu nova publicação de Edge ou frontend.
- O CI completo dessa correção passou: secret scan em 665 arquivos, typecheck, lints, 555 testes principais, 33 testes herméticos de deploy, 15 de reconciliação, gates de migrations/MCP e build Vite.
- A operação Lovable substituiu o nome da migration e ajustou somente o caminho do teste, criando o merge automático final `2b65b49` na `main`; o SQL permaneceu equivalente e 18/18 testes direcionados passaram.
- O terceiro smoke autenticado passou em 2026-08-01: a proposta selecionou 7 fontes e 4 pautas; o resultado criou 4 fontes novas, 4 vínculos novos e 4 pautas, sem publicação. A verificação somente leitura confirmou 1 ledger, todas as 7 fontes resolvidas/vinculadas e as 4 pautas presentes, sem duplicação. O replay continua pendente.
- O PR [#57](https://github.com/franciscocastro-svg/feed-bot-ai/pull/57) integrou a melhoria de imagens no merge `c4e703d`: miniaturas fracas são reconhecidas, a imagem principal da própria matéria é priorizada por metadados e resolução, a miniatura continua como último recurso e sua ampliação é limitada no Canvas/worker. No caso real, a origem passou de uma miniatura Bing 100×100 para a imagem relacionada de 1200×747.
- O CI do PR #57 passou. A Lovable sincronizou `c4e703d`, publicou o frontend e republicou somente `fetch-rss`, `preview-source` e `discover-rss`; não aplicou migrations nem alterou dados, secrets ou configurações. Imagens já geradas não mudam sem nova captura/regeneração.
- A auditoria anterior à recuperação encontrou o worker em `a2be3f5`, com PM2 saudável e `/deploy-health` em HTTP 200, mas com uma implantação interrompida por `SIGINT`, estado bloqueado e 42 itens acumulados; antes do PR #58, `c4e703d` era o último item único e aprovado, sem resultado terminal.
- O PR [#58](https://github.com/franciscocastro-svg/feed-bot-ai/pull/58) integrou a recuperação segura da fila no merge `93ae2a3`. O check remoto final passou para `df33a08`; localmente foram aprovados secret scan em 668 arquivos, typecheck, lints, 571 testes principais, 35 testes herméticos de deploy, 24 testes de reconciliação, worker, gates e build Vite.
- A recuperação foi executada na VPS em 2026-08-02: plano e scripts foram validados por SHA-256, o estado interrompido e os 43 releases substituídos foram preservados em evidência privada, e a fila foi reduzida ao merge final sem executar os releases intermediários.
- Somente `feedbot-media` foi implantado em `93ae2a3`; `feedbot-cuts` e `feedbot-webhook` não foram reiniciados. Testes, nginx, PM2 e health passaram, a fila terminou vazia, `BLOCKED.json` foi removido por último e o resultado terminal foi registrado como `succeeded`/`mediaOnly=true`.
- Catálogo Stripe e Meta continuam dependendo de auditoria separada.
- A pasta original `/Users/decastro/Downloads/feed-bot-ai-main` permanece intacta e contém mudanças locais que não devem ser incluídas ou apagadas sem autorização. Consulte `HANDOFF.md`.

Use estas etiquetas na documentação:

- **Confirmado na `main`:** Pix live em `6b362bf` e correção Agência/financeiro em `e163226`.
- **Confirmado externamente:** migrations, liberação do cliente, publicação Lovable e smoke autenticado executados em 2026-08-01.
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
7. propõe uma estratégia editorial por Instagram e, mediante confirmação, prepara fontes e pautas isoladas para a conta.
8. prepara Cortes Editoriais em Feed 4:5 ou Reel 9:16 com texto factual, identidade, vídeo central e revisão humana obrigatória antes do render final.
9. atribui novos cadastros a links de afiliados habilitados pelo admin e apresenta métricas agregadas sem expor dados pessoais.

## Tecnologias

| Camada | Tecnologias principais |
|---|---|
| Frontend | React 18, TypeScript, Vite 5, Tailwind CSS, Radix UI, TanStack Query, React Router 7, Zod |
| Backend | Supabase/PostgreSQL, Supabase Auth, Storage e Edge Functions em Deno/TypeScript |
| Processamento | Node.js, `@napi-rs/canvas`, FFmpeg/ffprobe e yt-dlp |
| IA | Gemini como transcritor padrão dos cortes e gateway Lovable; Groq pode ser habilitado explicitamente e xAI/Grok é opcional para análise |
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
- **Pix/manual:** o administrador financeiro informa plano e valor recebido; o sistema cria ou renova por um mês uma assinatura `live`, sem cartão ou IDs Stripe. Tentativas Stripe já terminadas podem ser substituídas; assinaturas Stripe ainda ativas exigem cancelamento prévio.
- **IA:** Gemini é o transcritor padrão do worker e também cobre análise; Groq permanece compatível apenas quando configurado explicitamente, Lovable atende fluxos próprios e xAI é opcional para análise de cortes.
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
6. **Análise sem escrita:** montar ou refazer a proposta não altera dados; somente a confirmação explícita pode vincular fontes e criar pautas, sem publicar conteúdo.
7. **Deploy controlado:** confirmar SHA, migrations, funções, artefato, health check e rollback.
8. **Documentação obrigatória:** finalizar trabalho inclui atualizar os cinco documentos da raiz.
9. **Preservar trabalho local:** não apagar, resetar ou misturar alterações do usuário.
10. **Idioma e fuso:** UI principal em português do Brasil e operação em `America/Sao_Paulo` quando aplicável.

## Próximo passo

Revisar e aprovar o PR rascunho [#70](https://github.com/franciscocastro-svg/feed-bot-ai/pull/70), cujo `npm run ci` completo está aprovado. Só depois do merge solicitar à Lovable a aplicação exclusiva de `20260802230000_affiliate_referrals.sql` e a publicação do frontend. O smoke deve ativar um afiliado de teste, cadastrar uma conta nova pelo link e confirmar uma única atribuição, métricas agregadas e zero alteração em assinatura. Rollout do cancelamento, smoke editorial 4:5, bloqueio antigo da fila, recaptura da matéria, replay do Piloto e correção do `SIGINT` permanecem atividades separadas.
