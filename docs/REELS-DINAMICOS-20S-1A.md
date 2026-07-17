# Reels Dinâmicos 20s — 1A

## Objetivo

Transformar as artes editoriais de notícias em Reels verticais de 20 segundos com
movimento contínuo e discreto, sem criar um loop visual curto e sem afetar Stories
ou os vídeos produzidos pelo Cortes IA.

## Contrato

- Reels editoriais: 1080×1920, H.264, AAC, 30 fps e duração validada entre 19 e 21 segundos.
- Movimento: aproximação progressiva única de até 4% durante toda a peça.
- VPS: o `feedbot-media` gera e valida o MP4 com FFmpeg/FFprobe.
- Navegador: o fallback usa o mesmo tempo e a mesma progressão visual.
- Stories convertidos em vídeo: permanecem com 6 segundos.
- Cortes IA: preservam o MP4 e a duração natural do corte; não são substituídos pelo Reel editorial.
- Publicação: continua bloqueada até o vídeo ser gerado e validado.

## Monetização

A duração de 20 segundos melhora o espaço para narrativa e retenção, mas não
garante monetização. Elegibilidade também depende da conta, do país, da
originalidade e das políticas vigentes da Meta. Conteúdo estático, looping simples,
slideshows e montagens predominantemente textuais podem ser inelegíveis.

Referências oficiais:

- https://www.facebook.com/help/instagram/2635536099905516
- https://www.facebook.com/help/instagram/738469380549477/
- https://www.facebook.com/help/instagram/225190788256708

## Implantação

1. Publicar o frontend para atualizar textos e fallback do navegador.
2. Atualizar o repositório no VPS.
3. Instalar as dependências próprias de `worker/` com lockfile.
4. Reiniciar somente `feedbot-media` com `--update-env`.
5. Aguardar um Reel editorial natural e verificar duração, codec, movimento e ausência de duplicidade.

## Rollback

Reimplantar o commit anterior no frontend e no `feedbot-media`. Não há migration,
alteração de banco ou mudança de segredo nesta fase.
