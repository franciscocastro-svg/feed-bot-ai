# Exceção temporária do React Router RSC

- Advisory permitido: `GHSA-qwww-vcr4-c8h2`
- Escopo: somente o modo React Server Components (RSC) e Server Actions do React Router
- Projeto: aplicação cliente Vite; não utiliza RSC nem Server Actions
- Implementação do gate: `scripts/check-production-audit.mjs`

O gate de dependências de produção continua bloqueando qualquer outro advisory de
severidade moderada, alta ou crítica. A exceção também falha se detectar APIs ou
imports relacionados a RSC/Server Actions no código da aplicação.

Não foi utilizado `npm audit fix --force`, nem realizado downgrade do React
Router. Esta exceção deve ser removida assim que existir uma versão corrigida e
compatível do React Router.
