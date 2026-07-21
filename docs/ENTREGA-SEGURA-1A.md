# Entrega Segura 1A

## Escopo

Esta fase estabiliza somente a entrega do VPS. Ela não altera funcionalidades do
produto, frontend funcional, pagamentos, Stripe, Meta, Supabase, banco, migrations,
secrets ou Edge Functions.

O contrato de entrega passa a ser:

1. um `push` em `main` registra o SHA como `awaiting_ci`;
2. somente o evento `workflow_run` concluído com sucesso para o workflow `CI`,
   disparado por `push` em `main`, aprova esse mesmo SHA;
3. o SHA completo de 40 caracteres entra em uma fila FIFO persistente;
4. um runner separado implanta exatamente esse SHA, nunca o `HEAD` mais recente;
5. o deploy só termina após health check do Git, nginx, webhook local e dos três
   processos PM2;
6. falhas depois do checkout do target disparam rollback automático para o SHA anterior;
7. falhas de preflight, interrupções e rollback malsucedido bloqueiam a fila para
   intervenção humana.

A versão 1A.2 fecha o fluxo automático sem ampliar o escopo do produto. Ela
adiciona validação do repositório, idempotência por entrega GitHub e SHA, estados
operacionais explícitos e testes herméticos do deploy e do rollback.

## Eventos necessários no webhook do GitHub

O webhook existente deve continuar enviando `pushes` e também passar a enviar
`workflow runs`. A URL, o content type JSON e o secret HMAC existentes não mudam.

Essa configuração externa só deve ser realizada depois do merge e da autorização
específica para ativar a fase. Sem o evento `workflow_run`, pushes são preservados
como `awaiting_ci`, mas nenhum deploy é iniciado.

Variáveis opcionais:

```text
DEPLOY_BRANCH=main
DEPLOY_WORKFLOW=CI
DEPLOY_REPOSITORY=franciscocastro-svg/feed-bot-ai
DEPLOY_STATE_DIR=/opt/feedbot/.deploy-state
WEBHOOK_PORT=9000
```

`GITHUB_WEBHOOK_SECRET` continua obrigatório e não deve ser versionado.

## Fila persistente

O estado fica em `/opt/feedbot/.deploy-state`, fora do Git:

- `awaiting.json`: pushes aguardando o CI correto;
- `queue.json`: SHAs aprovados, em ordem de chegada;
- `active.json`: SHA em implantação;
- `last-result.json`: último resultado concluído;
- `results.json`: journal persistente de resultados por SHA;
- `deliveries.json`: ledger persistente dos IDs de entrega GitHub;
- `early-workflows.json`: workflows recebidos antes do respectivo push;
- `BLOCKED.json`: bloqueio por preflight, interrupção, rollback malsucedido ou
  resultado desconhecido que exija intervenção;
- `.runner-lock` e `.state-lock`: exclusão mútua entre webhook e runner.

Antes de alterar esses arquivos, o webhook valida o HMAC, o tipo do evento, o ID
de entrega, `repository.full_name`, a branch, o workflow e o SHA completo. Uma
entrega repetida com o mesmo conteúdo é idempotente; reutilizar o mesmo ID para
outro evento ou SHA é conflito e falha fechado. Um novo ID para um SHA já
conhecido não cria outro deploy.

Se o webhook reiniciar enquanto o deploy estiver em andamento, o runner destacado
continua ativo. Se o runner for interrompido sem resultado terminal observável,
a fila bloqueia e preserva `active.json`; ela nunca tenta certificar
automaticamente um checkout possivelmente incompleto. Um resultado terminal já
gravado nunca é reimplantado pela recuperação.
Runners disparados durante outro deploy aguardam a liberação do runner ativo, o
que evita perder uma atualização no instante exato em que a fila anterior termina.
O FIFO segue a ordem dos pushes, mesmo quando os workflows terminam fora de ordem.
Um CI cancelado ou com falha libera o próximo push aprovado sem implantar o SHA
rejeitado.

Se `workflow_run` chegar antes do respectivo `push`, o resultado fica em
`early-workflows.json` e é reconciliado quando o push aparecer. Ao enfileirar
trabalho enquanto outro runner está encerrando, o webhook sempre inicia um runner
de espera; o lock serializa os processos e elimina a janela de fila sem consumidor.
Na inicialização do listener, o webhook também reconcilia fila ou deploy ativo já
persistidos e repete reservas de entrega ainda em `processing`, fechando as
janelas entre reservar a entrega, gravar o estado e iniciar o runner. As transições
JSON sincronizam arquivo e diretório antes de confirmar a gravação.
Falhas transitórias dessa reconciliação são repetidas com backoff; enquanto elas
persistirem, `/deploy-health` responde `503` em vez de aparentar prontidão.
O runner também registra PID e grupo do Bash de deploy em `active.json`. Se o
runner Node morrer e o processo de deploy ainda existir, a fila bloqueia sem
iniciar uma segunda implantação concorrente.

Os estados persistidos e expostos pelo webhook são:

- `awaiting_ci`;
- `ci_passed_waiting_fifo`;
- `queued`;
- `deploying`;
- `succeeded`;
- `failed_ci`;
- `rolled_back`;
- `failed_preflight`;
- `rollback_failed`;
- `interrupted`;
- `blocked`.

## Deploy exato

`scripts/deploy-vps.sh` exige o SHA completo como primeiro argumento. O script:

- atualiza `origin/main` com `git fetch`;
- confirma que o SHA existe e pertence ao histórico de `origin/main`;
- recusa regressão automática para um SHA anterior ao que já está implantado;
- recusa qualquer alteração rastreada, staged ou unstaged, sem criar stash;
- exige `nginx -t` válido antes de criar estado, fazer fetch ou checkout;
- registra o SHA atualmente implantado;
- usa `git checkout --detach SHA`;
- registra um fingerprint SHA-256 privado de `dist/` antes da primeira mutação;
- instala dependências travadas e executa checks, mas nunca executa o build do
  frontend no VPS;
- exige worktree e index limpos depois dos checks e da sintaxe do worker, além
  de `dist/` byte a byte idêntico após checkout, instalações, checks, sintaxe,
  PM2 e health;
- reinicia pelo `ecosystem.config.cjs` os processos `feedbot-cuts`,
  `feedbot-media` e `feedbot-webhook`;
- executa o health check pós-deploy.

Não há `git pull` e não há resolução implícita de `HEAD`.

Se o SHA solicitado já for o `HEAD` ativo, o script executa apenas o health check.
Esse caminho não reinstala dependências, não faz build, não reinicia PM2 e não
recarrega Nginx. O binário do Nginx e uma configuração válida são gates
obrigatórios antes da primeira mutação; depois do restart, `nginx -t` é repetido
antes do health check. Como esta fase não altera configuração Nginx, nenhum reload
é executado.

## Gate FRONTEND-ROUTING

O Nginx instalado no VPS possui uma diretiva `root` ativa sob `/opt/feedbot`.
Por isso, o deploy do worker não pode executar `npm run build` nem alterar
`dist/`: isso publicaria frontend fora da barreira da Lovable.

O build Vite continua obrigatório no GitHub CI por meio de `npm run ci`. No VPS,
o script captura `dist/` antes de criar estado, fazer fetch ou checkout e compara
o mesmo fingerprint depois de todas as etapas relevantes. Ausência inicial de
`dist/` também é preservada. Symlink ou formato inesperado falha no preflight.

Qualquer mudança em `dist/` retorna `interrupted/frontend_artifact_changed`,
antes de continuar PM2, health ou rollback. O artefato divergente é preservado
para auditoria. Publicação do frontend permanece exclusiva da Lovable.

## Gate MCP-BUILD

O issuer OAuth do MCP usa o project ref público e versionado
`gewnaxrhiyylfizgbqdi`. Ele não depende de `VITE_SUPABASE_PROJECT_ID`, não possui
fallback `project-ref-unset` e não incorpora outras variáveis `VITE_*` no bundle
rastreado `supabase/functions/mcp/index.ts`.

`npm run check:mcp-build` registra o bundle antes do build, executa o build e
exige que fonte, bundle e estado rastreado permaneçam idênticos. A barreira B1M
usa `npm run check:mcp-build:matrix` em workspace descartável para validar o
project ref vindo do processo, variáveis `VITE_*` sintéticas não relacionadas e
a precedência de `.env.production`/`.env.production.local`. Nenhum valor real de
Stripe, Meta ou outro secret integra essa matriz.

O resultado verde é:
`PASS_MCP_BUILD_REPRODUCIBLE_CLEAN_WORKTREE`.

Se checks ou sintaxe deixarem qualquer diferença rastreada, o deploy sai
como `interrupted` antes de PM2 e health. Ele preserva o worktree para auditoria,
não faz stash, não restaura o arquivo e não tenta checkout automático para
rollback sobre a evidência divergente. Os processos que já estavam ativos não
são reiniciados.

## Health check e rollback

O health check tenta por até 60 segundos, por padrão, validar:

- `git rev-parse HEAD` exatamente igual ao SHA aprovado;
- `nginx -t` obrigatório;
- `GET http://127.0.0.1:9000/deploy-health`;
- consistência do estado persistido, rejeitando SHA simultaneamente em mais de um
  estado operacional ou um bloqueio marcado como bem-sucedido;
- exatamente os três processos PM2 `feedbot-cuts`, `feedbot-media` e
  `feedbot-webhook`, cada um uma única vez, com status `online`, PID válido,
  uptime mínimo de 10 segundos e configuração esperada de script, diretório e
  watch;
- papéis operacionais exatos `vps-cuts/cuts` e `vps-media/media`, aceitando os
  formatos conhecidos do JSON do PM2, rejeitando valores ausentes ou conflitantes
  e sem registrar os valores de ambiente encontrados.

Se instalação, testes, PM2, nginx ou health check falharem depois que o
checkout exato do target for confirmado e o worktree continuar limpo, o mesmo
fluxo é executado para o SHA anterior. Drift rastreado durante a preparação é a
exceção segura: interrompe sem PM2, health ou checkout de rollback. O contrato de
saída é:

- `0`: `succeeded`, incluindo o caminho `same_sha_healthy`;
- `10`: `rolled_back`, target falhou e o rollback ficou saudável;
- `20`: `failed_preflight`, sem ativação e com bloqueio da fila;
- `21`: `rollback_failed`, com bloqueio da fila;
- `22`: `interrupted`, com bloqueio e preservação de evidências.

`last-result.json` registra SHA, estado, resultado, motivo, código de saída e
horários de início e término. Falha de preflight nunca é descrita como rollback.

## Ativação futura

Este documento não autoriza merge nem deploy. Após aprovação separada, a ativação
deve ocorrer nesta ordem:

1. congelar temporariamente escritores da `main` e confirmar CI verde;
2. fazer merge somente com autorização específica, mantendo o webhook em
   `push`;
3. confirmar que o push do merge criou exatamente um `awaiting_ci`, sem fila,
   ativo, runner, lock ou bloqueio;
4. fazer bootstrap manual do SHA completo do merge e confirmar que o estado foi
   preservado;
5. adicionar `workflow_run` ao webhook sem substituir `push` e reler a
   configuração, preservando URL, content type, secret, SSL e `active=true`;
6. reexecutar o CI do mesmo SHA. Como ele já estará instalado, a promoção deve
   usar o caminho `same_sha_healthy` e esvaziar o estado sem reiniciar PM2;
7. em aprovação separada, fazer um canário documental com um novo SHA e observar
   `push -> awaiting_ci -> workflow_run -> queued -> deploying -> succeeded`;
8. confirmar SHA exato no VPS, endpoint saudável, PM2 exatamente três, fila
   vazia, nenhum bloqueio, nenhum stash novo e nenhum reload do Nginx;
9. redeliver os eventos originais e confirmar idempotência sem alterar SHA, PID
   ou restart count.

### Gate B1-Q — reconciliação do backlog legado

Antes do bootstrap, o inventário B1-Q0 deve classificar exatamente nove pushes
legados. O contrato aprovado exige seis ancestrais com CI verde marcados como
`superseded`, dois ancestrais com CI não verde marcados como `failed_ci` e um
único `approved_target` idêntico à `main`. Nenhum ancestral entra em
`queue.json`.

`scripts/reconcile-deploy-backlog.cjs` é bloqueado por padrão. O modo
`--validate-report` apenas valida o relatório. O modo `--execute` também exige
aprovação igual ao SHA target, hashes exatos do relatório e de `awaiting.json`,
estado operacional vazio e um diretório privado de evidências ainda inexistente.
Não consulta GitHub, não inicia runner e não executa deploy.

Em uma execução futura e separadamente autorizada, a ferramenta:

1. adquire o lock de estado e reconfirma os nove registros em ordem;
2. preserva byte a byte o `awaiting.json` original e o relatório B1-Q0;
3. grava `BLOCKED.json` antes de qualquer transição terminal;
4. registra seis resultados `superseded` e dois `failed_ci`;
5. mantém somente o target original em `awaiting.json`;
6. deixa `queue.json` e `active.json` ausentes e o deploy não autorizado.

O bloqueio `b1q_target_pending_bootstrap` deve permanecer até o bootstrap manual
do SHA exato passar por health check e por uma finalização específica. Ele nunca
deve ser removido como atalho. Se a ferramenta falhar depois de criar o bloqueio,
a evidência privada e o bloqueio são preservados; nenhuma correção ou restauração
automática é tentada. Restauração do arquivo original exige plano e autorização
próprios, além da prova de que nenhum push concorrente foi recebido.

### Gate B2-F.1 — conclusão segura depois do bootstrap

O modo `--complete-bootstrap` existe exclusivamente para concluir o bloqueio
`b1q_target_pending_bootstrap` depois que o futuro merge do PR de reconciliação
já estiver instalado manualmente e saudável. Ele não consulta GitHub, não faz
checkout, não inicia runner, não executa deploy e não habilita `workflow_run`.

Antes da primeira mutação, o chamador deve fornecer SHAs completos e idênticos
em `B2F_INSTALLED_MERGE_SHA`, `B2F_MAIN_SHA`, `B2F_CI_SHA`,
`B2F_VPS_HEAD_SHA`, `B2F_HEALTH_SHA` e `B2F_COMPLETION_APPROVED`. O target legado
em `B1Q_TARGET_SHA` deve continuar exatamente em
`9453a1ca1fafb5bc9f6a52dc880f1f1d954f82aa`. Também são obrigatórios os hashes
atuais de `awaiting.json` e da árvore privada de evidências, além de um diretório
novo e privado em `B2F_COMPLETION_BACKUP_DIR`.

A conclusão exige simultaneamente:

1. `BLOCKED.json` ainda registra `b1q_target_pending_bootstrap` para o target;
2. `queue.json`, `active.json`, locks e snapshots de runner estão ausentes;
3. `awaiting.json` contém exatamente o target e o merge SHA instalado;
4. os oito resultados anteriores continuam sendo seis `superseded` e dois
   `failed_ci`;
5. a reconciliação e a árvore de evidências B1-Q3 permanecem íntegras.

Depois de criar e conferir um backup privado, a ordem durável é: registrar ambos
os SHAs como `already_installed`, marcar a reconciliação `bootstrap_completed`,
esvaziar os dois itens esperados de `awaiting.json` e remover `BLOCKED.json` como
última mutação. Um SHA inesperado ou qualquer divergência interrompe antes da
conclusão. Falha depois do backup restaura primeiro `BLOCKED.json` e depois os
demais arquivos exatamente do backup, mantendo as evidências existentes sem
alteração. O backup não é removido automaticamente.

Se qualquer gate divergir, a ativação para. Remover somente `workflow_run` retorna
o webhook ao modo seguro `push`; URL, secret e estado da fila não devem ser
apagados. Não se provoca falha deliberada em produção: rollback e bloqueio são
validados em harness hermético.

## Recuperação operacional

Se `BLOCKED.json` existir, não o remova antes de identificar o motivo no log e
confirmar manualmente que os três processos PM2 e o endpoint local estão
saudáveis. O motivo `b1q_target_pending_bootstrap` nunca permite remoção manual:
ele exige o Gate B2-F.1 acima. Outros motivos precisam de runbook e autorização
operacional próprios; não apague o arquivo como atalho para iniciar o runner.

Nunca apague `awaiting.json`, `queue.json`, `active.json`, `deliveries.json`,
`early-workflows.json`, `results.json` ou `last-result.json` para destravar uma
entrega. Nunca encerre manualmente um runner durante deploy. Código é revertido
por Pull Request e novo deploy de SHA exato, nunca por reset ou force-push.

## Fases futuras fora deste Pull Request

Devem permanecer em planos e Pull Requests separados:

- `deno check` automático para todas as 32 Edge Functions;
- ampliar a detecção automática de migrations duplicadas além do par editorial
  estritamente registrado pelo Gate M2.2;
- testes E2E em ambiente sandbox;
- governança Git e proteção gradual de `main`, com compatibilidade prévia para a
  sincronização da Lovable.
