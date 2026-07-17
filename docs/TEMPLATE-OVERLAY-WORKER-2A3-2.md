# Template Overlay Worker 2A.3.2

## Problema corrigido

O navegador preservava a transparência de molduras PNG, mas o worker do VPS
solicitava todas as imagens ao proxy como JPEG. Como JPEG não possui canal
alfa, a parte transparente da moldura era achatada e podia cobrir a foto da
notícia com preto no Feed, Story ou Reel automático.

## Contrato de renderização

- fotos de notícias e fundos opacos continuam otimizados como JPEG;
- molduras `backgroundLayer=overlay`, logos e elementos de marca são carregados
  como PNG;
- a foto é desenhada antes da moldura transparente;
- template com foto habilitada exige uma imagem de notícia carregável;
- arte configurada indisponível interrompe o job e usa o retry durável, em vez
  de publicar uma composição preta ou incompleta;
- mensagens de log não exibem a URL original do ativo.

## Liberação

Não há migration, frontend ou Edge Function. Atualize o repositório do VPS e
reinicie somente `feedbot-media`.

## Rollback

Reimplante a versão anterior do worker. Nenhuma configuração ou versão de
template precisa ser alterada.
