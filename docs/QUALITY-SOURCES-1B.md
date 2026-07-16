# Qualidade de Fontes 1B — Deduplicação e frescor

## Objetivo

Impedir que fontes de Pessoa, Tema e Google Notícias recriem a mesma matéria em
ciclos diferentes ou enviem conteúdo antigo para a fila automática.

## Contrato

- a prévia continua podendo mostrar exemplos amplos para validar uma fonte;
- a captura automática usa apenas resultados estritos publicados nas últimas 48 horas;
- notícias iguais são deduplicadas por URL canônica e título normalizado durante sete dias;
- registros `failed` e `rejected` também contam como ocorrências já vistas;
- uma falha deve ser retomada no registro existente, nunca por meio de uma cópia;
- o prazo de 48 horas para entrar na fila usa `created_at`, enquanto `published_at`
  permanece responsável somente pela atualidade editorial.

## Migração

`20260716211500_quality_sources_1b_dedup_freshness.sql` substitui apenas o
gatilho de deduplicação e adiciona um índice de consulta. Ela não apaga, atualiza
ou reprocessa notícias existentes.

## Liberação

1. Executar os gates do projeto e `deno check` de `fetch-rss` e `autopilot`.
2. Aplicar somente a migration da fase.
3. Implantar somente `fetch-rss` e `autopilot`.
4. Não invocar funções nem reprocessar fontes manualmente durante a liberação.
5. Observar ciclos naturais e confirmar que não surgem novos grupos duplicados.

## Rollback

Reimplantar as versões anteriores das duas funções. Se necessário, restaurar a
versão anterior de `tg_news_item_dedupe_guard()` por migration corretiva. O
índice adicional é inerte e pode permanecer.
