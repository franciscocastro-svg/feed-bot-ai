# Reels Editoriais Configuráveis 6/20/30

## Objetivo

Permitir que cada cliente escolha, nas configurações globais, se os novos Reels
editoriais gerados a partir de uma imagem estática terão 6, 20 ou 30 segundos.
O valor padrão continua sendo 20 segundos, preservando o comportamento atual.

Esta configuração não é uma promessa de alcance. O resultado depende do
conteúdo, do público e da distribuição do Instagram e deve ser comparado nos
Insights da própria conta.

## Escopo funcional

- Reels editoriais de notícias com imagem estática: usam 6, 20 ou 30 segundos.
- Stories: permanecem inalterados; quando convertidos em vídeo continuam com 6 segundos.
- Cortes IA: preservam o MP4 e a duração flexível escolhida pela IA.
- Templates, pagamentos, Stripe, Meta, planos e Edge Functions: não mudam.

## Contrato técnico

- `user_settings.editorial_reel_duration_seconds` guarda a preferência global.
- `news_items.editorial_reel_duration_seconds` guarda o snapshot usado pelo render;
  ele fica nulo até o primeiro agendamento e o worker usa fallback de 20 nesse intervalo.
- Os dois campos aceitam somente `6`, `20` ou `30`; a preferência e o fallback usam `20` como padrão.
- O primeiro agendamento de Reel editorial ainda sem MP4 fixa o snapshot de forma
  atômica. Agendamentos adicionais e retries não o sobrescrevem.
- Notícias com `content_type = 'video_cut'` são explicitamente ignoradas pelo snapshot.
- Carrosséis também são excluídos porque não são Reels de imagem estática única.
- Retries leem o mesmo snapshot e, portanto, não mudam de duração se a preferência
  global for alterada depois do agendamento.
- O worker usa 30 fps: 180 frames para 6s, 600 para 20s e 900 para 30s.
- O zoom contínuo de até 4% é recalculado para ocupar toda a duração escolhida.
- O FFprobe valida a duração esperada com tolerância de até um segundo, além de
  H.264, AAC, 1080×1920 e `yuv420p`.

## Sequência futura de ativação

Este PR não aplica migration e não executa deploy. Quando houver autorização
separada, a ordem segura é:

1. Validar o gate dos artefatos da migration sem reaplicar SQL; a reconciliação
   já foi aplicada e auditada pelo Gate M2.
2. Implantar exatamente o SHA aprovado no VPS e reiniciar somente `feedbot-media`.
3. Executar canários de 20s, 6s e 30s e validar os arquivos com FFprobe.
4. Publicar o frontend pela Lovable somente após banco e worker estarem saudáveis.
5. Confirmar que um Story continua com 6s e que um Corte IA mantém sua duração original.

## Riscos e rollback

- 30 segundos consomem mais CPU, tempo de render e armazenamento que 20 segundos.
- Publicar o frontend antes da migration faria o salvamento do novo campo falhar.
- Implantar o worker antes da migration é compatível: a ausência do snapshot cai no
  fallback de 20 segundos, mas o seletor ainda não deve ficar visível.
- Para rollback, ocultar o seletor, fixar a preferência em 20 e reimplantar o worker
  anterior. As colunas e snapshots válidos permanecem; o rollback não apaga dados.

## Reconciliação Entrega Segura 1A.2-B.1

O Gate M0 somente leitura encontrou as colunas e constraints ativas, mas também
encontrou o trigger `snapshot_editorial_reel_duration` em `news_items` com
semântica diferente do contrato aprovado. O ledger interno de migrations não
pôde ser lido pelo papel do sandbox, portanto as três migrations históricas são
preservadas byte a byte e não serão reescritas.

O arquivo `20260720200000_reconcile_editorial_reel_duration.sql` permanece como
artefato-fonte. A Lovable aplicou SQL operacionalmente equivalente e registrou no
Git o artefato `20260720201720_5433215c-5def-4898-abe7-47b384988f98.sql`, com os
timeouts aprovados. Como o ledger não é legível pelo papel disponível, os dois
arquivos são preservados byte a byte e ficam explicitamente bloqueados para nova
aplicação.

Não há backfill dos snapshots existentes. Valores válidos, inclusive `NULL`,
permanecem como estão; itens antigos continuam no fallback de 20 segundos. A
migration também não altera status, mídia gerada, Cortes IA, carrosséis, Stories
ou registros de agendamento.

O SQL aplicado não usa `CASCADE`. O Gate M2 terminou com
`PASS_APPLIED_POSTCHECK_GREEN`, sem backfill e sem alterar snapshots existentes.
Qualquer futura operação de migration exige uma fase separada; este rollout não
possui migration editorial pendente.

## Reconciliação do artefato Lovable — Gate M2.2

`npm run check:editorial-migration-artifacts` valida os hashes e tamanhos exatos,
a equivalência operacional restrita, os timeouts e o manifesto de rollout. O gate
falha se um dos arquivos mudar, se surgir uma terceira cópia equivalente ou se a
release voltar a solicitar aplicação. Ele não lê nem altera banco ou ledger.

## Gates mínimos

- `npm ci`
- `npm run ci`
- `npm run check:editorial-migration-artifacts`
- `npx vitest run src/test/dynamic-reels-20s-1a.test.ts src/test/configurable-editorial-reels.test.ts`
- `npx vitest run src/test/editorial-reel-migration-reconciliation.test.ts`
- `node --check worker/index.js`
- `npm audit --omit=dev --audit-level=moderate --registry=https://registry.npmjs.org`
- revisão do diff para confirmar ausência de Edge Functions, pagamentos e templates
