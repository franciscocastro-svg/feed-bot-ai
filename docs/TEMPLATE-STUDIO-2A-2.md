# Template Studio 2A.2 — biblioteca profissional

## Objetivo

Transformar os modelos embutidos da tela de Templates em um catálogo
profissional, pesquisável e seguro para múltiplas contas, preservando o fluxo
de rascunho e publicação explícita criado na Fase 2A.1.

## Catálogo

- 32 modelos estáveis em oito nichos.
- Feed, Stories e Reels com composição explícita por modelo (96 variações).
- Pesquisa por nome, descrição, nicho, estilo e termos relacionados.
- Filtros por nicho e estilo.
- Configuração centralizada em `src/lib/professionalTemplateCatalog.ts`.

## Fluxo seguro

1. O cliente seleciona a conta do Instagram.
2. Filtra e abre a prévia do modelo usando a identidade dessa conta.
3. O botão de uso copia o modelo para a biblioteca pessoal e abre o editor.
4. Salvar cria um rascunho somente para a conta selecionada.
5. A versão ativa só muda quando o cliente publica explicitamente pela Fase 2A.1.

Visualizar o catálogo não cria linhas nem consome o limite do plano. Uma cópia
passa a contar como template somente depois da confirmação do cliente.

## Compatibilidade

Templates existentes, versões publicadas, rascunhos e defaults não são
alterados. O catálogo grava o mesmo contrato de configuração que os
renderizadores atuais já consomem. Não há migration, deploy de Edge Function ou
mudança no worker nesta fase.

## Rollback

Reimplantar o frontend anterior. Os modelos que o cliente já copiou continuam
templates válidos e editáveis; nenhum dado precisa ser removido.
