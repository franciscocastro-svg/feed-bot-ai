# Handoff — Flux & Feed

Data: **2026-08-02**

Objetivo: permitir continuidade sem depender do histórico de conversas.

## Leia primeiro

1. Leia integralmente os cinco documentos da raiz.
2. Não confunda Git, ambiente publicado e serviços externos.
3. Não apague nem inclua mudanças locais sem identificar o proprietário.
4. Não acione Lovable automaticamente; prompts devem ser entregues ao usuário para evitar consumo de créditos sem autorização.
5. Não faça deploy, migration, alteração Stripe/Meta/VPS ou publicação sem autorização explícita.
6. Ao concluir uma funcionalidade, atualize os cinco documentos no mesmo trabalho.

## Estado Git confirmado

### Trabalho atual — Corte Editorial

- Worktree isolada: `/private/tmp/fluxfeed-editorial-cut`.
- Branch atual: `codex/editorial-admin-beta`.
- Base: `fd79e5d6a4e6b6a03ffcd20e40332243b56e0ec1` (`origin/main` reconciliada em 2026-08-02).
- Estado: o Corte Editorial base e a Beta administrativa foram integrados pelos PRs #60/#61 nos merges `acc8363`/`e433493`. A Lovable aplicou a migration sob `20260802144135`, recarregou o schema e implantou somente `regenerate-cut-editorial-text`; o merge automático `ad273b4` adicionou a migration registrada e os tipos gerados. O Preview está sincronizado, mas worker VPS e frontend de produção ainda não foram confirmados.
- Primeiro smoke integrado: quatro jobs antigos terminaram `failed`/`Object not found`, sem clipes, agendamentos ou publicações; o teste das 02:31 não criou job e o das 02:34 foi reivindicado uma vez antes de falhar. A causa foi frontend novo contra schema antigo, agora corrigido.
- Deploy do worker: a branch `codex/deploy-editorial-cuts-worker` adiciona `DEPLOY_PM2_SCOPE=cuts-only` para reiniciar somente `feedbot-cuts`, mantendo instalação, testes, nginx, health e rollback. Não usar o escopo `all` enquanto o incidente de `SIGINT` do webhook estiver pendente.
- A pasta original `/Users/decastro/Downloads/feed-bot-ai-main` não foi alterada.

### `main` auditada

- Remoto: `https://github.com/franciscocastro-svg/feed-bot-ai`.
- Release funcional publicada: `6b362bfda7aea7418a818c8ec4e40fa3451f94c1` — merge do PR #45.
- Correção Agência/financeiro publicada: `e163226209a640bc88fac9193579c8d92c1c1eea` — merge do PR #49.
- Base documental atual da branch: `a3c558b` — merge do PR #48.
- Branch funcional: `codex/fix-agency-billing-plan-labels`; commit `ec685d8`; integrada pelo PR #49.
- Base anterior: `a6c08830bf3187305d70921cb1f8a7ab338407ec` — merge documental do PR #44.
- Worktree limpa: `/private/tmp/fluxfeed-main-audit`.
- Branch funcional `codex/editorial-pilot-phase-2a`, commit funcional `ec58f75` e head final `401d849`.
- PR [#51 — Add real source discovery to the editorial pilot](https://github.com/franciscocastro-svg/feed-bot-ai/pull/51) integrado na `main` pelo merge `ad39d3e04f416a913c8d559ebedc9c3707834d0d`.
- PR [#53 — Fix editorial pilot application and source discovery](https://github.com/franciscocastro-svg/feed-bot-ai/pull/53) integrado no merge `1cb14c572d10d331267afb15f35a6f440334ecca`.
- A implantação Lovable criou o merge automático `3512454aba1daa7fc507238f136089959b3a3774`; a branch `codex/reconcile-editorial-pilot-migration` reconciliou a migration duplicada com o timestamp efetivamente registrado.
- O PR #54 integrou a reconciliação no merge `47a6652c851ff3f3a0629f4677264d0d947b2894`; o PR #55 integrou a correção SQLSTATE `42702` no merge `d0dc3da2908a4623c334472ce35a67795ea4c05d`. A Lovable registrou a migration como `20260801194149` e avançou a `main` para `2b65b4941cc012896c4c6cc43fc5f25efaeade63`.
- O PR #57 integrou a melhoria de imagens no merge `c4e703d777579bf057278eaa10bde8180c9e3c0b`; a Lovable publicou o frontend e as três Edge Functions dependentes de `source-capture.ts` nesse conteúdo.
- O PR [#58 — Recover interrupted VPS deploy queue safely](https://github.com/franciscocastro-svg/feed-bot-ai/pull/58) foi integrado no merge `93ae2a39a08651ed15843c2370e793928c090454`; o check final passou para `df33a08`.
- O registro pós-deploy está isolado em `/private/tmp/fluxfeed-vps-recovery`, branch `codex/record-vps-recovery-completion`, criada de `93ae2a3`. A pasta original não foi alterada.
- Check remoto `Validate application` aprovado para o head final `401d849` em 2026-08-01.
- Branch documental atual: `codex/record-editorial-pilot-merge`, commit `0098c25`, criada a partir do merge `ad39d3e`.
- PR documental rascunho [#52 — Record editorial pilot merge](https://github.com/franciscocastro-svg/feed-bot-ai/pull/52), com `Validate application` aprovado para `0098c25`.
- Branch funcional: `codex/pix-live-manual-subscriptions`; commit `bc69f10`; integrada pelo PR #45.
- Registro pós-release: commit `e7fe5eb`, integrado pelo PR #46 no merge documental `a36efda`.
- Commits posteriores que alterem somente estes documentos podem avançar o SHA da `main` sem mudar o release funcional `6b362bf`.
- Commit inicial da correção: `021065a` — `Fix manual subscription access gate`.
- Branch enviada a `origin/codex/reconcile-main-docs`.
- PR [#42 — Fix manual subscription access gate](https://github.com/franciscocastro-svg/feed-bot-ai/pull/42): checks verdes e merge concluído em `78379d9`.
- Os commits relatados do Piloto Editorial e da classificação foram confirmados na ancestralidade da `main`.

### Pasta original preservada

Pasta: `/Users/decastro/Downloads/feed-bot-ai-main`

- Branch: `codex/phase-1e-a-2-reconcile`.
- HEAD: `e1846ff` — `Add complete topic carousel generation`.
- Não foi atualizada, resetada, limpa ou usada para implementar a reconciliação.

Mudanças catalogadas na pasta original:

```text
 M README.md
 M supabase/functions/mcp/index.ts
?? ARCHITECTURE.md
?? HANDOFF.md
?? PRODUCT.md
?? TASKS.md
?? output/
?? public/ad-flux-feed-portais-1080x1350.png
?? public/ad-flux-feed-portais.html
?? src/assets/template-feed-news-variation-01.png
?? video-demo-basico.mp4
```

Não copiar, apagar, commitar ou sobrescrever esses itens sem autorização específica.

### Estados separados

| Estado | Situação | Tratamento |
|---|---|---|
| Pasta original | antiga e com trabalho local | preservar |
| Código funcional em `main` | Pix live integrado em `6b362bf` | base do app publicado |
| Branch do PR #42 | integrada em `main` | preservar histórico |
| Branch Pix live | integrada pelo PR #45 em `6b362bf` | preservar histórico |
| Supabase | migration `20260801134000` aplicada; cliente liberado em live | teste autenticado aprovado |
| Frontend Lovable | conteúdo de `c4e703d` sincronizado e publicado | melhoria de imagens presente; arquivos antigos exigem regeneração |
| Piloto Editorial 2A | correção implantada; smoke principal aprovado com 7 fontes e 4 pautas | confirmar replay e decidir rollout |
| Qualidade de imagens | frontend, três Edge Functions e worker de mídia publicados | recapturar/regenerar e fazer smoke visual |
| Worker VPS | `93ae2a3`, PM2/health saudáveis, fila vazia e bloqueio removido | preservar evidências; operação normal retomada |
| Correção Agência | `e163226` + migration `20260801144500` | integrada, aplicada e publicada |
| Lovable pós-Agência | deployment `845c71ef-092d-4842-81c9-b0053fe25f9d` | smoke autenticado aprovado |
| Serviços externos restantes | parcialmente auditados | verificar cada serviço separadamente |

Atualização posterior da VPS: o código avançou para `fbe6a2a` e os processos/health continuam online, mas a automação ficou novamente bloqueada em `deploy_process_exit_unobserved` após `SIGINT` durante reload do próprio webhook. Esse incidente é separado do Corte Editorial; não remover o bloqueio neste trabalho.

## Corte Editorial — implementação local

Arquivos principais:

- `src/pages/dashboard/Cuts.tsx` — subabas `Criar corte`/`Meus cortes`, seleção dos três formatos, visibilidade `Beta admin`, criação por RPC própria e gates de render/agendamento;
- `src/components/cuts/EditorialCutPreview.tsx` — prévia 4:5 editável;
- `src/lib/editorialCuts.ts` — contratos e validação do rascunho;
- `worker/editorialCut.js` — segurança factual, layout Canvas e filtros FFmpeg;
- `worker/index.js` — transcrição/frames, prévia, render final e bloqueio de autopublish;
- `worker/aiProviders.js` — análise multimodal Gemini com fallback textual;
- `supabase/migrations/20260802090000_add_editorial_video_cuts.sql` — colunas, RPCs, trigger de agendamento e trigger de acesso administrativo aditivos;
- `supabase/functions/regenerate-cut-editorial-text/index.ts` — texto somente, autenticado, exclusivo para admin durante a Beta e sem escrita;
- `src/test/editorial-video-cuts.test.ts` — 15 testes direcionados.

Decisões obrigatórias:

1. `cut_mode=editorial` é gravado na mesma transação que cria o job; não usar update posterior como única marcação.
2. Corte Editorial é cloud-only nesta primeira versão e sempre 4:5.
3. A prévia ocupa `editorial_preview_url`; `video_url` continua nulo até a revisão.
4. Regenerar texto devolve rascunho sem persistir nem processar vídeo.
5. Texto só é aceito com confiança mínima de 72%, evidência literal e números presentes na transcrição; caso contrário, fallback neutro.
6. Frames complementam cenário/ação e nunca identificam pessoas.
7. O render final relê a transcrição do original para preservar sincronia quando o trecho muda.
8. Agendamento exige `editorial_review_confirmed_at` e `video_url`; UI, trigger e worker aplicam defesa em profundidade.
9. Prévia e final leem o original; nunca recomprimir a prévia como fonte.
10. Nenhum teste ou implantação pode publicar automaticamente.
11. Durante a Beta inicial, somente administradores veem e acionam o Corte Editorial; UI, RPCs, Edge e trigger de `video_cut_jobs` devem concordar.

Validação local concluída:

- 15 testes direcionados do Corte Editorial;
- 586 testes principais validados; um teste antigo de layout mobile excedeu o timeout sob carga e passou isoladamente;
- 35 testes herméticos de deploy e 24 de reconciliação aprovados;
- após os ajustes finais, typecheck, worker, os 15 testes direcionados e o build foram aprovados novamente;
- os 35 testes herméticos de deploy foram validados; dois casos antigos de health excederam o timeout durante execução concorrente e passaram isoladamente, seguidos por 24/24 testes de reconciliação;
- o segundo run completo encontrou somente a restrição do sandbox ao abrir `127.0.0.1`; a suíte operacional correspondente foi repetida fora dessa restrição e passou 20/20;
- secret scan em 674 arquivos;
- typecheck, lint ratchet/fases, worker, migrations editoriais, MCP e build Vite aprovados;
- `check:edge-functions` não executou porque Deno não está instalado localmente; o manifest/config foi validado pelo CI.

Validação física executada em `/private/tmp/fluxfeed-editorial-tests` com FFmpeg Full 8.1.2 e as funções reais de `worker/editorialCut.js`: três saídas 1080×1350 para entrada vertical, horizontal derivada e baixa resolução, sem banco, storage ou publicação. O teste encontrou AAC em 96 kHz após `loudnorm`; `worker/index.js` passou a usar `aresample=48000`. O usuário aprovou visualmente a demonstração. O original de 6 segundos não possui áudio, então foi usada faixa sintética com legenda temporizada; permanece pendente o smoke com fala real.

## Reconciliação executada

1. Os cinco documentos da pasta original foram lidos.
2. Estado local, tamanhos e hashes foram catalogados.
3. `git fetch origin` atualizou `origin/main` de `4c808028` para `c0106d3`.
4. A worktree limpa foi criada em modo detached e depois recebeu a branch `codex/reconcile-main-docs`.
5. O histórico confirmou os PRs #30 a #41 e as entregas relatadas.
6. A documentação antiga da `main` foi comparada ao código atual.
7. Nenhuma mutação foi feita em Supabase, Stripe, Meta, Lovable, VPS ou produção.

## Validação local

Executada na worktree limpa sobre `c0106d3`:

```text
npm ci      PASS
npm run ci  PASS
```

Resultados relevantes:

- secret scan: aprovado em 649 arquivos de texto;
- lint ratchet: 422 erros no baseline atual, abaixo do limite de 447;
- lint por fases: zero erros e dois warnings preexistentes em `AuthContext.tsx`;
- typecheck: aprovado;
- linha de base antes da correção: 519 testes aprovados e 33 ignorados;
- testes herméticos de deploy: 33 aprovados;
- testes de reconciliação: 15 aprovados;
- sintaxe do worker: aprovada;
- gate de migrations editoriais: aprovado;
- build MCP reprodutível: aprovado;
- build Vite: aprovado.

Após criar os cinco documentos reconciliados, `git diff --check` e um novo secret scan também passaram; o scanner final cobriu 653 arquivos de texto.

Após a correção Pix/manual, o CI completo passou novamente:

- 538 testes principais aprovados e 33 ignorados;
- 33 testes herméticos de deploy aprovados;
- 15 testes de reconciliação aprovados;
- secret scan em 656 arquivos;
- typecheck, worker, migrations, MCP e build Vite aprovados.

Após implementar o fluxo administrativo Pix live nesta continuidade, `npm run ci` passou integralmente:

- secret scan: 658 arquivos aprovados;
- lint ratchet: 422 erros preexistentes, abaixo do limite 447;
- typecheck e lints por fases: aprovados, mantendo dois warnings preexistentes em `AuthContext.tsx`;
- suíte principal: 544 testes aprovados e 33 ignorados;
- deploy hermético: 33 testes aprovados;
- reconciliação: 15 testes aprovados;
- worker, gates editoriais/MCP e build Vite: aprovados.

Após implementar a correção Agência/financeiro nesta continuidade, `npm run ci` passou integralmente:

- secret scan: 661 arquivos aprovados;
- lint ratchet: 422 erros preexistentes, abaixo do limite 447;
- typecheck e lints por fases: aprovados, mantendo dois warnings preexistentes em `AuthContext.tsx`;
- suíte principal: 548 testes aprovados e 33 ignorados;
- deploy hermético: 33 testes aprovados;
- reconciliação: 15 testes aprovados;
- worker, gates editoriais/MCP e build Vite: aprovados.

O `npm ci` criou somente `node_modules`, ignorado pelo Git. O build criou `dist`, também ignorado. Antes das alterações documentais, a árvore rastreada estava limpa.

## O que está confirmado na `main`

### Conteúdo e carrosséis

- geração de carrosséis por tópico, prompt e preferência de notícia;
- contrato de slides, destaques e imagens;
- renderer editorial, identidade e previews;
- busca temática de imagens e fallbacks;
- roteamento de carrossel como Feed na Meta.

### Autopiloto e configurações

- reposição imediata por Instagram;
- intervalo aplicado à publicação, não à preparação;
- isolamento por `instagram_account_id`;
- sincronização global/conta/canal;
- limites diários por Instagram somando formatos;
- atualização condicional e filas controladas.

### Perfil, fontes e identidade

- Perfil de Criador por conta;
- preferências de formato e slides;
- fontes filtráveis/vinculadas por Instagram;
- identidade resolvida por conta em templates globais;
- OAuth e conexão manual do Instagram;
- integridade de legenda, assinatura e CTA por perfil.

### Vídeo

- Reels editoriais e duração configurável;
- captura, transcrição, cortes e legendas;
- Canvas, overlays, qualidade e reaproveitamento;
- Groq/Gemini para transcrição;
- Gemini e xAI opcional para análise de cortes.

### Pagamentos e planos

- Creator (`starter`), Pro, Business e Agência;
- preços-base no banco: R$ 97,97, R$ 197,97 e R$ 437,97;
- Agência negociável por `contato@fluxifeed.com`;
- limites por Instagram e por plano;
- checkout para três planos automáticos;
- proteção contra assinatura duplicada;
- portal escolhendo assinatura/customer reutilizável;
- autorização administrativa em contexto JWT;
- separação sandbox/live por chave publicável.

No release `6b362bf`:

- o admin financeiro escolhe plano e informa o valor recebido via Pix;
- a assinatura manual é criada ou renovada somente em `live`, por um mês;
- origem, valor, data e administrador ficam registrados;
- um Pix vigente recebe mais um mês; vencido recebe um mês a partir da confirmação;
- assinatura Stripe `live` nunca é sobrescrita;
- a listagem administrativa não apresenta mais sandbox como se fosse live.

Catálogo Stripe live e estado real das assinaturas não foram consultados.

### Piloto Editorial Inteligente

- contrato `editorial-pilot/v1`;
- preview local no Perfil de Criador;
- posicionamento, pilares, fontes, pautas, público, proteções e cadência;
- fingerprint e isolamento por Instagram;
- guardrails para fofoca, Direito, Saúde e Finanças;
- teste contra falso positivo “brasileiras” → Direito;
- nenhuma escrita em fonte, pauta, configuração, fila ou publicação;
- flag `false` no exemplo e `true` no ambiente de desenvolvimento rastreado.

#### Fase 2A integrada, com implantação parcial

Arquivos principais:

- `src/components/editorial-pilot/EditorialPilotPreview.tsx` — análise, descoberta real, seleção, resumo e confirmação;
- `src/lib/editorial-pilot/applyPlan.ts` — payload mínimo de fontes/pautas selecionadas;
- `supabase/functions/discover-rss/index.ts` — revalidação dos candidatos e chamada transacional;
- `supabase/migrations/20260801170000_editorial_pilot_phase_2a.sql` — ledger e RPC idempotente;
- `src/test/editorial-pilot-preview.test.ts` — contratos da seleção e da aplicação.

Comportamento local:

1. montar a proposta continua sem escrita;
2. o nicho identificado alimenta a descoberta real já existente;
3. feeds são abertos e medidos por notícias recentes antes de aparecerem como válidos;
4. usuário escolhe fontes e pautas e vê o resumo exato por Instagram;
5. a confirmação revalida as fontes no servidor;
6. a RPC confere `auth.uid()`, propriedade da conta, lock e `proposal_id`;
7. fontes, vínculos, pautas e ledger são gravados ou revertidos juntos;
8. repetir a mesma proposta devolve o resultado anterior sem duplicar dados;
9. cadência, filas e publicações não são modificadas.

Validações executadas até aqui:

- 25 testes direcionados aprovados;
- TypeScript aprovado;
- ESLint dos arquivos alterados aprovado;
- `npm run ci` completo aprovado: secret scan em 663 arquivos, lint ratchet/fases, 551 testes principais, 33 testes herméticos de deploy, 15 de reconciliação, worker, gates de migrations/MCP e build;
- o servidor Vite iniciou sem erros; o teste visual integrado ficou limitado pelo redirecionamento legítimo para `/auth` sem uma sessão local.

Estado externo: migration e Edge Function foram implantadas e verificadas; frontend e flag ainda não foram implantados.

Implantação parcial autorizada em 2026-08-01:

- `20260801170000` foi executada no banco conectado e registrada em `supabase_migrations.schema_migrations` com o SQL versionado;
- `editorial_pilot_applications` e `apply_editorial_pilot_proposal(...)` existem;
- `authenticated` possui execução da RPC, `anon` não possui e o ledger tinha zero aplicações na verificação inicial;
- a tentativa inicial de publicar somente `discover-rss` com Supabase CLI 2.111.0 falhou antes do deploy com `Access token not provided`;
- após autorização específica do usuário, a Lovable publicou `discover-rss` a partir de `1278649` em 2026-08-01 17:43:35 UTC;
- a Lovable informou `booted` em 27 ms e afirmou que não alterou código ou commit, além de não alterar migration, dados, frontend, variáveis ou outras funções;
- a auditoria Git imediatamente posterior contradisse apenas a parte de código/commit: a `main` avançou de `1278649` para `e290ac0` (“Publicou discover-rss”), com mudança exclusiva em `src/integrations/supabase/types.ts`;
- o diff gerado adiciona o tipo de `editorial_pilot_applications`, a assinatura de `apply_editorial_pilot_proposal` e atualiza nullability inferida de `admin_subscription_overview`; não modifica a Edge Function nem o SQL;
- smoke independente sem credenciais confirmou HTTP 401 e `{"error":"unauthorized"}`;
- a função valida `Authorization`, `auth.getUser()` e `is_approved` no próprio código; `verify_jwt` não está declarado no `config.toml`.
- após incorporar `e290ac0` na branch documental, `npm run ci` passou integralmente: 551 testes principais, 33 de deploy, 15 de reconciliação, typecheck, gates editoriais/MCP e build.

#### Diagnóstico do primeiro teste autenticado e correção implantada

- o preview encontrou quatro fontes válidas e chegou ao diálogo de confirmação para a conta selecionada;
- ao confirmar, a aplicação mostrou uma mensagem genérica de descoberta, embora a falha estivesse na RPC de aplicação;
- uma reprodução segura em subtransação identificou `42883: function public.compute_source_fingerprint(...) does not exist`;
- a inspeção confirmou também a ausência de `news_sources.source_fingerprint` e do trigger de fingerprint no banco publicado;
- a tentativa real foi atômica: `editorial_pilot_applications`, fontes e pautas do piloto permaneceram com contagem zero;
- `20260801185731_1bf2df3e-ee4b-42a8-80ca-548153f2c6b6.sql`, timestamp efetivamente registrado pela plataforma, reconcilia coluna, função, trigger e backfill sem índice único;
- `discover-rss` sanitiza a falha como `editorial_apply_failed`; o frontend apresenta mensagem de aplicação e informa que nada foi gravado;
- a auditoria pública confirmou Fofocalizando com amostra antiga, Contigo! indisponível e RSS do Observatório da TV em 404, portanto essas rejeições eram corretas;
- o feed oficial de Quem (`https://revistaquem.globo.com/rss/quem`) e a editoria de Metrópoles (`https://www.metropoles.com/entretenimento/feed`) respondem com XML válido e substituem os falsos negativos;
- o fallback UOL Splash retornava 404 e foi removido; o vocabulário de entretenimento foi ampliado para artistas, TV, música, shows e relacionamentos;
- 48 testes direcionados passaram; o CI completo aprovou secret scan em 664 arquivos, typecheck, lints, 555 testes principais, 33 de deploy, 15 de reconciliação, worker, gates de migrations/MCP e build;
- o PR #53 foi atualizado com o diagnóstico/correção e o check remoto `Validate application` passou para o commit funcional `80debad` em 1m55s;
- `check:edge-functions`, que não integra `npm run ci`, não executou isoladamente porque Deno não está instalado nesta máquina;
- o PR #53 foi integrado no merge `1cb14c5`;
- a Lovable aplicou exclusivamente a compatibilidade, registrando-a como `20260801185731`, e confirmou coluna/função/trigger, 59 fontes e zero fingerprints vazios;
- `discover-rss` foi republicada em 2026-08-01 18:58 UTC e o smoke anônimo permaneceu em HTTP 401;
- o preview foi sincronizado; frontend de produção, secrets, flags, outras funções e dados de clientes não foram alterados;
- apesar de informar que não criou commit, a operação criou `3512454` na `main`, adicionando a migration timestampada e tipos regenerados;
- como `3512454` deixou também a cópia idêntica `20260801183000` já presente, a branch de reconciliação remove essa cópia não registrada e mantém somente `20260801185731`, coerente com o histórico do Supabase.

#### Segundo smoke autenticado — SQLSTATE 42702

- a nova descoberta apresentou sete fontes válidas, incluindo G1 Pop Arte, Quem, Metrópoles, monitoramento temático e outras fontes recentes;
- a confirmação de sete fontes e quatro pautas retornou a mensagem segura `editorial_apply_failed`;
- o log PostgreSQL identificou `column reference "source_id" is ambiguous` na linha do `ON CONFLICT` de `news_source_instagram_accounts`;
- a PK composta existe e está correta; enum, colunas de pauta, triggers e limite de fontes também foram verificados;
- a causa é a colisão entre a variável PL/pgSQL `source_id` e a coluna `source_id` usada como alvo de inferência;
- a transação reverteu integralmente: zero aplicações, zero fontes `editorial-pilot` e zero pautas `editorial_pilot`;
- `20260801194149_7a4ced9b-6085-4bb9-abdf-dd20361654dc.sql`, versão registrada pela plataforma, recria a RPC com `v_source_id`, `ON CONFLICT ON CONSTRAINT news_source_instagram_accounts_pkey` e `GET DIAGNOSTICS link_row_count = ROW_COUNT`;
- o CI completo aprovou secret scan em 665 arquivos, typecheck, lints, 555 testes principais, 33 de deploy, 15 de reconciliação, gates de migrations/MCP e build;
- o PR #55 foi integrado em `d0dc3da`; a Lovable substituiu o nome do arquivo pela versão registrada, atualizou somente o caminho do teste e não republicou Edge/frontend;
- a `main` avançou automaticamente para `2b65b49`; 18/18 testes direcionados passaram na plataforma;
- o terceiro smoke autenticado exibiu “Plano editorial aplicado com segurança” e registrou 4 fontes novas, 4 vínculos novos e 4 pautas;
- a consulta final somente leitura confirmou 1 ledger para a proposta, 7/7 fontes resolvidas, 7/7 vinculadas, 4/4 pautas presentes, zero ignoradas e `replayed=false` na primeira aplicação;
- nenhuma publicação foi criada; o replay efetivo continua pendente antes do rollout.

## Melhoria integrada — qualidade e relevância das imagens

Diagnóstico confirmado em 2026-08-01, sem alterar dados de produção:

- a notícia de teste armazenava uma miniatura pública do Bing com 100×100 pixels e 2.287 bytes;
- a capa final tinha 1080×1920, portanto a perda visível vinha da ampliação da origem e não do codec H.264/CRF 20;
- a própria matéria expõe uma imagem principal de 1200×747 e 62.861 bytes, visualmente correspondente à mesma pessoa e ao mesmo assunto.

Implementação integrada pelo PR #57 no merge `c4e703d`:

- `supabase/functions/_shared/source-capture.ts` classifica candidatos da própria página por `primaryImageOfPage`, JSON-LD, `og:image`, figura, `srcset`, resolução declarada e sinais de miniatura;
- `fetch-rss` tenta enriquecer miniaturas fracas, conserva a imagem anterior se a matéria não oferecer alternativa e pode melhorar a imagem de uma duplicata existente;
- nenhuma busca externa por título/pessoa é usada, reduzindo o risco de trocar o assunto;
- `image-framing.js`, os renderizadores do navegador e `worker/index.js` limitam em 4× a ampliação do primeiro plano pequeno, mantendo o fundo editorial preenchido;
- o teste real selecionou `https://cdn.revistafama.com/.../mide-memo-schutz-casa-famosos.jpg`, medido em 1200×747;
- 38 testes direcionados passaram; o CI completo aprovou secret scan em 665 arquivos, lint ratchet, typecheck, 562 testes principais, 33 testes herméticos de deploy, 15 de reconciliação, worker, gates e build;
- a Lovable publicou o frontend e republicou `fetch-rss`, `preview-source` e `discover-rss` no conteúdo de `c4e703d`, sem migration, dados, secrets ou configuração;
- o worker VPS recebeu a correção em `93ae2a3`; nenhuma imagem existente foi regenerada automaticamente.

## Diagnóstico e recuperação da fila VPS

Auditoria somente leitura confirmada em 2026-08-01:

- VPS em `/opt/feedbot`, HEAD detached `a2be3f52c6e1bec35c25d0f551a7afa33ed39108`;
- `feedbot-cuts`, `feedbot-media` e `feedbot-webhook` estão online no PM2; `/deploy-health` retorna HTTP 200;
- nenhum PID do runner/deploy interrompido continua vivo;
- `BLOCKED.json` registra `deploy_process_exit_unobserved` e `active.json` registra o mesmo release como `deploying`;
- o log mostra testes concluídos e depois `SIGINT`, com `DEPLOY_RESULT=INTERRUPTED`/`signal_INT` durante o reload dos processos;
- a fila contém 42 releases; `c4e703d` é o último item, único, aprovado pelo CI e sem resultado terminal;
- os itens não rastreados `node_modules.partial-20260716-2130/`, `worker/temp/` e `youtube-cookies.txt` pertencem à VPS e devem ser preservados.

Correção preparada em `codex/reconcile-vps-deploy-queue`:

- `scripts/reconcile-interrupted-deploy.cjs --inspect` valida estado, locks/PIDs, hashes, fila, ancestralidade, `origin/main` e gera um plano imutável;
- `--execute` exige SHA/hash exatos, guarda evidência e backup privados, marca os ancestrais como `superseded`, mantém somente o alvo e conserva a VPS bloqueada;
- `DEPLOY_PM2_SCOPE=media-only scripts/deploy-vps.sh <sha>` atualiza somente `feedbot-media`, mantendo testes, fingerprint, health e rollback;
- `--complete` só remove o bloqueio depois que alvo, `main`, CI, aprovação, checkout e health apontam para o mesmo SHA;
- qualquer falha nas fases mutáveis restaura exatamente o estado anterior;
- 9 testes novos de recuperação e 2 regressões de escopo PM2 passaram; `npm run check:queue-reconciliation` aprovou 24 testes.
- `npm run ci` completo aprovou secret scan em 668 arquivos, typecheck, lints, 571 testes principais, 35 testes herméticos de deploy, 24 de reconciliação, worker, gates MCP/editoriais e build Vite.

Execução controlada concluída em 2026-08-02:

- o plano imutável identificou 43 itens na fila, alvo final único `93ae2a3` e nenhum processo antigo vivo;
- os três scripts extraídos do merge foram conferidos pelos hashes SHA-256 versionados;
- a reconciliação preservou evidência em diretório privado, marcou 43 estados como substituídos e manteve somente o alvo, ainda bloqueado;
- o deploy foi executado sob unidade transitória do systemd, sobrevivente à sessão SSH, e reiniciou apenas `feedbot-media`;
- 571 testes principais, 35 de deploy, 24 de reconciliação, sintaxe do worker, nginx e health foram aprovados na VPS;
- HEAD e `origin/main` coincidiram com `93ae2a3`; `feedbot-cuts` e `feedbot-webhook` não foram reiniciados;
- a conclusão criou um segundo backup, registrou `succeeded`/`mediaOnly=true`, esvaziou a fila e removeu `BLOCKED.json` por último;
- a conferência independente final confirmou os três processos PM2 online e health saudável.

Publicação GitHub: autenticação confirmada; o PR #51 foi criado, marcado como pronto e integrado pelo fallback autenticado do `gh`, pois a integração do aplicativo retornou 403 para essas mutações. Merge confirmado em `ad39d3e`.

Commits relevantes:

- `3f3ca74` — preview Fase 1;
- `6597c64` — classificação de domínio;
- `cfccbf5` — merge do PR #41;
- `c0106d3` — base anterior usada na reconciliação.
- `78379d9` — merge do PR #42 e SHA publicado no frontend.
- `ad39d3e` — merge do PR #51 com a Fase 2A.
- `1278649` — merge do PR documental #52.
- `1cb14c5` — merge do PR #53 com a correção da confirmação e das fontes.
- `3512454` — merge automático Lovable após aplicar a compatibilidade e regenerar tipos.
- `47a6652` — merge do PR #54 que remove a migration duplicada e mantém o histórico canônico.
- `d0dc3da` — merge do PR #55 com a correção SQLSTATE `42702`.
- `2b65b49` — merge automático Lovable que registra `20260801194149` e ajusta o teste.
- `c4e703d` — merge do PR #57 com a melhoria de qualidade e fallback seguro das imagens.
- `93ae2a3` — merge do PR #58 com a recuperação segura, implantado no worker VPS.

## Decisões que devem ser preservadas

1. Isolamento editorial por Instagram é obrigatório.
2. Carrossel é uma opção de produto, mas viaja como Feed com múltiplas mídias na Meta.
3. Preparação e publicação têm relógios distintos.
4. IA só avança após validação estruturada.
5. FFmpeg continua responsável pelo corte/render físico.
6. Stripe usa lookup keys e ambientes separados.
7. Pix/manual é válido sem cartão ou Stripe Customer e toda confirmação administrativa deve ser `live`.
8. Montar/refazer a análise editorial não escreve; somente a confirmação explícita pode aplicar fontes e pautas.
9. Feature flags começam desligadas.
10. Prompts Lovable são entregues ao usuário, não executados automaticamente.

## Inconsistências corrigidas pela documentação

- A `main` tinha apenas um README antigo e não continha os outros quatro documentos.
- O README antigo descrevia somente três camadas e omitia worker, Piloto, planos e operação atual.
- O suporte opcional xAI/Grok do worker não estava documentado.
- Funcionalidades já mescladas ainda apareciam como apenas “relatadas” na documentação da pasta antiga.
- O SHA real da `main` e o merge `cfccbf5` ainda não haviam sido confirmados.

As correções acima são documentais. Nenhum código de produto foi alterado nesta reconciliação.

## Bug P0 — Pix/manual pede cartão

### Diagnóstico mais recente e causa exata

A auditoria de 2026-08-01 consultou o cliente indicado de forma sanitizada e somente leitura. O resultado atual substitui a hipótese registrada anteriormente:

- há uma única assinatura para o cliente e ela está em `sandbox`;
- o registro está ativo, aprovado, vigente e sem IDs Stripe;
- `compute_subscription_access` retorna acesso válido em `sandbox`;
- a mesma RPC retorna `has_access=false`, motivo `no_subscription`, em `live`;
- o frontend publicado usa configuração Stripe classificada como `live`;
- portanto o gate pede checkout porque não existe assinatura de produção, não por exigir cartão em uma assinatura Pix válida.

A tela administrativa antiga agravava o erro: `admin_overview()` preferia live, mas fazia fallback para sandbox quando live não existia e não mostrava o ambiente. Assim, o admin via plano ativo/aprovado e acreditava ter liberado produção.

Nenhum UUID, e-mail, token ou identificador Stripe foi incluído nesta documentação.

### Correção definitiva implementada localmente

Arquivos do release:

- `supabase/migrations/20260801134000_manual_pix_live_subscriptions.sql` adiciona metadados manuais e as RPCs;
- `src/pages/dashboard/Admin.tsx` adiciona a ação Pix explícita;
- `src/integrations/supabase/types.ts` sincroniza os contratos;
- `src/test/manual-pix-live-subscriptions.test.ts` cobre seis contratos;
- `src/test/checkout-dual-environment.test.ts` fixa as escritas administrativas em live.

Comportamento:

1. somente admin com permissão financeira ou `service_role` executa;
2. plano deve existir e ser pago; valor deve ser positivo;
3. duração aceita é exatamente um mês;
4. ambiente gravado é sempre `live`;
5. Pix vigente é prorrogado um mês; vencido reinicia a partir de agora;
6. Stripe live gera conflito seguro e não é alterado;
7. a operação registra origem, valor, data, responsável e log sanitizado;
8. a listagem mostra `LIVE`, `PIX`/`Stripe`, valor e alerta para “somente sandbox”.

### Estado da implantação

- implementação: concluída;
- CI local completo: aprovado;
- PR/merge GitHub: concluído no PR #45, merge `6b362bf`;
- migration Supabase: aplicada e registrada como `20260801134000`;
- liberação live do cliente: Creator/`starter`, Pix R$ 97,97, válida até 01/09/2026;
- verificação de acesso: `has_access=true`, motivo `active`, ambiente `live`;
- publicação Lovable: concluída no deployment `24ce3f57-4740-4012-b109-f2c575a60929`;
- smoke do bundle: nova RPC e diálogo Pix presentes no artefato público;
- teste autenticado do cliente: aprovado em 2026-08-01.

## Bug P0 — Agência aparecia/limitava como Business e receita ficava zerada

Auditoria somente leitura concluída em 2026-08-01, sem registrar PII:

- existe uma assinatura Agência Pix não terminal em `live`, ativa, aprovada e válida por um mês;
- o pagamento manual registrado é R$ 1.500,00;
- `compute_subscription_access(..., 'live')` retorna `has_access=true`, plano efetivo `agency` e motivo `active`;
- o mesmo usuário também possui uma linha Business Stripe em `sandbox`;
- `get_user_plan()` retorna `business` porque consulta por usuário sem ambiente, ordenação ou validação do entitlement;
- `get_current_usage()` herda Business: 10 contas Instagram, 40 publicações/dia e 50 fontes, em vez dos limites Agência;
- o MRR da área financeira usa `plan_limits.price_brl`; Agência tem preço negociável nulo e aparece como R$ 0;
- o banco conserva corretamente `manual_amount_paid_brl=1500.00`, mas o frontend não usa esse campo no MRR, receita por plano ou “Valor/mês”.

Correção implementada na branch atual:

- `20260801144500_live_plan_and_pix_fallback.sql` torna `get_user_plan()` determinístico e exclusivo de `live`;
- `src/lib/billing.ts` centraliza `starter` → Creator, `agency` → Agência e o valor mensal por origem do pagamento;
- admin, editor de limites e cartão de uso exibem nomes públicos consistentes;
- MRR, receita por plano e assinantes pagantes usam o valor manual quando o pagamento é Pix;
- a RPC Pix substitui automaticamente apenas Stripe `canceled`, `unpaid` ou `incomplete_expired`; demais estados continuam bloqueados para evitar cobrança dupla;
- `src/test/live-agency-billing.test.ts` cobre isolamento live/sandbox, nomes, receita Pix negociável e fallback Stripe terminado.

Estado publicado e confirmado:

- PR #49 integrado no merge `e163226`, com “Validate application” aprovado em 1m54s;
- migration `20260801144500` aplicada e registrada no histórico do Supabase;
- consulta pós-migration resolveu `agency` e limites 50 contas, 60 publicações/dia e 100 fontes;
- Lovable sincronizou exatamente `e163226` e publicou o deployment `845c71ef-092d-4842-81c9-b0053fe25f9d`;
- bundle público contém os novos nomes, cálculo Pix e proteção de conflito Stripe;
- smoke autenticado mostrou Agência, R$ 1.500,00 no financeiro e MRR total recalculado;
- não houve erro do aplicativo no console; dois avisos observados pertenciam a uma extensão externa do Chrome.

O fluxo comercial confirmado permanece:

- Creator, Pro e Business usam Stripe com cartão e teste de sete dias;
- sem assinatura válida, o gate continua bloqueado e direciona ao checkout;
- Pix confirmado pelo admin cria/renova acesso `live` sem cartão;
- Agência não abre checkout automático e é negociada por contato/Pix;
- tentativas Stripe já terminadas podem virar Pix; qualquer estado ainda capaz de cobrar exige cancelamento no Stripe antes da liberação manual.

### Publicação histórica do gate — PR #42

- GitHub Actions: “Validate application” aprovado em 1m52s;
- imediatamente após o deploy, o Lovable confirmou `latest_commit_sha=78379d98de79f73a75a86e2b692fbaceceac4597`;
- após o PR documental #43, o repositório do projeto sincronizou `f65e6d3` sem alterar código funcional;
- deployment Lovable: `dda0fdfd-9c57-4eb2-864c-21a8f0a8b223`;
- `https://feed-bot-ai.lovable.app` redireciona para `https://fluxifeed.com`;
- home carregou com o título e H1 esperados, sem erro de console;
- `/auth` carregou formulário de e-mail/senha e provedores Google/Apple, sem erro de console;
- `/dashboard` sem sessão redirecionou para `/auth`, sem erro de console.

Esses smoke tests validam o gate do PR #42, mas não implantam o novo fluxo Pix live nem corrigem o registro sandbox do incidente atual. Nenhuma credencial ou PII foi usada.

## Estado externo ainda pendente

- demais migrations aplicadas no Supabase, além da Pix já confirmada;
- versões das Edge Functions;
- demais processos/versões externas além do worker VPS confirmado em `93ae2a3`;
- catálogo e assinaturas Stripe live;
- webhooks e retenção de logs;
- token e publicação Meta em conta de teste;
- flag real do Piloto em produção.
- migration `20260801170000` aplicada e registrada em 2026-08-01; nova versão de `discover-rss` publicada; frontend da Fase 2A ainda não publicado.
- migration corretiva registrada como `20260801185731` e nova versão de `discover-rss` implantadas; preview pronto, frontend de produção ainda não publicado.
- correção SQLSTATE `42702` registrada como `20260801194149`; aplicação autenticada aprovada, replay ainda pendente.
- frontend e três Edge Functions da melhoria de imagens publicados a partir de `c4e703d`; worker VPS atualizado em `93ae2a3`. Arquivos já gerados não mudam até nova captura/regeneração.
- fila VPS reconciliada e concluída: resultado terminal `succeeded`, fila vazia, bloqueio ausente e evidências preservadas.

Nenhuma dessas verificações deve ser inferida apenas pelo Git.

## Próximo passo exato

1. reler integralmente os cinco documentos no início da próxima etapa;
2. validar no GitHub a branch `codex/deploy-editorial-cuts-worker` e o escopo `cuts-only`;
3. auditar a VPS e, com o SHA final aprovado, implantar somente `feedbot-cuts`, sem remover manualmente o bloqueio conhecido nem reiniciar o webhook;
4. testar autenticado como administrador com vídeo real que contenha fala, sem agendar ou publicar;
5. após o aceite do smoke, confirmar/publicar o frontend de produção e remover a restrição temporária de administrador em mudança separada;
6. tratar o `SIGINT` do webhook em uma correção operacional independente;
7. tratar separadamente a recaptura da imagem e o replay do Piloto Editorial.

## Checklist de manutenção

Ao concluir qualquer funcionalidade:

1. atualizar execução/estado no `README.md`;
2. atualizar regras/roadmap no `PRODUCT.md`;
3. atualizar módulos/fluxos no `ARCHITECTURE.md`;
4. atualizar tarefas e bugs no `TASKS.md`;
5. registrar arquivos, decisões, riscos e próximo passo no `HANDOFF.md`.

Uma funcionalidade não está concluída enquanto esses cinco arquivos estiverem desatualizados.
