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
- Release funcional publicada: `78379d98de79f73a75a86e2b692fbaceceac4597` — merge do PR #42.
- `origin/main` auditada: `a6c08830bf3187305d70921cb1f8a7ab338407ec` — merge documental do PR #44.
- Worktree limpa: `/private/tmp/fluxfeed-main-audit`.
- Branch de implementação atual: `codex/pix-live-manual-subscriptions`, criada diretamente sobre `a6c0883`.
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
| Código funcional em `main` | consolidado em `78379d9`; `main` atual em `a6c0883` após docs | base do app publicado |
| Branch do PR #42 | integrada em `main` | preservar histórico |
| Branch Pix live | implementação e CI local concluídos | integrar, migrar e publicar |
| Frontend Lovable | código funcional publicado de `78379d9`; docs posteriores sincronizadas | publicar o merge Pix live |
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

No candidato `codex/pix-live-manual-subscriptions`:

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
8. Preview editorial não escreve.
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

Arquivos do candidato:

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
- PR/merge GitHub: pendente;
- migration Supabase: pendente;
- liberação live do cliente: pendente;
- publicação Lovable: pendente;
- teste autenticado do cliente: pendente.

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

- migrations aplicadas no Supabase;
- versões das Edge Functions;
- processos/versão do worker VPS;
- catálogo e assinaturas Stripe live;
- webhooks e retenção de logs;
- token e publicação Meta em conta de teste;
- flag real do Piloto em produção.

Nenhuma dessas verificações deve ser inferida apenas pelo Git.

## Próximo passo exato

1. integrar `codex/pix-live-manual-subscriptions` após checks verdes;
2. aplicar a migration no Supabase do projeto;
3. registrar o pagamento confirmado do cliente como `starter` em `live`, com o valor recebido e validade de um mês;
4. confirmar pela RPC `has_access=true`, motivo `active` e plano efetivo em live;
5. publicar o frontend sincronizado pelo Lovable;
6. pedir ao cliente que saia, entre novamente e valide o dashboard;
7. registrar o resultado sem PII e continuar a auditoria comercial externa.

## Checklist de manutenção

Ao concluir qualquer funcionalidade:

1. atualizar execução/estado no `README.md`;
2. atualizar regras/roadmap no `PRODUCT.md`;
3. atualizar módulos/fluxos no `ARCHITECTURE.md`;
4. atualizar tarefas e bugs no `TASKS.md`;
5. registrar arquivos, decisões, riscos e próximo passo no `HANDOFF.md`.

Uma funcionalidade não está concluída enquanto esses cinco arquivos estiverem desatualizados.
