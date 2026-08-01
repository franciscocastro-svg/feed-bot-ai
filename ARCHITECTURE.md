# Arquitetura — Flux & Feed

Atualizado em **2026-08-01** para a correção Agência/financeiro publicada em `e163226`.

## Arquitetura geral

```mermaid
flowchart LR
    U["Usuário / Admin"] --> FE["React + Vite"]
    FE --> AUTH["Supabase Auth"]
    FE --> EF["Supabase Edge Functions"]
    FE --> DB["PostgreSQL + RLS/RPC"]
    FE --> ST["Supabase Storage"]

    CRON["Supabase Cron"] --> EF
    EF --> DB
    EF --> ST
    EF --> AI["Gemini / Groq / Lovable"]
    EF --> META["Meta Graph API"]
    EF --> STRIPE["Stripe"]

    DB --> WK["Worker Node na VPS"]
    WK --> MEDIA["FFmpeg / Canvas / yt-dlp"]
    WK --> WAI["Gemini / Groq / xAI opcional"]
    WK --> ST
    WK --> DB
```

O frontend coordena a experiência e ações autenticadas. Edge Functions concentram integrações e regras server-side. O banco mantém estado, isolamento, cobrança e filas. O worker executa tarefas pesadas que não cabem no ambiente ou duração de Edge Functions.

## Módulos

### Frontend — `src/`

- `pages/`: site público, autenticação, dashboard, configurações e administração;
- `components/`: UI, modais, previews, editor, pricing e componentes de negócio;
- `components/editorial-pilot/`: preview da proposta editorial;
- `config/`: feature flags e rollout;
- `contexts/`: autenticação, idioma e estado transversal;
- `integrations/supabase/`: cliente e tipos do banco;
- `lib/`: Stripe, políticas, contratos, roteamento, formatação e utilitários;
- `lib/subscriptionAccess.ts`: classificação pura e fail-closed do resultado de acesso;
- `lib/editorial-pilot/`: schema e construção determinística da proposta;
- `test/`: regressões, contratos, segurança e operação.

Rotas públicas cobrem autenticação, verificação/recuperação, preços, checkout, termos, privacidade, exclusão de dados e OAuth. Rotas protegidas cobrem notícias, fontes, pautas, Perfil de Criador, agendados, contas, templates, canais, insights, cortes, suporte e administração.

### Edge Functions — `supabase/functions/`

#### Conteúdo e IA

- `process-news`: processamento editorial de notícias;
- `generate-from-prompt` e `generate-from-topic`: conteúdo avulso/perene;
- `extract-from-youtube` e `extract-topics-from-pdf`: extração de material;
- `discover-rss`, `preview-source`, `fetch-rss` e `retry-failed-news`.

#### Automação e publicação

- `autopilot`: reposição e roteamento por conta;
- `publish-scheduler`: seleção e publicação de itens devidos;
- `fetch-insights`: métricas;
- `keep-ig-token-alive`, `refresh-ig-token` e `verify-ig-token`.

#### Instagram/Meta

- `instagram-oauth-start` e `instagram-oauth-callback`;
- `instagram-manual-connect`;
- `instagram-deauthorize` e `instagram-data-deletion`;
- `meta-usage-refresh`.

#### Pagamentos

- `create-checkout`;
- `create-portal-session`;
- `payments-webhook` e `payments-reconcile`;
- `admin-sync-stripe-price`.

#### Administração e comunicação

- campanhas/e-mail, verificação, impersonação e suporte;
- `mcp` e rotas administrativas de diagnóstico.

#### Compartilhados

`supabase/functions/_shared/` concentra autenticação, autorização, Stripe, perfil, política editorial, integridade de legendas, configurações conta/canal, roteamento de mídia, templates, observabilidade, captura, timezone e contratos de carrossel.

Regras usadas por mais de um consumidor devem ficar em módulos compartilhados para reduzir divergência entre UI, Edge Functions e worker.

### Worker — `worker/`

Responsabilidades:

- consumir jobs no banco;
- renderizar arte, carrossel e vídeo;
- executar FFmpeg/ffprobe e yt-dlp;
- usar `@napi-rs/canvas` para layouts;
- gerar Reels, cortes, legendas e overlays;
- selecionar/carregar imagens temáticas;
- reutilizar artefatos quando seguro;
- armazenar arquivos finais;
- fazer retry e registrar saúde/capacidades.

`worker/aiProviders.js` ordena provedores de transcrição e análise. Groq/Gemini cobrem transcrição; Gemini e xAI opcional cobrem análise estruturada. OpenRouter ainda não está implementado.

## Organização e padrões

### Separação de responsabilidades

- UI não recebe secrets nem decide autorização administrativa;
- Edge Functions validam JWT, origem, payload e permissão;
- RPCs encapsulam decisões atômicas de acesso e cobrança;
- banco/funções de claim protegem filas e webhooks;
- worker executa processamento pesado e idempotente;
- contratos compartilhados evitam formatos divergentes.

### Isolamento por Instagram

`instagram_account_id` é a fronteira editorial. Consultas e escritas específicas de conta devem ser filtradas por usuário e conta. Configurações globais são defaults; conta e canal têm precedência. Fontes podem ser compartilhadas, mas seus vínculos explícitos controlam o roteamento.

### Fail-closed

Autorização, Stripe, contratos de IA, feature flags, limites e deploy não usam defaults permissivos. Em dúvida, a ação sensível para e retorna erro sanitizado.

### Idempotência

- webhooks registram eventos, claims e efeitos;
- checkout usa chaves de idempotência e detecta assinatura existente;
- worker e filas registram estado/tentativa;
- deduplicação editorial usa chaves e janelas duráveis;
- aplicações do Piloto usam `proposal_id` único por usuário/Instagram, lock transacional e dedupe de fontes/pautas;
- deploys usam SHA aprovado, estado durável, backup, gates e rollback.

### Feature flags

Flags começam desligadas no contrato padrão. `VITE_FEATURE_EDITORIAL_PILOT_PREVIEW` está `false` em `.env.example` e habilitado no arquivo de desenvolvimento rastreado. Isso não comprova nem autoriza ativação em produção.

## Fluxos de dados

### Captura e processamento de notícia

```mermaid
sequenceDiagram
    participant C as Cron/Usuário
    participant F as fetch-rss
    participant D as PostgreSQL
    participant P as process-news
    participant W as Worker
    participant M as Meta

    C->>F: capturar fontes ativas
    F->>D: inserir/deduplicar news_items
    D-->>P: item pendente e conta de destino
    P->>P: validar fonte, perfil, política e IA
    P->>D: conteúdo processado/agendável
    W->>D: claim de job de mídia
    W->>W: render FFmpeg/Canvas
    W->>D: URLs finais e estado
    D-->>M: publish-scheduler publica quando devido
    M-->>D: media_id, sucesso ou erro
```

### Autopiloto

1. cron invoca `autopilot`;
2. assinatura, aprovação e contas ativas são avaliadas;
3. configurações global/conta/canal são resolvidas;
4. cada Instagram é processado isoladamente;
5. fila vazia recebe conteúdo preparado imediatamente;
6. `scheduled_for` respeita intervalo e horário;
7. limite diário soma formatos por conta;
8. falha de uma conta não aborta as demais.

### Pagamento e acesso

```mermaid
sequenceDiagram
    participant U as Usuário
    participant A as Admin financeiro
    participant FE as Pricing/ProtectedRoute
    participant CO as create-checkout
    participant S as Stripe
    participant WH as payments-webhook
    participant DB as Supabase

    U->>FE: escolhe plano
    FE->>CO: JWT + lookup key + ambiente
    CO->>DB: procura assinatura/customer existente
    CO->>S: cria sessão idempotente quando permitido
    S-->>U: checkout/trial
    S->>WH: evento assinado
    WH->>DB: aplica evento e assinatura
    A->>DB: admin_upsert_pix_subscription(plano, valor, 1 mês)
    DB-->>A: assinatura Pix live criada/renovada
    FE->>DB: compute_subscription_access
    DB-->>FE: acesso, motivo e plano
```

Uma assinatura manual/Pix não exige cartão nem customer Stripe. `admin_upsert_pix_subscription` permite somente ao admin financeiro ou `service_role` informar usuário, plano pago e valor; a RPC grava sempre em `live`, concede um mês e registra origem/valor/data/admin. Se já existir Pix vigente, soma um mês ao vencimento; caso contrário, conta um mês da confirmação. A migration `20260801144500` permite substituir apenas uma tentativa Stripe já terminada (`canceled`, `unpaid` ou `incomplete_expired`), terminaliza a linha antiga e mantém estados Stripe cobravelmente ativos bloqueados até cancelamento externo.

`admin_subscription_overview` substitui o fallback ambíguo da listagem antiga. A visão usa somente a linha não terminal `live` como assinatura de produção e expõe separadamente se existe registro `sandbox`. A UI mostra badges `LIVE`, `PIX` ou `Stripe` e avisa “somente sandbox” sem conceder acesso real.

Desde `e163226`, `get_user_plan()` filtra `environment='live'`, ignora linhas terminais, ordena por criação/ID e valida status, aprovação, e-mail, vigência, reembolso e congelamento antes de entregar o plano aos limites. Assim, uma linha Business `sandbox` não pode degradar uma Agência Pix `live`. No frontend, `src/lib/billing.ts` centraliza nomes públicos e o valor mensal: pagamentos Pix priorizam `manual_amount_paid_brl`; Stripe usa `plan_limits.price_brl`.

Desde o PR #42, somente `has_access=true` ou o bypass administrativo libera conteúdo; falha de RPC e demais motivos são apresentados separadamente, sem sugerir cartão indevidamente. A auditoria de 2026-08-01 mostrou que o cliente afetado tinha `has_access=true` apenas em sandbox e `no_subscription` em live, comprovando que a liberação anterior ocorreu no ambiente errado.

### Cortes de vídeo

1. URL ou arquivo cria job;
2. captura/transcrição produz timestamps;
3. análise retorna intervalos estruturados;
4. worker valida e executa FFmpeg;
5. Canvas, legenda e branding são aplicados;
6. Storage recebe os arquivos finais;
7. UI permite revisão, rerender e publicação.

### Piloto Editorial

1. UI seleciona conta e lê o Perfil de Criador;
2. builder local normaliza dados e classifica o domínio;
3. proposta `editorial-pilot/v1` recebe fingerprint da conta/perfil;
4. Zod valida contrato estrito, referências e percentuais;
5. a primeira chamada a `discover-rss` pesquisa, abre e mede a relevância de fontes reais sem gravar;
6. UI permite selecionar fontes e pautas e mostra o resumo exato por Instagram;
7. a confirmação envia somente a seleção para `discover-rss`, que revalida as fontes no servidor;
8. `apply_editorial_pilot_proposal()` confere propriedade da conta e grava fontes, vínculos, pautas e o ledger da aplicação na mesma transação;
9. o ledger `editorial_pilot_applications` torna o replay da mesma proposta inofensivo;
10. cadência, filas e publicações permanecem sem mutação na Fase 2A.

O frontend nunca grava diretamente os itens do plano. A Edge Function é a fronteira de validação externa; a RPC `SECURITY DEFINER`, com `search_path` fixo e `auth.uid()`, é a fronteira transacional. Falha de feed, limite de plano ou pauta inválida aborta toda a aplicação.

Estado implantado em 2026-08-01: migration/RPC e `discover-rss` publicadas; uma chamada sem credenciais recebeu 401. O primeiro teste autenticado chegou à confirmação, mas a RPC falhou porque o banco não tinha `news_sources.source_fingerprint` nem `compute_source_fingerprint(...)`. A transação foi revertida e as contagens de aplicações, fontes e pautas do piloto permaneceram em zero.

A correção implantada está em `20260801185731_1bf2df3e-ee4b-42a8-80ca-548153f2c6b6.sql`, timestamp registrado pela plataforma: adiciona a coluna, função, trigger e backfill sem criar índice único potencialmente destrutivo. A Edge devolve `editorial_apply_failed` sem expor detalhes internos e o frontend distingue falha de descoberta de falha de aplicação. Na descoberta, feeds de editorias verificadas são priorizados e aceitos pela validade/frescor do próprio endpoint; sugestões externas continuam sujeitas ao medidor de relevância.

A validação externa confirmou 59 fontes com fingerprint preenchido, nova publicação de `discover-rss` e rejeição anônima HTTP 401. A Lovable criou o merge automático `3512454`, com a migration no timestamp efetivamente registrado e os tipos da RPC regenerados. A cópia anterior `20260801183000` não representa uma segunda mudança de schema e foi removida na reconciliação para impedir dupla aplicação em ambientes futuros.

O smoke seguinte encontrou uma segunda incompatibilidade na própria RPC: `source_id` era simultaneamente uma variável PL/pgSQL e uma coluna do alvo `ON CONFLICT`, produzindo SQLSTATE `42702`. `20260801194149_7a4ced9b-6085-4bb9-abdf-dd20361654dc.sql`, versão registrada pela plataforma, recria somente a função, usa `v_source_id`, referencia `news_source_instagram_accounts_pkey` por nome e usa `GET DIAGNOSTICS ... ROW_COUNT` para contar apenas vínculos realmente inseridos. A transação continua atômica e o replay continua protegido pelo ledger.

Validação local da correção `42702`: 555 testes principais, 33 testes herméticos de deploy, 15 de reconciliação, typecheck, lints, gates de migrations/MCP e build de produção aprovados.

Validação externa posterior: a aplicação criou 1 ledger, resolveu e vinculou as 7 fontes selecionadas e criou as 4 pautas previstas. O resultado transacional registrou 4 fontes novas, 4 vínculos novos, 4 pautas novas e zero pautas ignoradas; nenhuma publicação foi criada. O replay efetivo pela interface permanece como último smoke antes do rollout.

Validação da branch corretiva: 555 testes principais, 33 testes herméticos de deploy, 15 de reconciliação, typecheck, lints, gates de migrations/MCP, build de produção e check remoto `Validate application` aprovados.

A regeneração de schema executada pela Lovable após o deploy criou o commit `e290ac0` diretamente na `main`. O diff altera somente `src/integrations/supabase/types.ts`, adicionando o ledger/RPC e atualizando nullability inferida de `admin_subscription_overview`; não altera SQL nem lógica de runtime.

## APIs e contratos

### Edge Functions

Algumas funções usam `verify_jwt=false` no `config.toml` porque validam internamente JWT, assinatura de webhook ou secret de cron. Isso não significa endpoint desprotegido.

Regras:

- validar método, origem, JWT e corpo;
- nunca confiar em `user_id` enviado pelo frontend;
- sanitizar stack, token, e-mail e payload sensível;
- distinguir autenticação, permissão, validação e falha externa;
- exigir permissão explícita em funções administrativas.

### Contratos de IA

Entradas carregam fonte, conta, perfil e tarefa. Saídas críticas usam JSON estruturado e validação antes de avançar. Carrossel valida slides e imagens; Piloto Editorial valida `editorial-pilot/v1`; análise de cortes deve retornar timestamps válidos.

## Banco de dados

A `main` contém 182 migrations versionadas. As migrations Pix `20260801134000`, Agência `20260801144500`, Piloto Editorial `20260801170000`, compatibilidade `20260801185731` e correção da RPC `20260801194149` foram aplicadas e registradas no histórico do Supabase em 2026-08-01. A última não alterou tabelas nem dados; apenas recriou a RPC. Domínios representativos:

| Domínio | Tabelas/contratos representativos |
|---|---|
| Identidade | `profiles`, `instagram_accounts`, `creator_profiles`, brand kits |
| Configuração | `user_settings`, `account_settings`, `channel_settings`, assignments |
| Conteúdo | `news_sources`, vínculos de fontes, `news_items`, `content_topics`, `scheduled_posts` |
| Observabilidade | logs, fetch runs, worker health, uso Meta/IA |
| Pagamentos | `plan_limits`, `user_subscriptions`, origem/valor Pix, eventos/efeitos/reconciliação |
| Cortes | jobs, clips, perfis, rerender e uso diário |
| Operação | releases, permissões, suporte, e-mail e despesas |

Migrations são append-only. Presença no Git não comprova aplicação no banco; produção deve ser auditada por histórico e existência de tabelas, colunas e RPCs.

## Autenticação e segurança

- Supabase Auth é a identidade primária;
- frontend usa publishable/anon key;
- service role existe apenas em Edge Functions e worker;
- RLS e RPCs protegem dados por usuário;
- funções administrativas validam JWT e permissão;
- tokens Instagram e secrets passam por rotas controladas;
- webhook Stripe valida assinatura;
- redirects usam allowlist;
- logs são sanitizados;
- `check:secrets` bloqueia credenciais indevidas.

## Integrações

### Meta Instagram

OAuth, conexão manual, publicação, refresh/health de token, insights e uso de API. O destino da conta é obrigatório. Música nativa/licenciada não deve ser tratada como arquivo livre sem validar API e direitos.

### Stripe

Creator, Pro e Business usam lookup keys; Agência usa contato comercial. O ambiente deriva da chave publicável. Checkout reutiliza customer quando possível e bloqueia duplicidade. O catálogo live e o estado de assinaturas permanecem itens de auditoria externa.

### Provedores de IA

- Gemini: texto, vídeo, análise e fallback de transcrição;
- Groq: texto e Whisper/transcrição;
- Lovable: gateway em fluxos existentes;
- xAI/Grok: análise opcional de cortes no worker;
- OpenRouter: backlog, ainda ausente.

### VPS e deploy

PM2 mantém processos de webhook, mídia e cortes. Deploy usa fila durável, SHAs aprovados, health checks e rollback. Estado interrompido deve ser reconciliado pelos scripts versionados; nunca editar arquivos operacionais manualmente.

## Decisões técnicas

| Decisão | Motivo |
|---|---|
| Supabase como núcleo | Auth, Postgres, Storage, cron e funções integrados |
| Worker externo | binários, duração e memória de mídia |
| Configuração por Instagram | impedir mistura editorial e permitir múltiplas marcas |
| Carrossel transportado como Feed | contrato técnico da Meta com múltiplas mídias |
| Contratos JSON estritos | impedir avanço de resposta de IA inválida |
| Fallback de IA | reduzir indisponibilidade de provedor único |
| Feature flag | ativação e rollback graduais |
| Stripe lookup keys | desacoplar UI de IDs de preço |
| Pix administrativo sempre `live` | impedir que uma liberação sandbox seja confundida com acesso real |
| Limites resolvidos somente em `live` | impedir que uma assinatura de teste altere plano ou quotas de produção |
| Valor Pix como fonte financeira | planos negociáveis devem usar o valor efetivamente registrado, não preço-base nulo |
| Chaves de plano separadas dos nomes públicos | preservar compatibilidade `starter` no banco/Stripe e mostrar Creator na interface |
| Logs sanitizados | observabilidade sem exposição de dados |
| Docs raiz obrigatórios | continuidade sem depender de chats |

## Melhorias futuras

1. Auditar drift Git ↔ frontend ↔ Edge ↔ banco ↔ VPS.
2. Aplicar o Piloto por diff transacional e aprovação item a item.
3. Centralizar ainda mais provedores, orçamento e telemetria.
4. Medir repetição e relevância/licença de imagens.
5. Adicionar tracing por request e conta com identificadores sanitizados.
6. Definir SLOs para captura, geração, render e publicação.
7. Expandir E2E de Stripe/Meta em ambientes seguros.

## Disciplina de mudança

Antes de merge/deploy:

1. confirmar branch, SHA e worktree;
2. separar mudanças do usuário;
3. rodar testes proporcionais ao risco;
4. auditar migration, Edge, frontend e worker separadamente;
5. preparar backup e rollback;
6. obter autorização para mutação externa;
7. atualizar os cinco documentos da raiz.
