# Fase 1E-A.2/ii-c — recuperação do checkout e da verificação

## Objetivo

Corrigir o incidente em que a Stripe confirmava o checkout, mas a assinatura
`live` não era criada, o código não era enviado e o cliente retornava à tela de
cartão. Este hotfix não cria cobranças e não reproduz eventos manualmente.

## Causa

O cadastro cria uma assinatura gratuita no ambiente `sandbox`. A restrição
legada `UNIQUE (user_id)` impedia o mesmo usuário de receber uma segunda linha
no ambiente `live`, apesar de o modelo atual separar assinaturas por
`(user_id, environment)`. O webhook falhava com violação de unicidade antes de
registrar a assinatura paga ou enviar o código.

Também existiam leituras e edições que buscavam somente por `user_id`. Após
liberar duas linhas por usuário, essas consultas seriam ambíguas.

## Correção

- A migration aborta se houver duplicidade ativa no mesmo ambiente, confirma o
  índice único parcial por `(user_id, environment)` e remove apenas a restrição
  global antiga.
- O retorno do checkout, a proteção de rotas, o estado da assinatura, a página
  de código e as edições administrativas usam o ambiente configurado na Stripe.
- A verificação compara o SHA-256 produzido pelo mailer, altera somente a
  assinatura do ambiente informado e nunca escreve em `auth.users`.
- O mailer faz reserva condicional de 60 segundos para impedir envios
  concorrentes. Se o provedor rejeitar o e-mail, o novo código é invalidado e a
  reserva é restaurada para permitir a recuperação automática.
- O webhook considera o e-mail concluído somente após resposta HTTP aceita com
  `{ "ok": true }`. Falhas retornam erro ao Stripe e ficam elegíveis para a
  política normal de retry, sem replay manual.

Nenhum e-mail, payload, segredo ou dado de cliente é escrito em log.

## Liberação controlada

Seguir `ops/releases/phase-1e-a-2-ii-c.json`. Implantar as três Edge Functions e
o frontend a partir do mesmo commit antes de aplicar a migration. Depois,
aguardar o retry automático da Stripe e auditar apenas contagens agregadas.

Não executar checkout de teste, não invocar manualmente as funções de pagamento
e não avançar para a Fase 1E-A.2/iii nesta entrega.

## Rollback

Reimplantar as versões anteriores das três funções e do frontend se houver
regressão. Não recriar `UNIQUE (user_id)` depois que linhas `sandbox` e `live`
coexistirem; qualquer reversão de schema deve ser uma migration corretiva
revisada, preservando os dados de ambos os ambientes.
