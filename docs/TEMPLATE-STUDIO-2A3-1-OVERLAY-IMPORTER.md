# Template Studio 2A.3.1 — Importador de Moldura

## Resultado

O cliente escolhe explicitamente como uma arte enviada deve participar da
composição:

- **Fundo**: PNG ou JPG opaco, desenhado antes da foto e dos textos.
- **Moldura**: PNG com transparência, desenhado depois da foto e antes dos
  textos e elementos de marca.

O importador valida formato, limite de 5 MB, dimensões exatas do canal e uma
amostra do canal alfa. Um arquivo sem transparência não pode ser salvo como
moldura. Templates antigos continuam normalizados como `backgroundLayer=base`.

## Ordem de camadas

Feed, Stories e Reels seguem o mesmo contrato na prévia, no canvas do
navegador e no worker `feedbot-media`:

1. fundo ou gradiente seguro;
2. foto da notícia com enquadramento protegido;
3. escurecimento configurado;
4. moldura PNG transparente;
5. logo, arroba, título, subtítulo, selo e elementos de marca.

O proxy de imagens do navegador solicita PNG para molduras, preservando o
canal alfa. Fundos comuns continuam usando JPG otimizado.

## Publicação e compatibilidade

O modo é salvo no JSON versionado do template. Não há mudança de schema nem
migration. Salvar continua criando rascunho por conta/formato, e o modelo só
entra em produção depois de **Publicar versão**.

## Liberação

1. Publicar o frontend.
2. Atualizar e reiniciar somente o worker `feedbot-media` no VPS.
3. Não é necessário implantar Edge Functions ou executar migration.

## Rollback

Republique frontend e worker anteriores. O campo desconhecido será ignorado e
o template voltará ao comportamento legado de fundo, sem alterar versões ou
arquivos armazenados.
