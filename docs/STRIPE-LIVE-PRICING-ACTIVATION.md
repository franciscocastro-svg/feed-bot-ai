# Ativação controlada dos preços Stripe live

## Status

Este documento prepara a sincronização, mas não autoriza nem executa mudanças na
Stripe live, nas assinaturas, no banco, nas Edge Functions ou no frontend.

Catálogo desejado:

| Plano comercial | Plano interno | Lookup key | Valor mensal |
|---|---|---|---:|
| Creator | `starter` | `starter_monthly` | R$ 97,97 |
| Pro | `pro` | `pro_monthly` | R$ 197,97 |
| Business | `business` | `business_monthly` | R$ 437,97 |
| Agência | `agency` | nenhum | Somente contato comercial |

O plano Agência não pode receber preço, lookup key ou botão de checkout.

## Preflight obrigatório

Interromper sem alterar nada se qualquer gate falhar:

1. Confirmar que a versão aprovada do código deriva o ambiente de
   `VITE_PAYMENTS_CLIENT_TOKEN` e rejeita token ausente ou inválido.
2. Validar localmente a classificação do arquivo de produção sem imprimir a
   chave:

   ```bash
   node scripts/check-stripe-client-environment.mjs \
     --env-file .env.production \
     --expect live
   ```

3. Capturar em evidência privada o catálogo live atual: ID do preço, lookup
   key, valor, moeda, recorrência, produto e estado ativo/inativo.
4. Confirmar que não existe execução concorrente de sincronização de preços.
5. Confirmar que a função administrativa aprovada aceita exclusivamente
   `starter`, `pro` e `business`, valida administradores e usa a chave live
   apenas no backend.
6. Registrar a contagem agregada de assinaturas por preço e status antes da
   mudança, sem nomes, e-mails ou dados de cartão.
7. Confirmar que nenhuma assinatura existente será atualizada, migrada ou
   cancelada. A troca de lookup key vale apenas para novos checkouts.
8. Confirmar que o frontend ainda não foi publicado com o ambiente live.

## Sequência de sincronização

Executar somente após nova autorização explícita:

1. Sincronizar `starter_monthly` para BRL 9.797, mensal.
2. Validar por leitura que existe exatamente um preço ativo com essa lookup
   key, moeda, recorrência e valor.
3. Sincronizar `pro_monthly` para BRL 19.797, mensal.
4. Repetir a validação de unicidade e valor.
5. Criar/sincronizar `business_monthly` para BRL 43.797, mensal.
6. Repetir a validação de unicidade e valor.
7. Confirmar que `agency_monthly` continua inexistente.
8. Comparar novamente as assinaturas existentes com a evidência inicial e
   provar que IDs, preços contratados e status não mudaram.
9. Testar a criação das três sessões de checkout sem concluir pagamentos.
10. Somente depois de todos os gates, publicar o frontend com a variável de
    produção live e executar uma compra real controlada por plano.

Cada lookup key deve ser sincronizada e validada separadamente. Não continuar
para o próximo plano se o anterior não estiver correto.

## Rollback

Antes de cada sincronização, preservar o ID do preço anterior e o estado do
produto correspondente.

Se um gate falhar:

1. Não publicar o frontend e não iniciar novos checkouts.
2. Reativar o preço anterior, se ele tiver sido desativado.
3. Transferir a lookup key de volta para o preço anterior.
4. Desativar somente o preço novo criado pela execução que falhou.
5. Validar que existe exatamente um preço ativo para a lookup key restaurada.
6. Recomparar IDs e status das assinaturas com a evidência inicial.
7. Preservar recibos e logs sanitizados da tentativa.

Se o frontend live já tiver sido publicado quando a falha for descoberta,
republicar a versão anterior do frontend ou bloquear temporariamente apenas o
checkout. Nunca usar uma chave de teste como mecanismo de rollback em produção.

## Condições de parada

- token de frontend ausente, inválido ou classificado como sandbox;
- catálogo com lookup key duplicada;
- moeda, valor ou recorrência divergentes;
- tentativa de alterar assinatura existente;
- tentativa de criar preço para Agência;
- erro de autenticação ou autorização administrativa;
- falha de leitura ou ausência de evidência privada;
- qualquer alteração fora do catálogo de preços autorizado.
