# Template Studio 2A.1

## Objetivo

Permitir que um cliente reutilize a mesma biblioteca de templates em várias
contas do Instagram sem que a edição de uma conta altere as demais.

## Modelo

- `post_templates` continua sendo a biblioteca do proprietário.
- `post_template_versions` guarda snapshots por conta e formato.
- `account_template_assignments` aponta para a versão publicada e, quando
  existir, para um rascunho ainda não publicado.
- Uma conta possui no máximo um rascunho por formato.
- Publicar ou restaurar uma versão altera somente a conta selecionada.

## Fluxo do cliente

1. Escolher a conta do Instagram.
2. Ajustar um template. O botão Salvar cria ou atualiza um rascunho privado.
3. Conferir a prévia do rascunho.
4. Publicar a versão explicitamente.
5. Se necessário, restaurar a versão publicada anterior.

## Compatibilidade

A migration cria a versão inicial usando os defaults já configurados em cada
conta. Edge Function, navegador e worker procuram primeiro uma versão publicada
e voltam ao template legado quando a migration ainda não estiver disponível.
Nenhuma arte antiga é regenerada e nenhum post é publicado pela migration.

## Segurança e isolamento

- RLS de leitura por `user_id` nas duas tabelas.
- Escritas do cliente somente por RPCs `SECURITY DEFINER` com validação de
  `auth.uid()`, propriedade da conta, propriedade do template e formato.
- Advisory lock por conta/formato evita dois publishes concorrentes.
- Browser roles não recebem INSERT, UPDATE ou DELETE direto nas versões.
- Edge e worker filtram o proprietário ao carregar o snapshot publicado.

## Ordem de liberação

1. Validar frontend, Edge Function e worker.
2. Implantar `process-news` (compatível antes da migration).
3. Atualizar o worker do VPS (compatível antes da migration).
4. Aplicar `20260715063000_template_studio_2a1.sql`.
5. Publicar o frontend.

## Rollback

Antes de expor o frontend novo, basta manter os renderizadores no fallback
legado. Depois do uso, não apagar versões: reimplantar o frontend anterior e
manter as tabelas inertes. Uma migration corretiva pode restaurar os IDs dos
templates raiz em `account_settings` a partir da versão publicada.
