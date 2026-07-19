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

1. Aplicar a migration aditiva e conferir defaults, constraints e trigger.
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
  anterior. A migration é aditiva e pode permanecer sem apagar dados.

## Gates mínimos

- `npm ci`
- `npm run ci`
- `npx vitest run src/test/dynamic-reels-20s-1a.test.ts src/test/configurable-editorial-reels.test.ts`
- `node --check worker/index.js`
- `npm audit --omit=dev --audit-level=moderate --registry=https://registry.npmjs.org`
- revisão do diff para confirmar ausência de Edge Functions, pagamentos e templates
