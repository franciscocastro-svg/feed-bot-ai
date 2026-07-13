# Fase 1C — Ratchet de dívida técnica

## Objetivo

Impedir que a dívida histórica de lint aumente enquanto ela é reduzida em lotes pequenos e testados. Esta fase não altera banco de dados, migrations, interface ou regras comerciais.

## Como funciona

`quality/eslint-baseline.json` registra a quantidade de erros existente por arquivo e regra. `npm run check:lint-ratchet` executa o ESLint no repositório inteiro e compara o resultado atual com esse limite.

O bloqueio permite:

- manter a mesma quantidade de erros em um arquivo;
- reduzir ou eliminar erros;
- remover arquivos com dívida.

O bloqueio rejeita:

- aumentar a contagem de uma regra já existente;
- introduzir uma nova regra com erro em um arquivo;
- introduzir erros em arquivos novos.

A comparação não usa números de linha. Portanto, formatação ou deslocamento de código não transforma dívida antiga em uma falsa regressão.

## Atualização do baseline

O baseline não deve ser atualizado para contornar uma falha. Quando uma alteração deliberada de regra ou escopo exigir atualização:

```bash
npm run lint:baseline:update
npm run check:lint-ratchet
```

O diff do JSON precisa ser revisado. Um baseline saudável permanece igual ou diminui.

## Primeiro lote corrigido

- consulta tipada de permissões administrativas no `AuthContext`;
- normalização explícita dos payloads Lovable e Supabase no hook de e-mail;
- leitura segura do identificador retornado pela Resend;
- evento tipado pelo retorno do SDK Stripe no webhook de pagamentos;
- compatibilidade explícita entre os formatos antigo e atual de invoices do Stripe.

Scheduler, autopilot e processamento de notícias permanecem fora desta fase por exigirem testes operacionais próprios.

## Rollback

Não há migration ou alteração de dados. O ratchet e as correções de tipagem podem ser revertidos como um único commit. A lógica anterior dos webhooks foi preservada e está protegida por testes de normalização.
