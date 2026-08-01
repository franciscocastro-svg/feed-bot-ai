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
- `origin/main`: `c0106d3f5a40776896263378941e8834341d669d` — `Sincronizou Preview e verificou`.
- Worktree limpa: `/private/tmp/fluxfeed-main-audit`.
- Branch de continuidade: `codex/reconcile-main-docs`, criada diretamente sobre `c0106d3`.
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
| `origin/main` | consolidada em `c0106d3` | base da continuidade |
| Branch de docs | alterações apenas na worktree limpa | revisar/versionar |
| Produção | não auditada nesta tarefa | verificar cada serviço separadamente |

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
- `c0106d3` — sincronização atual da `main`.

## Decisões que devem ser preservadas

1. Isolamento editorial por Instagram é obrigatório.
2. Carrossel é uma opção de produto, mas viaja como Feed com múltiplas mídias na Meta.
3. Preparação e publicação têm relógios distintos.
4. IA só avança após validação estruturada.
5. FFmpeg continua responsável pelo corte/render físico.
6. Stripe usa lookup keys e ambientes separados.
7. Pix/manual é válido sem cartão ou Stripe Customer.
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

### Auditoria somente leitura concluída

Foi usado o conector de banco do projeto apenas com `SELECT`, sem prompts ao agente Lovable, sem consumo do fluxo de edição e sem mutações.

Resultados sanitizados:

- existe um único candidato manual `live`, Pro, ativo, aprovado e sem customer/subscription Stripe;
- e-mail está verificado;
- acesso não está congelado;
- não há reembolso nem estado terminal;
- a vigência estava válida no momento da auditoria;
- a RPC implantada tem o comentário/contrato esperado e pode ser executada por `authenticated` e `service_role`, não por `anon`;
- `compute_subscription_access` retornou `has_access=true`, plano Pro e motivo `active` em `live` e `sandbox` para o candidato;
- o token publicável versionado para build de produção é classificado como `live`.

Nenhum UUID, e-mail, token ou identificador Stripe foi incluído na documentação.

### Causa comprovada no código

Na base `c0106d3`, `src/components/ProtectedRoute.tsx` chamava `compute_subscription_access` e, quando o retorno não satisfazia `hasCardBackedAccess`, exibia “Ative seus 7 dias com cartão” independentemente do valor de `reason`.

A RPC não exige cartão nem `stripe_customer_id`. Ela avalia:

- ambiente `sandbox|live`;
- linha não terminal mais recente;
- plano pago;
- status `active`, `trialing` ou `past_due` dentro da tolerância;
- aprovação;
- verificação de e-mail;
- congelamento e reembolso;
- `expires_at`/`current_period_end`.

O banco e a RPC atuais liberam o candidato. A falha comprovada está no gate de frontend:

- exceções da RPC eram engolidas e convertidas em `subscription=null`;
- `subscription=null` sempre mostrava a tela de cartão;
- o nome `hasCardBackedAccess` introduzia uma suposição incorreta;
- o fallback podia liberar conteúdo quando `has_access=false` em certos estados de e-mail/aprovação.

### Correção implementada na branch

- `src/lib/subscriptionAccess.ts` classifica o resultado de acesso de forma pura e fail-closed;
- somente `has_access=true` ou admin libera o conteúdo;
- erro técnico mostra indisponibilidade e permite retry, sem mencionar cartão;
- checkout aparece apenas para `no_subscription` e `no_paid_plan`;
- e-mail, aprovação, negação, expiração e problema de pagamento têm telas distintas;
- `src/test/subscription-access.test.ts` cobre 14 casos de classificação;
- `src/test/protected-route-access.test.tsx` cobre 5 fluxos do componente, inclusive Pix/manual e retry.

Essa correção ainda não foi commitada, enviada ou implantada.

## Estado externo ainda pendente

- SHA do frontend publicado;
- migrations aplicadas no Supabase;
- versões das Edge Functions;
- processos/versão do worker VPS;
- catálogo e assinaturas Stripe live;
- webhooks e retenção de logs;
- token e publicação Meta em conta de teste;
- flag real do Piloto em produção.

Nenhuma dessas verificações deve ser inferida apenas pelo Git.

## Próximo passo exato

1. revisar o diff completo da branch `codex/reconcile-main-docs`;
2. versionar código, testes e documentação quando autorizado;
3. publicar por deployment controlado com SHA exato e rollback;
4. validar o acesso do cliente e a mensagem de erro após o deploy;
5. continuar a auditoria comercial externa.

## Checklist de manutenção

Ao concluir qualquer funcionalidade:

1. atualizar execução/estado no `README.md`;
2. atualizar regras/roadmap no `PRODUCT.md`;
3. atualizar módulos/fluxos no `ARCHITECTURE.md`;
4. atualizar tarefas e bugs no `TASKS.md`;
5. registrar arquivos, decisões, riscos e próximo passo no `HANDOFF.md`.

Uma funcionalidade não está concluída enquanto esses cinco arquivos estiverem desatualizados.
