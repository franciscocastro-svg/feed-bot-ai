# Fase 1A — Rede de proteção

## Objetivo

Criar uma base verificável para evoluir o produto com menor risco de regressão. Esta fase adiciona validações automáticas e corrige problemas de tipagem sem alterar regras de negócio, banco de dados ou integrações externas.

## Escopo aplicado

- Correção da tipagem dos planos iniciais de pautas em `Topics`.
- Testes unitários para preservar o payload enviado a `content_topics`.
- Atualização corretiva do React Router dentro da versão principal 6.
- Workflow de CI para tipagem, testes, worker, build e auditoria das dependências de produção.
- Lint progressivo: os arquivos novos desta fase bloqueiam a CI; a dívida histórica do repositório fica visível, mas ainda não bloqueia entregas.

## Fora do escopo

- Migrações ou alterações no banco de dados.
- Mudanças funcionais em Meta, Stripe, scheduler, autopilot ou worker.
- Troca de arquitetura, redesign ou alteração do fluxo do usuário.
- Publicação, deploy ou mudança de configuração dos ambientes externos.
- Atualização principal do Vite, que exige uma fase própria de compatibilidade.

## Validação local

Use Node.js 22 e instale exatamente o conteúdo do lockfile:

```bash
npm ci
npm run ci
npm audit --omit=dev --audit-level=moderate
```

Para acompanhar a dívida histórica de lint sem confundi-la com uma regressão desta fase:

```bash
npm run lint
```

## Proteções da CI

Em cada pull request e em cada envio para `main`, a CI executa:

1. instalação reprodutível com `npm ci`;
2. verificação TypeScript;
3. lint bloqueante dos arquivos introduzidos pela Fase 1A;
4. suíte completa de testes;
5. verificação sintática do worker;
6. build de produção;
7. auditoria das dependências de produção.

O lint completo é executado como relatório não bloqueante até que a dívida existente seja reduzida de forma controlada.

## Estratégia de liberação e rollback

1. Revisar o diff e os resultados locais antes de criar qualquer commit.
2. Quando aprovado, publicar uma branch e abrir um pull request sem deploy automático.
3. Exigir CI verde e revisão humana antes do merge.
4. Validar as rotas e a criação de um plano inicial em ambiente de homologação.
5. Se houver regressão, reverter apenas o commit da Fase 1A; esta fase não possui migrações nem alterações de dados a desfazer.

## Riscos residuais conhecidos

- O lint completo ainda aponta dívida histórica. Ela deve ser tratada por módulos, com testes, em fases posteriores.
- A árvore de desenvolvimento ainda contém alertas relacionados ao Vite 5/esbuild. A correção automática exige uma atualização principal do Vite e foi adiada para evitar uma mudança incompatível sem testes dedicados. Esses pacotes são ferramentas de desenvolvimento; a auditoria das dependências de produção permanece como bloqueio da CI.
- A CI melhora a prevenção de regressões, mas não substitui testes de integração com os serviços externos em homologação.

## Segurança operacional

- Nunca registrar tokens, chaves ou conteúdo de arquivos `.env` nos logs da CI.
- Manter segredos somente nos cofres dos ambientes de execução.
- Não incluir deploy ou acesso privilegiado neste workflow de validação.
