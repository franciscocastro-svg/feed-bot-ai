# Handoff — Flux & Feed

Data: **2026-08-01**

Objetivo: permitir continuidade sem depender do histórico de conversas.

## Leia primeiro

1. Leia integralmente os cinco documentos da raiz.
2. Não confunda Git, ambiente publicado e serviços externos.
3. Não apague nem inclua mudanças locais sem identificar o proprietário.
4. Não acione Lovable automaticamente; prompts devem ser entregues ao usuário para evitar consumo de créditos sem autorização.
5. Não faça deploy, migration, alteração Stripe/Meta/VPS ou publicação sem autorização explícita.
6. Ao concluir uma funcionalidade, atualize os cinco documentos no mesmo trabalho.

## Estado Git confirmado

### `main` auditada

- Remoto: `https://github.com/franciscocastro-svg/feed-bot-ai`.
- Release funcional publicada: `6b362bfda7aea7418a818c8ec4e40fa3451f94c1` — merge do PR #45.
- Correção Agência/financeiro publicada: `e163226209a640bc88fac9193579c8d92c1c1eea` — merge do PR #49.
- Base documental atual da branch: `a3c558b` — merge do PR #48.
- Branch funcional: `codex/fix-agency-billing-plan-labels`; commit `ec685d8`; integrada pelo PR #49.
- Base anterior: `a6c08830bf3187305d70921cb1f8a7ab338407ec` — merge documental do PR #44.
- Worktree limpa: `/private/tmp/fluxfeed-main-audit`.
- Branch atual: `codex/editorial-pilot-phase-2a`, criada a partir de `origin/main` em `b79c07c`, enviada ao remoto com o commit funcional `ec58f75`.
- PR rascunho [#51 — Add real source discovery to the editorial pilot](https://github.com/franciscocastro-svg/feed-bot-ai/pull/51), direcionado para `main`.
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
| Frontend Lovable | `6b362bf` sincronizado e publicado | teste autenticado aprovado |
| Piloto Editorial 2A | implementado somente na branch local | não aplicar migration nem publicar sem concluir os gates |
| Correção Agência | `e163226` + migration `20260801144500` | integrada, aplicada e publicada |
| Lovable pós-Agência | deployment `845c71ef-092d-4842-81c9-b0053fe25f9d` | smoke autenticado aprovado |
| Serviços externos restantes | parcialmente auditados | verificar cada serviço separadamente |

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

#### Fase 2A implementada localmente

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

Estado externo: migration, Edge Function, frontend e flag ainda não foram implantados.

Publicação GitHub: autenticação confirmada, commit funcional `ec58f75` enviado e PR rascunho #51 aberto. A integração GitHub do aplicativo retornou 403 para criação do PR; o fallback autenticado pelo `gh` concluiu a operação.

Commits relevantes:

- `3f3ca74` — preview Fase 1;
- `6597c64` — classificação de domínio;
- `cfccbf5` — merge do PR #41;
- `c0106d3` — base anterior usada na reconciliação.
- `78379d9` — merge do PR #42 e SHA publicado no frontend.

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
- processos/versão do worker VPS;
- catálogo e assinaturas Stripe live;
- webhooks e retenção de logs;
- token e publicação Meta em conta de teste;
- flag real do Piloto em produção.
- migration `20260801170000`, nova versão de `discover-rss` e frontend da Fase 2A ainda não publicados.

Nenhuma dessas verificações deve ser inferida apenas pelo Git.

## Próximo passo exato

1. reler integralmente os cinco documentos no início da próxima etapa;
2. aguardar os checks remotos e revisar o PR rascunho #51;
3. obter aprovação antes de integrar em `main`;
4. após aprovação, aplicar `20260801170000` e publicar `discover-rss` antes do frontend;
5. executar smoke autenticado com uma conta de teste, confirmando descoberta, seleção, replay e isolamento;
6. somente depois decidir se `VITE_FEATURE_EDITORIAL_PILOT_PREVIEW` será habilitada em produção.

## Checklist de manutenção

Ao concluir qualquer funcionalidade:

1. atualizar execução/estado no `README.md`;
2. atualizar regras/roadmap no `PRODUCT.md`;
3. atualizar módulos/fluxos no `ARCHITECTURE.md`;
4. atualizar tarefas e bugs no `TASKS.md`;
5. registrar arquivos, decisões, riscos e próximo passo no `HANDOFF.md`.

Uma funcionalidade não está concluída enquanto esses cinco arquivos estiverem desatualizados.
