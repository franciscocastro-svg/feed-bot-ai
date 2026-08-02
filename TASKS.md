# Tarefas — Flux & Feed

Última atualização: **2026-08-02**. O smoke com fala revelou timeout/JSON truncado no Gemini; a correção está implementada e testada somente em branch local, sem deploy. Os dois jobs travados ainda precisam ser cancelados antes do novo teste.

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

### Concluído na `main` pelo PR #51 — implantação parcial

- [x] Auditar integralmente Perfil do Criador, Piloto Editorial e descoberta de fontes.
- [x] Conectar o Piloto à descoberta real de RSS e monitoramento temático em modo sem escrita.
- [x] Exibir diagnóstico, qualidade e amostras recentes por fonte.
- [x] Permitir seleção/rejeição individual de fontes e pautas.
- [x] Mostrar resumo exato e exigir confirmação explícita.
- [x] Revalidar as fontes no servidor antes da gravação.
- [x] Aplicar fontes, vínculos e pautas por RPC transacional, isolada e idempotente.
- [x] Preservar cadência e publicações sem mutação nesta fase.
- [x] Adicionar testes de seleção, contrato, isolamento e idempotência.
- [x] Executar `npm run ci`: 551 testes principais, 33 de deploy e 15 de reconciliação aprovados; build verde.
- [x] Enviar a branch, abrir o PR rascunho #51 e obter `Validate application` verde no head `ad3411a`.
- [x] Revalidar o head final `401d849` e integrar o PR #51 no merge `ad39d3e`.
- [x] Abrir o PR documental rascunho #52 e obter `Validate application` verde no commit `0098c25`.
- [x] Integrar o PR documental #52 no merge `1278649`.
- [x] Aplicar e registrar `20260801170000_editorial_pilot_phase_2a.sql` no Supabase conectado.
- [x] Confirmar tabela/RPC, permissão para `authenticated`, bloqueio de `anon` e ledger inicialmente vazio.
- [x] Publicar somente `discover-rss` pela Lovable e confirmar externamente a rejeição anônima com HTTP 401.
- [x] Auditar a divergência da resposta Lovable: o deploy criou `e290ac0` na `main`, alterando somente os tipos Supabase regenerados.
- [x] Validar `e290ac0` com CI completo: 551 testes principais, 33 de deploy, 15 de reconciliação, typecheck e build aprovados.
- [ ] Publicar o frontend e executar o smoke autenticado antes de decidir a ativação da flag em produção.

### Correção do primeiro teste autenticado — PR #53

- [x] Reproduzir a falha da confirmação sem persistência e identificar o erro PostgreSQL `42883`.
- [x] Confirmar contagens zero no ledger, nas fontes e nas pautas criadas pelo piloto após a falha.
- [x] Criar migration aditiva de compatibilidade para coluna, função, trigger e backfill de fingerprint.
- [x] Separar mensagens de descoberta e aplicação e sanitizar o erro retornado pela Edge.
- [x] Auditar as fontes rejeitadas e distinguir rejeições corretas de falsos negativos.
- [x] Substituir URLs inválidas por Quem e Metrópoles oficiais, remover UOL Splash 404 e ampliar a relevância de entretenimento.
- [x] Aprovar 48 testes direcionados, TypeScript e ESLint dos arquivos alterados.
- [x] Executar `npm run ci`: 555 testes principais, 33 de deploy, 15 de reconciliação e build aprovados.
- [x] Atualizar o PR #53 e obter o check remoto `Validate application` verde no commit funcional `80debad`.
- [x] Integrar o PR #53 no merge `1cb14c5`.
- [x] Aplicar a compatibilidade sob a versão registrada `20260801185731` e verificar 59 fingerprints preenchidos.
- [x] Republicar somente `discover-rss`, manter HTTP 401 anônimo e sincronizar o preview.
- [x] Auditar o merge automático Lovable `3512454` e reconciliar a migration duplicada com o histórico real.
- [x] Integrar a reconciliação pelo PR #54 no merge `47a6652`.
- [x] Reproduzir o segundo smoke e identificar `source_id` ambíguo no `ON CONFLICT` com SQLSTATE `42702`.
- [x] Confirmar novamente zero aplicações, fontes e pautas após o rollback.
- [x] Criar a correção, registrada pela plataforma como `20260801194149`, com `v_source_id`, PK explícita e contagem por `ROW_COUNT`.
- [x] Executar `npm run ci`: 555 testes principais, 33 de deploy, 15 de reconciliação e build aprovados.
- [x] Integrar o PR #55 no merge `d0dc3da` e aplicar a correção sob a versão registrada `20260801194149`.
- [x] Aprovar o smoke principal: 7 fontes resolvidas/vinculadas, 4 pautas, 1 ledger e nenhuma publicação.
- [ ] Repetir a mesma proposta para confirmar `replayed=true` antes de decidir a flag de produção.

### Qualidade de imagens — integrada, implantação parcial

- [x] Diagnosticar a matéria real: miniatura Bing 100×100 ampliada para 1080×1920.
- [x] Classificar miniaturas e candidatos da própria matéria por metadados, origem e resolução declarada.
- [x] Priorizar `primaryImageOfPage`, JSON-LD, `og:image`, figuras e `srcset` sem pesquisar imagens externas pelo tema.
- [x] Preservar a miniatura original quando nenhuma alternativa relacionada estiver disponível.
- [x] Atualizar duplicatas existentes quando sua imagem armazenada for reconhecidamente fraca.
- [x] Limitar a ampliação do fallback pequeno no navegador e no worker, com fundo protegido e suavização alta.
- [x] Confirmar no caso real a imagem relacionada de 1200×747.
- [x] Aprovar 38 testes direcionados, typecheck e CI completo com 562 testes principais, 33 de deploy, 15 de reconciliação e build.
- [x] Integrar a branch pelo PR #57 no merge `c4e703d`.
- [x] Publicar o frontend e republicar `fetch-rss`, `preview-source` e `discover-rss` pelo Lovable no conteúdo de `c4e703d`.
- [x] Implantar somente o worker de mídia no merge final `93ae2a3`, com testes, nginx, PM2 e health aprovados.
- [ ] Recapturar/regenerar a matéria e executar o smoke visual da imagem 1200×747.

### Recuperação da fila VPS interrompida

- [x] Auditar a VPS somente leitura: HEAD `a2be3f5`, PM2 online, health HTTP 200 e nenhum PID antigo em execução.
- [x] Confirmar causa: deploy interrompido por `SIGINT`, bloqueio `deploy_process_exit_unobserved`, estado ativo órfão e 42 itens na fila.
- [x] Confirmar `c4e703d` como último item único, aprovado e sem resultado terminal; preservar arquivos não rastreados da VPS.
- [x] Implementar inspeção imutável, plano com hash, evidência/backup, supersessão dos ancestrais, conclusão com validação exata e restauração integral em falha.
- [x] Adicionar `DEPLOY_PM2_SCOPE=media-only` sem reduzir checkout, testes, health ou rollback.
- [x] Aprovar 9 testes de recuperação e 2 regressões do escopo de PM2; `check:queue-reconciliation` aprovou 24 testes.
- [x] Executar o CI completo: 668 arquivos no secret scan, 571 testes principais, 35 de deploy, 24 de reconciliação, worker, gates e build aprovados.
- [x] Enviar a branch, abrir o PR #58 e confirmar `Validate application` verde no head final `df33a08`.
- [x] Obter aprovação e integrar o PR #58 no merge `93ae2a3`.
- [x] Na VPS, validar hashes/plano, preservar evidências, reduzir a fila de 43 para 1 e manter o bloqueio até o deploy.
- [x] Implantar somente `feedbot-media`, confirmar HEAD/main/health e concluir com fila vazia, bloqueio removido e resultado `succeeded`.

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
- [x] Registrar a auditoria inicial do PR #42; a auditoria mais recente abaixo substitui sua conclusão sobre o cliente atual.
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

- [x] **Pix administrativo live:** implementação, implantação e teste autenticado do cliente concluídos.
- [x] **Agência live:** resolvedor, financeiro, nomes e fallback Pix corrigidos, integrados e validados em produção.
- [x] **Perfil do Criador:** auditoria concluída e primeiro recorte funcional implementado localmente.
- [ ] **Prontidão comercial:** confirmar frontend live, catálogo Stripe, Edge Functions, webhooks, banco, Meta e VPS.
- [ ] **Piloto Editorial:** executar o replay idempotente e decidir rollout/publicação do frontend de produção.
- [ ] **Qualidade de imagens:** frontend, Edge Functions e worker publicados; regenerar o caso de teste e confirmar visualmente a origem 1200×747.
- [x] **Fila VPS:** recuperação integrada e executada; evidências preservadas, releases intermediários não executados, fila vazia e health aprovado.
- [ ] **Corte Editorial:** base integrada no PR #64/merge `5105bca`, migration registrada como `20260802164442`, frontend publicado e `feedbot-cuts` em `efc8d15`. A correção local Gemini ainda precisa de revisão, PR e implantação isolada antes de repetir o smoke.

### P1 — Corte Editorial

- [x] Adicionar Corte tradicional, Corte com legendas e Corte editorial sem remover os formatos atuais.
- [x] Organizar Cortes IA nas subabas `Criar corte` e `Meus cortes`, com os três formatos como subabas de criação.
- [x] Restringir temporariamente a Beta editorial a administradores na UI, RPCs, Edge Function e trigger anti-bypass.
- [x] Compor o Corte Editorial em Feed 1080 × 1350 ou Reel 1080 × 1920 com cabeçalho, título, comentário, mídia e rodapé.
- [x] Corrigir a incompatibilidade de criação com os estilos Bold/Clean sem alterar os criadores legados.
- [x] Persistir estilo, formato, `cut_mode` e bloqueio de autopublicação na mesma transação.
- [x] Manter Feed quadrado e todos os formatos antigos inalterados.
- [x] Aprovar CI completo: secret scan em 676 arquivos, 588 testes principais, 36 de deploy, 24 de reconciliação, worker, gates e build.
- [x] Confirmar por smoke sintético Reel 1080×1920, H.264/yuv420p e AAC 48 kHz sem publicação.
- [x] Usar transcrição como fonte principal e frames somente como complemento sem identificação facial.
- [x] Validar evidência literal, números e confiança; usar fallback neutro com revisão necessária.
- [x] Criar prévia separada do vídeo final e impedir autopublicação.
- [x] Permitir editar título, comentário, trecho, enquadramento, fonte, cores e legendas.
- [x] Regenerar somente texto sem escrita, rerender ou agendamento.
- [x] Recalcular a transcrição/legendas quando o trecho mudar.
- [x] Preservar proporção e limitar ampliação de vídeo pequeno.
- [x] Cobrir os três enquadramentos e sincronia por contratos automatizados.
- [x] Validar 586 testes principais, 35 de deploy, 24 de reconciliação, worker, gates, MCP e build; três timeouts sob carga concorrente passaram isoladamente.
- [x] Renderizar os cenários vertical, horizontal e de baixa resolução em ambiente FFmpeg isolado, sem banco ou publicação.
- [x] Confirmar tecnicamente 1080×1350, H.264/yuv420p, AAC 48 kHz, legendas queimadas e áreas seguras.
- [x] Obter aceite visual do usuário para nitidez e enquadramento.
- [ ] Repetir áudio e sincronia com um vídeo real que contenha fala; o arquivo fornecido não possui áudio.
- [x] Revisar e preparar um commit separado da funcionalidade.
- [x] Enviar `codex/editorial-ai-cut`, abrir o PR #60 e integrar a base do Corte Editorial em `acc8363`.
- [x] Obter `Validate application` verde em 2m01s para `5dee08a`.
- [x] Abrir o PR rascunho #61 para a Beta administrativa e obter `Validate application` verde em 1m47s.
- [x] Integrar o PR #61 no merge `e433493`.
- [x] Aplicar a migration sob o registro `20260802144135`, recarregar o schema e verificar colunas, RPCs, triggers e ACLs.
- [x] Implantar somente `regenerate-cut-editorial-text` e confirmar HTTP 401 sem autenticação.
- [x] Auditar os testes falhos: quatro jobs `failed`, zero clipes, zero agendamentos e zero publicações.
- [x] Validar o escopo `cuts-only` no CI e implantar somente `feedbot-cuts` no merge `67ced14`, sem reiniciar o webhook ou o worker de mídia.
- [x] Integrar pelo PR #64, aplicar a migration como `20260802164442`, publicar o frontend e atualizar somente `feedbot-cuts` no SHA `efc8d15`.
- [x] Diagnosticar o smoke travado: somente Gemini configurado, blocos de 600 segundos, resposta JSON truncada, timeouts sucessivos, primeiro job em 25% e segundo aguardando a fila serial.
- [x] Implementar localmente blocos Gemini de 120 segundos, timeout limitado, uma repetição transitória, schema JSON, recuperação de objetos completos e progresso incremental.
- [x] Corrigir localmente o worker para respeitar `feed_portrait` ou `reels` no Corte Editorial, em vez de forçar 4:5.
- [x] Aprovar 34 testes direcionados, 591 testes principais, 36 de deploy, 24 de reconciliação, worker, gates, MCP e build para a correção Gemini.
- [ ] Cancelar os dois jobs travados e devolver somente os créditos reservados sem clipes, com `feedbot-cuts` interrompido para evitar corrida.
- [x] Revisar e preparar um commit separado na branch local `codex/fix-gemini-cut-transcription`.
- [ ] Enviar a branch, abrir PR e, após aprovação, implantar somente `feedbot-cuts`.
- [ ] Repetir o smoke com um vídeo curto e apenas um corte; depois validar 4:5 e 9:16 sem publicação.
- [ ] Executar smoke autenticado 4:5 e 9:16 com fala real, sem agendar ou publicar.

## Próximas tarefas

### P0 — acesso Pix/manual

- [x] Reproduzir o incidente atual sem registrar PII: cliente com assinatura somente `sandbox`.
- [x] Confirmar `compute_subscription_access(..., 'live') = no_subscription` e acesso válido apenas em sandbox.
- [x] Identificar o fallback de `admin_overview()` que apresentava sandbox como se fosse a assinatura principal.
- [x] Criar migration com origem Pix, valor recebido, data e administrador responsável.
- [x] Criar `admin_subscription_overview()` sem fallback sandbox→live.
- [x] Criar `admin_upsert_pix_subscription()` com plano, valor e duração fixa de um mês.
- [x] Garantir que o fluxo Pix grave somente `live` e nunca sobrescreva Stripe.
- [x] Adicionar diálogo administrativo com badges `LIVE`/`PIX`, plano, valor e notas.
- [x] Adicionar 6 testes de contrato do fluxo e atualizar regressão dual-environment.
- [x] Executar `npm run ci`: 544 testes principais, 33 de deploy e 15 de reconciliação aprovados; build verde.
- [x] Atualizar os cinco documentos antes da publicação.
- [x] Abrir PR #45, obter checks verdes e integrar em `main` no merge `6b362bf`.
- [x] Aplicar e registrar `20260801134000_manual_pix_live_subscriptions.sql` no Supabase correto.
- [x] Registrar o cliente afetado como Creator/`starter`, R$ 97,97, em `live` por um mês.
- [x] Confirmar `has_access=true`, motivo `active` e plano efetivo em `live`.
- [x] Publicar o frontend Lovable sincronizado com `6b362bf`.
- [x] Cliente confirmou novo teste autenticado com acesso ao dashboard.

### P0 — plano Agência e financeiro Pix

- [x] Confirmar assinatura Agência Pix ativa em `live`, sem Stripe, com valor manual registrado.
- [x] Confirmar que `compute_subscription_access(..., 'live')` retorna plano efetivo `agency` e acesso ativo.
- [x] Reproduzir `get_user_plan()` e `get_current_usage()` retornando Business por selecionar uma linha sandbox sem filtro determinístico.
- [x] Reproduzir MRR Agência em R$ 0 apesar de existir valor Pix manual de R$ 1.500,00.
- [x] Confirmar que Creator, Pro e Business continuam no checkout Stripe com cartão e Agência permanece comercial/Pix.
- [x] Criar migration que resolva plano/limites pelo entitlement `live` válido.
- [x] Fazer MRR, receita por plano e assinantes pagantes priorizarem `manual_amount_paid_brl` em pagamentos Pix.
- [x] Cobrir Agência live + Business sandbox e receita Pix negociável com testes de regressão.
- [x] Definir fallback seguro Stripe→Pix: substituir somente estados já terminados e bloquear estados que ainda possam cobrar.
- [x] Normalizar os nomes públicos no admin e cartão de uso sem renomear as chaves internas.
- [x] Rodar CI completo: 548 testes principais, 33 de deploy, 15 de reconciliação e build aprovados.
- [x] Integrar pelo PR #49 no merge `e163226` e aplicar `20260801144500` no Supabase.
- [x] Sincronizar/publicar no Lovable e executar smoke autenticado de Agência, limites e financeiro.
- [x] Confirmar visualmente Creator/Agência sem `starter`, limites Agência 50/60/100 e valor Pix de R$ 1.500,00 no MRR.

### Histórico do gate de acesso — PR #42

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
- [x] Validar que o frontend não exige cartão quando a RPC retorna acesso manual válido.

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
- [x] Selecionar/rejeitar fontes e pautas individualmente.
- [x] Mostrar resumo exato do que será criado.
- [x] Exigir confirmação explícita e idempotência.
- [x] Persistir somente após revalidação e isolamento validados.
- [x] Garantir rollback automático da transação em caso de falha.
- [ ] Adicionar ação explícita para desfazer uma aplicação já concluída.
- [ ] Aplicar cadência somente por confirmação separada.
- [ ] Testar contas de mesmo nicho com vozes/públicos diferentes.
- [ ] Exigir revisão humana em Direito, Saúde e Finanças.

### P1 — confiabilidade editorial

- [ ] Medir repetição de tema, legenda, CTA e imagem.
- [x] Priorizar a imagem principal da própria matéria quando tecnicamente adequada, mantendo fallback.
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

- [x] **Liberação Pix no ambiente errado:** causa confirmada e corrigida; migration, assinatura live e frontend foram publicados.
- [x] **Agência degradada para Business nos limites:** corrigido e validado em produção.
- [x] **Receita Agência zerada:** corrigido e validado em produção com o valor Pix registrado.
- [ ] **Estado externo parcialmente confirmado:** o release Pix funcional está em `6b362bf`, mas isso não comprova todas as migrations, preços, Edge Functions, Meta ou VPS.
- [ ] **Fila VPS bloqueada novamente após implantação posterior:** VPS e `origin/main` estão em `fbe6a2a`, PM2/health continuam saudáveis, mas o reload do próprio webhook recebeu `SIGINT` e deixou `deploy_process_exit_unobserved`. Não remover `BLOCKED.json`; corrigir em branch operacional separada.
- [ ] **Fase 2A parcialmente implantada:** migration e `discover-rss` aplicadas e verificadas; frontend ainda não publicado, e a flag continua desligada por padrão.
- [x] **Confirmação bloqueada por drift de schema:** compatibilidade registrada como `20260801185731`, backfill verificado e Edge corrigida publicada; a etapa posterior avançou até revelar e corrigir o SQLSTATE `42702`.
- [x] **Confirmação bloqueada por variável ambígua:** SQLSTATE `42702` corrigido e registrado em `20260801194149`; smoke autenticado aprovado.
- [x] **Registro pós-deploy integrado:** os cinco documentos registram merge, publicação, testes e próximos passos.

### Médios

- [ ] `.env.development` rastreado contém configuração de preview; confirmar que produção não herda esse arquivo.
- [ ] Alguns bloqueios de acesso não apresentam o `reason` real.
- [ ] Provedores de IA podem retornar 503; fila deve preservar retry e causa sanitizada.
- [ ] Imagens ainda podem ser repetidas; a nova seleção evita busca externa e limita os candidatos à própria matéria, mas o smoke publicado permanece pendente.
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
