# Preflight Fase 2 — somente leitura

Nenhuma mutação executada: sem código, banco, Stripe, funções, frontend ou publicação alterados.

## Gates

| # | Gate | Estado |
|---|------|--------|
| 1 | HEAD/main = merge `092b3f4` e contém feature `9f5a2dc` | PASS — HEAD `092b3f406b3cf787e38ebe039c9d38d5ab154468`, pai `9f5a2dc…` presente; árvore limpa |
| 2 | Stripe SANDBOX com os três preços corretos | **FAIL** — ver divergências abaixo (live não foi consultada) |
| 3 | Token de pagamento do build de preview | PRESENT_TEST (`.env.development` com prefixo `pk_test_`) |
| 4 | Ferramentas para aplicar a migration, implantar as 4 funções, publicar frontend e testar checkout | PASS — migration (`20260729210000_four_plans_billing_limits.sql` presente no repo), deploy seletivo de `create-checkout`, `admin-sync-stripe-price`, `autopilot`, `publish-scheduler`, publish do frontend e teste de checkout sem concluir pagamento |
| 5 | Capacidade de rollback para `a6fcbdb` + restaurar `plan_limits` | PASS — `a6fcbdb` presente localmente (redeploy das 4 funções e republicação possíveis); baseline de `plan_limits` capturada abaixo |
| 6 | Sem migration/deploy/operação Stripe concorrente | PASS (observado) — nenhuma migration pendente em execução, nenhuma operação Stripe iniciada por esta sessão |

## Divergências do gate 2 (Stripe sandbox)

| lookup_key | Atual (sandbox) | Desejado |
|---|---|---|
| starter_monthly | 9790 BRL/mês, ativo | 9797 BRL/mês |
| pro_monthly | 43790 BRL/mês, ativo | 19797 BRL/mês |
| business_monthly | inexistente | 43797 BRL/mês |
| agency_monthly | inexistente | inexistente (OK) |

Observação: existem dois preços ativos legados sem `lookup_key` (metadata `starter_monthly` 43700 e `pro_monthly` 124700) — não conflitam com lookup keys, mas devem permanecer intocados.

## Baseline de rollback — `plan_limits` atual

- starter: R$ 97,90 · 1 IG · 20 posts/dia · 5 RSS · 3 templates · 1 corte/dia
- pro: R$ 437,90 · 3 IG · 50 posts/dia · 20 RSS · 10 templates · 5 cortes/dia
- business: preço nulo · 10 IG · posts ilimitados · RSS ilimitado · 10 templates · 20 cortes/dia
- agency: **não existe**
- free e expired inalterados

A migration `20260729210000` ainda não foi aplicada (sem linha `agency`, preços antigos).

## Ordem segura de ativação (quando autorizada)

1. Sincronizar preços sandbox via `admin-sync-stripe-price` (starter 97,97 · pro 197,97 · business 437,97 — criar `business_monthly`).
2. Aplicar a migration `20260729210000_four_plans_billing_limits.sql`.
3. Implantar `create-checkout`, `admin-sync-stripe-price`, `autopilot`, `publish-scheduler`.
4. Publicar o frontend do merge `092b3f4`.
5. Testar os três checkouts em sandbox sem concluir pagamento.

## Rollback

- Reimplantar as 4 funções e republicar o frontend a partir de `a6fcbdb`.
- Restaurar `plan_limits` com a baseline acima e remover a linha `agency`.
- Preços Stripe: reverter valores via `admin-sync-stripe-price` e desativar `business_monthly` criado.

RESULT=BLOCKED — motivo: gate 2 falhou. Em sandbox, `starter_monthly` está 9790 (esperado 9797), `pro_monthly` está 43790 (esperado 19797) e `business_monthly` não existe. Todos os demais gates passam; libera para PASS_CAPABLE após o passo 1 da ordem de ativação ser autorizado.
