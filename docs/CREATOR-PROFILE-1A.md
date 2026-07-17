# Perfil do Criador 1A — auditoria e integração real

## Problema corrigido

O Perfil do Criador era uma linha global por usuário. A tela dizia que ele
personalizava todo o conteúdo, mas apenas pautas e posts avulsos o consultavam.
Notícias do autopiloto ignoravam o perfil, e clientes com mais de uma conta não
podiam manter vozes diferentes. A rota também estava protegida como se fosse
uma ferramenta administrativa.

## Contrato novo

- O perfil existente permanece como **perfil geral** e não é perdido.
- Cada conta Instagram pode salvar uma sobreposição própria.
- Sem sobreposição, a conta herda o perfil geral em tempo real.
- As RPCs validam `auth.uid()` e a propriedade da conta antes de ler ou gravar.
- Há no máximo um perfil geral por usuário e um perfil por usuário+conta.
- O usuário pode remover a sobreposição e voltar à herança com um clique.

## Integração do conteúdo

O perfil efetivo da conta passa a ser usado em:

1. notícias automáticas processadas por `process-news`;
2. pautas recorrentes em `generate-from-topic`;
3. posts avulsos em `generate-from-prompt`.

Nicho, público, tom, autoridade, exemplos e observações entram no prompt. A
primeira frase de assinatura e o CTA preferido também entram de forma
determinística nas legendas automáticas. O fingerprint do perfil participa da
chave do cache de IA, impedindo que duas contas recebam o mesmo texto cacheado
com vozes diferentes.

## Bloqueio real

Termos e temas proibidos não dependem apenas da obediência do modelo. A entrada
e a saída gerada são verificadas sem diferenciar maiúsculas ou acentos. Pautas
e posts avulsos incompatíveis retornam erro sem inserir conteúdo. Notícias do
autopiloto incompatíveis viram `rejected`, sem consumir novas tentativas.

## Liberação

1. Aplicar somente `20260717143000_creator_profile_1a.sql`.
2. Implantar `process-news`, `generate-from-topic` e `generate-from-prompt`.
3. Publicar o frontend do mesmo commit.
4. Não é necessário atualizar o worker do VPS.

## Rollback

Reimplante as três Edge Functions e o frontend anteriores. A coluna e os
índices podem permanecer inertes. Uma eventual remoção deve primeiro preservar
somente o perfil geral de cada usuário e então restaurar a unicidade antiga em
uma migration corretiva; nunca apague perfis por conta sem exportá-los.
