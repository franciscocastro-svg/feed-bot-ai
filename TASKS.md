# Tarefas — Flux & Feed

Última atualização: **2026-08-01**. Código funcional e frontend confirmados em `78379d9`; commits posteriores desta continuidade são somente documentais.

> Não mover uma tarefa para “Concluído” apenas porque existe em uma branch. Confirmar ancestralidade na `main`, testes e, quando aplicável, deployment.

## Concluído

### Produto e plataforma — confirmado na `main`

- [x] Base React/Vite/TypeScript e dashboard protegido.
- [x] Supabase Auth, banco, Storage, RLS/RPC e Edge Functions.
- [x] Contas Instagram por OAuth e conexão manual.
- [x] Fontes RSS, descoberta, captura, qualidade, deduplicação e filtro por conta.
- [x] Notícias, pautas, geração por prompt/tópico e estados editoriais.
- [x] Perfil de Criador e configurações global/conta/canal.
- [x] Feed, Stories, Reels e carrossel editorial.
- [x] Identidade de templates resolvida por Instagram.
- [x] Agendamento, autopiloto, limites por conta e publicador Meta.
- [x] Worker com Canvas, FFmpeg, retries, saúde e mídia.
- [x] Cortes de vídeo, legendas, qualidade e reaproveitamento.
- [x] Legendas/CTA adaptados ao Perfil de Criador.
- [x] Relevância temática de imagens para carrosséis.
- [x] Quatro ofertas: Creator, Pro, Business e Agência.
- [x] Checkout, portal, webhooks, reconciliação e guard contra duplicidade.
- [x] Agência por `contato@fluxifeed.com`.
- [x] Piloto Editorial Fase 1 em preview local sem escrita.
- [x] Classificação de fofoca, Direito, Saúde e Finanças com teste para “brasileiras”.

### Reconciliação desta continuidade

- [x] Catalogar e preservar as mudanças da pasta original.
- [x] Atualizar `origin/main` de `4c808028` para `c0106d3`.
- [x] Criar worktree limpa em `/private/tmp/fluxfeed-main-audit`.
- [x] Confirmar os commits relatados como ancestrais da `main`.
- [x] Executar `npm ci` na worktree limpa.
- [x] Executar a linha de base `npm run ci` com sucesso:
  - [x] secret scan;
  - [x] lint ratchet e lints por fases;
  - [x] typecheck;
  - [x] 519 testes principais aprovados e 33 ignorados;
  - [x] 33 testes herméticos de deploy;
  - [x] 15 testes de reconciliação de fila;
  - [x] sintaxe do worker;
  - [x] gates de migrations editoriais e MCP;
  - [x] build Vite.
- [x] Criar branch isolada `codex/reconcile-main-docs`.
- [x] Reconciliar `README.md`, `PRODUCT.md`, `ARCHITECTURE.md`, `TASKS.md` e `HANDOFF.md` com `c0106d3`.
- [x] Revisar whitespace e executar secret scan final em 653 arquivos de texto.
- [x] Auditar o candidato Pix/manual por consultas agregadas, somente leitura e sem PII.
- [x] Confirmar a RPC implantada e suas permissões.
- [x] Confirmar `has_access=true` para o candidato nos ambientes `live` e `sandbox`.
- [x] Corrigir o gate do frontend para depender somente de `has_access=true` ou admin.
- [x] Separar falha técnica, checkout, verificação, aprovação, expiração e bloqueio na UI.
- [x] Adicionar 19 testes de regressão de acesso; suíte principal passou com 538 testes.
- [x] Executar novamente o CI completo, incluindo deploy, reconciliação, MCP e build.
- [x] Versionar a correção e os cinco documentos no commit inicial `021065a`.
- [x] Enviar `codex/reconcile-main-docs` ao GitHub e abrir o PR rascunho #42.
- [x] Confirmar o check remoto “Validate application” do PR #42.
- [x] Integrar o PR #42 em `main` no merge `78379d9`.
- [x] Confirmar que o Lovable sincronizou exatamente `78379d9`.
- [x] Publicar o frontend e executar smoke tests públicos de home, autenticação e rota protegida.
- [x] Integrar o registro pós-deploy pelo PR #43 e finalizar os cinco documentos.

## Em desenvolvimento

- [ ] **Acesso Pix/manual:** correção integrada e publicada; falta validar a sessão autenticada do cliente.
- [ ] **Prontidão comercial:** confirmar frontend live, catálogo Stripe, Edge Functions, webhooks, banco, Meta e VPS.
- [ ] **Piloto Editorial:** manter restrito a preview até decisão explícita de rollout.

## Próximas tarefas

### P0 — acesso Pix/manual

- [x] Identificar o candidato somente por critérios internos, sem registrar PII.
- [x] Auditar `compute_subscription_access` em `live` e `sandbox`.
- [x] Conferir a linha selecionada em `user_subscriptions`:
  - [x] ambiente;
  - [x] plano pago;
  - [x] `status` aceito;
  - [x] `approval_status=approved`;
  - [x] e-mail verificado;
  - [x] `access_frozen=false`;
  - [x] `expires_at`/`current_period_end`;
  - [x] ausência de reembolso e estado terminal.
- [x] Confirmar que nenhuma linha mais recente inválida sombreia a assinatura válida.
- [x] Mapear os valores de `reason` para mensagens seguras de UI.
- [x] Remover a suposição `hasCardBackedAccess`.
- [x] Garantir que Pix/manual não dependa de `stripe_customer_id`.
- [x] Adicionar testes de regressão para acesso manual válido e motivos de bloqueio.
- [x] Rodar CI completo, secret scan e build.
- [x] Atualizar os cinco documentos.
- [x] Confirmar checks verdes e revisar o PR #42.
- [x] Integrar o PR em `main` com o SHA aprovado `78379d9`.
- [x] Implantar o frontend pelo Lovable com o SHA aprovado.
- [ ] Validar o acesso do cliente após o deploy.

### P0 — auditoria comercial externa

- [ ] Comparar SHA de GitHub, frontend publicado, Edge Functions e worker VPS.
- [ ] Confirmar migrations aplicadas no banco correto.
- [ ] Confirmar preços/lookup keys live:
  - [ ] `starter_monthly` — R$ 97,97;
  - [ ] `pro_monthly` — R$ 197,97;
  - [ ] `business_monthly` — R$ 437,97.
- [ ] Confirmar que Agência não abre checkout.
- [ ] Executar E2E seguro: cadastro → checkout → webhook → acesso → portal.
- [ ] Confirmar Pix/manual sem cartão.
- [ ] Validar conexão/publicação Meta em conta de teste.

### P1 — Piloto Editorial Fase 2

- [ ] Adicionar edição da proposta.
- [ ] Selecionar/rejeitar fontes e pautas individualmente.
- [ ] Mostrar diff exato do que será criado.
- [ ] Exigir confirmação explícita e idempotência.
- [ ] Persistir somente após contrato e isolamento validados.
- [ ] Preparar rollback transacional.
- [ ] Testar contas de mesmo nicho com vozes/públicos diferentes.
- [ ] Exigir revisão humana em Direito, Saúde e Finanças.

### P1 — confiabilidade editorial

- [ ] Medir repetição de tema, legenda, CTA e imagem.
- [ ] Priorizar imagem original quando legal e tecnicamente adequada.
- [ ] Avaliar imagens temáticas por relevância e licença.
- [ ] Usar capa tipográfica quando não houver imagem segura.
- [ ] Melhorar fallback quando todos os provedores falharem.
- [ ] Garantir por teste que falha de uma conta não interrompe as demais.

### P2 — operação e observabilidade

- [ ] Dashboard de filas por Instagram e motivo de bloqueio.
- [ ] Alertas de token Meta próximo do vencimento.
- [ ] SLOs para cron, worker, Edge Functions e Stripe.
- [ ] Auditoria automática de drift de SHA/migration.
- [ ] Relatório de custo de IA por tarefa/cliente/conta.

## Backlog

- [ ] OpenRouter opcional e centralizado.
- [ ] Modelos configuráveis sem deploy.
- [ ] Orçamentos globais, diários, mensais, por cliente e Instagram.
- [ ] Simulação/comparação de provedores.
- [ ] TikTok e novos canais.
- [ ] Música/licenciamento compatível com APIs.
- [ ] Marketplace de templates.
- [ ] Colaboração de equipe/agência.
- [ ] Analytics de conversão e testes A/B.
- [ ] Biblioteca de fontes por profissão/nicho.
- [ ] Onboarding que propõe Perfil, Fontes, Pautas e cadência.
- [ ] Experiência mobile dedicada.

## Bugs e riscos conhecidos

### Críticos/altos

- [x] **Correção Pix/manual implantada:** frontend publicado no SHA `78379d9`; falta a validação autenticada do cliente.
- [ ] **Estado externo parcialmente confirmado:** o código funcional e o frontend estão em `78379d9`, mas isso não comprova migrations, preços, Edge Functions, Meta ou VPS.
- [x] **Registro pós-deploy integrado:** os cinco documentos registram merge, publicação, testes e próximos passos.

### Médios

- [ ] `.env.development` rastreado contém configuração de preview; confirmar que produção não herda esse arquivo.
- [ ] Alguns bloqueios de acesso não apresentam o `reason` real.
- [ ] Provedores de IA podem retornar 503; fila deve preservar retry e causa sanitizada.
- [ ] Imagens ainda podem ser repetidas ou pouco relacionadas.
- [ ] Retenção curta de logs pode impedir diagnóstico de webhook.
- [ ] `AuthContext.tsx` tem dois warnings ESLint preexistentes, sem erros.

### Ambiente de desenvolvimento

- [ ] O gate hermético de deploy pode depender de `/usr/bin/grep` em outros sandboxes.
- [ ] A pasta original possui arquivos grandes e mudanças não rastreadas que não pertencem à branch de reconciliação.

## Critério de conclusão

- [ ] escopo e diff revisados;
- [ ] isolamento por usuário/Instagram validado;
- [ ] testes, typecheck e build proporcionais ao risco;
- [ ] migrations e deploys tratados separadamente;
- [ ] segurança e logs sanitizados;
- [ ] rollback definido;
- [ ] `README.md`, `PRODUCT.md`, `ARCHITECTURE.md`, `TASKS.md` e `HANDOFF.md` atualizados.
