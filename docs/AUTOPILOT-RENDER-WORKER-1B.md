# Autopiloto Render Worker 1B

## Objetivo

Evitar `CPU Time exceeded` no `process-news` sem reduzir a qualidade das artes. A Edge Function continua responsável por claim, extração, reescrita e preparação editorial; Canvas, fontes, templates, enquadramento e geração do vídeo passam a ser executados pelo worker `feedbot-media` no VPS.

## Fluxo

1. `process-news` reclama a notícia e prepara título, resumo, legendas, hashtags, identidade e imagem-fonte.
2. A notícia termina em `processed`, com `editorial_ready=false` e sem URL de arte final.
3. O autopiloto agenda a notícia normalmente em `scheduled_posts`.
4. O worker chama `claim_editorial_render_jobs`, que usa `FOR UPDATE SKIP LOCKED`, lease de cinco minutos e identificação do worker.
5. O worker renderiza Feed, Story ou Reel com os mesmos módulos compartilhados do navegador e do Template Studio.
6. Somente depois do upload final o worker marca `editorial_ready=true` e libera o claim com `complete_editorial_render_job`.
7. O `publish-scheduler` permanece bloqueado enquanto a arte ou o vídeo final não estiver pronto.

## Isolamento e idempotência

- O job preserva `user_id`, `instagram_account_id`, `news_item_id` e `media_type` do post agendado.
- Claims simultâneos são impedidos por bloqueio de linha e lease.
- A conclusão só é aceita para o mesmo `media_render_claimed_by`.
- Uploads usam os caminhos determinísticos já existentes; uma retomada segura substitui o mesmo arquivo, sem criar publicação duplicada.
- Falhas liberam o claim e aplicam backoff de 2, 5 e 15 minutos.

## Ordem de implantação

1. Subir o commit para `main`.
2. Atualizar o VPS com `bash scripts/deploy-vps.sh` para disponibilizar o consumidor antes do produtor novo.
3. Aplicar `20260715170000_autopilot_render_worker_1b.sql`.
4. Implantar somente `process-news`.
5. Aguardar ciclos naturais de `autopilot-process-2min`, `feedbot-media` e `publish-due-every-2min`.

Essa ordem é compatível com a versão anterior: antes da migration o worker apenas aguarda a RPC; antes do novo `process-news`, a versão antiga ainda entrega artes prontas.

## Verificação

- `npm run ci`
- `npm audit --omit=dev --audit-level=moderate`
- `deno check --frozen index.ts` dentro de `supabase/functions/process-news`
- `node --check worker/index.js`
- Teste `src/test/autopilot-render-worker-1b.test.ts`
- Após a liberação, observar apenas ciclos naturais e confirmar:
  - nenhum novo `CPU Time exceeded` relacionado a Resvg/Canvas;
  - claims expirados igual a zero;
  - jobs concluídos com `editorial_ready=true`;
  - nenhuma publicação duplicada;
  - intervalos e isolamento por conta preservados.

## Rollback

1. Reimplantar a versão anterior de `process-news`.
2. Reverter o worker para o commit anterior e executar novamente `scripts/deploy-vps.sh`.
3. As colunas e RPCs podem permanecer inertes. Se necessário, uma migration corretiva pode remover as duas funções, o índice e as cinco colunas depois que nenhum claim estiver ativo.
