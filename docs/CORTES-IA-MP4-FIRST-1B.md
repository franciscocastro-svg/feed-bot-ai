# Cortes IA MP4 Primeiro 1B

## Objetivo

Evitar que o caminho principal dos Cortes IA dependa da captura automática do
YouTube, sujeita a anti-bot, validações adicionais e bloqueios por endereço IP.

## Contrato

- O painel abre em `Enviar MP4` e `Na nuvem`.
- O cliente baixa e envia apenas conteúdo para o qual possui autorização.
- O MP4 pode ter até 1 GB e é processado pelo worker de cortes já existente.
- Conta, número de cortes, formatos, preset e estilo continuam preservados.
- O link do YouTube permanece disponível como opção experimental.
- Um job bloqueado pelo YouTube oferece troca para MP4 sem refazer as
  configurações editoriais.
- Nenhum conteúdo é publicado automaticamente sem a configuração explícita do
  cliente.

## Escopo operacional

Esta entrega altera somente o frontend, testes e documentação. Não cria
migration, não muda o worker e não altera jobs existentes.
