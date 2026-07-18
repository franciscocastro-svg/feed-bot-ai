# Pautas 1A — geração completa de carrosséis

## Resultado

O formato `carrossel` deixou de ser uma legenda com marcadores de slides. A IA
agora entrega um contrato estruturado com 5 a 7 slides: capa, desenvolvimento e
CTA. O contrato fica salvo no item de conteúdo e pode ser revisado antes do
agendamento.

## Fluxo seguro

1. `generate-from-topic` ou `generate-from-prompt` gera e valida os slides.
2. O painel exibe uma prévia textual antes da aprovação.
3. Carrosséis são aceitos somente no Feed e ficam com `editorial_ready=false`.
4. O worker VPS renderiza todas as imagens em ordem, usando o template publicado
   da conta selecionada.
5. Somente depois de 5 a 7 imagens prontas o item recebe
   `editorial_ready=true`.
6. `publish-scheduler` cria os filhos e o contêiner nativo `CAROUSEL` na Meta.

Se um slide falhar, a publicação continua bloqueada e entra no retry durável do
worker. Não existe fallback silencioso para uma imagem única.

## Isolamento e compatibilidade

- a conta Instagram permanece vinculada ao conteúdo;
- o template é carregado por conta e formato `feed`;
- conteúdos antigos e demais formatos não mudam;
- não há cron novo nem alteração em pagamentos, Stripe ou secrets;
- a migration apenas adiciona os campos estruturados em `news_items`.

## Liberação

1. Rodar CI, scanner, audit, Deno checks, `node --check` e teste da fase.
2. Aplicar `20260717153000_topics_carousel_1a.sql`.
3. Implantar `generate-from-topic`, `generate-from-prompt`, `autopilot` e
   `publish-scheduler`.
4. Atualizar o worker `feedbot-media` no VPS.
5. Publicar o frontend.
6. Não gerar nem publicar carrossel real durante a liberação técnica.
