# Hotfix — integridade das artes editoriais automáticas

## Objetivo

Impedir que o `process-news` salve ou disponibilize uma arte de Feed sem a identidade da conta, sem uma das fontes obrigatórias ou com um logo configurado que não pôde ser carregado.

## Comportamento

- As variações Inter 900 e 400 precisam estar disponíveis antes da renderização.
- O identificador da conta do Instagram é o fallback seguro para campos de marca legados vazios.
- Quando existe um logo configurado, o arquivo precisa responder com sucesso, ter tipo de imagem permitido e assinatura binária válida.
- Título, subtítulo e texto do botão são obrigatórios.
- Falhas de integridade usam o backoff já existente do `process-news`; a foto crua não substitui silenciosamente uma arte editorial incompleta.
- A URL pública recebe uma versão por renderização para evitar a leitura de um objeto antigo no cache do CDN.

## Escopo e operação

- Apenas `process-news` deve ser implantada.
- `process-news` passa a ter configuração e lockfile Deno próprios para checks reproduzíveis.
- Não há migration, mudança de schema, secret novo ou publicação de frontend.
- O hotfix protege novas renderizações e itens ainda não publicados. A mídia de posts já publicados no Instagram não é alterada.

## Rollback

Reimplantar a versão anterior de `process-news`. Nenhuma reversão de banco ou Storage é necessária.
