# Autopiloto — Recuperação 1A

## Objetivo

Impedir que uma chamada de IA lenta, uma credencial de reserva inválida ou um
encerramento abrupto do runtime bloqueiem toda a fila editorial de uma conta.

## Causa corrigida

`process-news` passou a responder `202` e concluir em background, mas o
`autopilot` ainda aguardava até 120 segundos pelo resultado. Ao mesmo tempo,
uma legenda curta podia provocar uma segunda rodada completa de IA. Com a chave
Groq expirada, a sequência de fallbacks consumia o orçamento de CPU e deixava a
linha em `processing` quando o runtime era encerrado.

## Contratos

- O autopiloto apenas dispara `process-news`; o ciclo seguinte agenda o item já
  processado.
- Nenhuma nova chamada à IA é feita somente para alongar uma legenda. A expansão
  final usa o fallback factual e determinístico já existente.
- Gemini faz no máximo uma repetição de infraestrutura por erro transitório.
- Chamadas aos provedores têm timeout explícito.
- HTTP 401/403 da Groq abre circuit breaker e o próximo provedor é tentado.
- `processing` abandonado por três minutos é recuperado com fencing por
  `status + updated_at`.
- Interrupções contam no limite de três tentativas; depois disso o item permanece
  `failed` com mensagem operacional.
- O update final para `processed` exige que o item ainda detenha o estado
  `processing`.

## Liberação

Implantar somente:

1. `process-news`
2. `retry-failed-news`
3. `autopilot`

Não há migration, alteração de cron, frontend, worker ou segredo. A rotação da
`GROQ_API_KEY` continua recomendada, mas uma chave expirada deixa de bloquear a
fila.

## Verificação

Após dois ciclos naturais do cron, verificar de forma agregada:

- `processing` abandonados há mais de três minutos igual a zero;
- `processing_started > 0` quando há notícias elegíveis;
- ausência do timeout de 120 segundos nos logs do autopiloto;
- retomada de itens `processed`, `scheduled` e `posted` sem invocação manual.
