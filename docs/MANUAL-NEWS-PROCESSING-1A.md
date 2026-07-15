# Processamento Manual 1A

Hotfix para impedir que uma notícia permaneça indefinidamente em `processing` após interrupção do runtime.

## Mudanças

- A propriedade da notícia é validada com o cliente autenticado antes de o processamento usar o cliente interno.
- O processamento manual aguarda um resultado persistido (`processed` ou `failed`).
- Notícias `failed` podem ser tentadas novamente pelo usuário.
- Notícias em `processing` há pelo menos três minutos podem ser recuperadas com claim atômico.
- Execuções ainda ativas continuam protegidas contra concorrência e consumo duplicado de IA.
- A rotina `retry-failed-news` inclui processamentos abandonados.
- A resposta expõe `x-request-id` e a interface mostra mensagens acionáveis em português.
- A falha é persistida antes do log final, reduzindo o risco de shutdown sem estado terminal.

## Escopo de implantação

1. Implantar `process-news`.
2. Implantar `retry-failed-news`.
3. Publicar o frontend.

Não há migration, alteração de cron, mudança em pagamentos ou reprocessamento manual durante a liberação. A chave Groq expirada deve ser rotacionada separadamente no cofre, sem ser incluída no repositório.

## Rollback

Reimplantar as duas funções e o frontend a partir do commit anterior. Nenhum rollback de banco é necessário.
