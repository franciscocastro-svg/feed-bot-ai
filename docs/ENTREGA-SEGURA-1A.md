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
6. qualquer falha dispara rollback automático para o SHA anterior;
7. se o rollback também falhar, a fila é bloqueada para intervenção humana.

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
- `BLOCKED.json`: bloqueio criado somente quando rollback falha;
- `.runner-lock` e `.state-lock`: exclusão mútua entre webhook e runner.

Entregas repetidas são deduplicadas. Se o webhook reiniciar enquanto o deploy
estiver em andamento, o runner destacado continua ativo. Se o runner for
interrompido, o SHA que estava ativo volta ao início da fila na próxima execução.
Runners disparados durante outro deploy aguardam a liberação do runner ativo, o
que evita perder uma atualização no instante exato em que a fila anterior termina.
O FIFO segue a ordem dos pushes, mesmo quando os workflows terminam fora de ordem.
Um CI cancelado ou com falha libera o próximo push aprovado sem implantar o SHA
rejeitado.

## Deploy exato

`scripts/deploy-vps.sh` exige o SHA completo como primeiro argumento. O script:

- atualiza `origin/main` com `git fetch`;
- confirma que o SHA existe e pertence ao histórico de `origin/main`;
- recusa regressão automática para um SHA anterior ao que já está implantado;
- registra o SHA atualmente implantado;
- usa `git checkout --detach SHA`;
- instala dependências travadas, executa checks e build;
- reinicia pelo `ecosystem.config.cjs` os processos `feedbot-cuts`,
  `feedbot-media` e `feedbot-webhook`;
- executa o health check pós-deploy.

Não há `git pull` e não há resolução implícita de `HEAD`.

## Health check e rollback

O health check tenta por até 60 segundos, por padrão, validar:

- `git rev-parse HEAD` exatamente igual ao SHA aprovado;
- `nginx -t`, quando nginx estiver instalado;
- `GET http://127.0.0.1:9000/deploy-health`;
- os três processos PM2 existentes com status `online`, PID válido e uptime
  mínimo de 10 segundos.

Se instalação, testes, build, PM2, nginx ou health check falharem, o mesmo fluxo é
executado para o SHA anterior. Um rollback saudável encerra aquele deploy com
falha e permite que a fila prossiga. Um rollback sem saúde encerra com código 2 e
cria `BLOCKED.json`, impedindo novos deploys automáticos.

## Ativação futura

Este documento não autoriza merge nem deploy. Após aprovação separada, a ativação
deve ocorrer nesta ordem:

1. fazer merge do Pull Request com CI verde;
2. confirmar o SHA completo aprovado na `main`;
3. no VPS, atualizar as referências Git e executar uma única vez
   `bash scripts/deploy-vps.sh SHA_COMPLETO` para instalar o novo mecanismo;
4. habilitar o evento `workflow_run` no webhook do GitHub;
5. enviar uma alteração controlada e acompanhar `logs/deploy-queue.log`.

## Recuperação operacional

Se `BLOCKED.json` existir, não o remova antes de identificar o motivo no log e
confirmar manualmente que os três processos PM2 e o endpoint local estão
saudáveis. Depois de corrigir a causa e com autorização operacional, remova apenas
o arquivo de bloqueio e inicie `node scripts/deploy-queue.cjs --run`; os SHAs ainda
presentes em `queue.json` serão processados em FIFO.

## Fases futuras fora deste Pull Request

Devem permanecer em planos e Pull Requests separados:

- `deno check` automático para todas as 32 Edge Functions;
- correção do drift `VITE_SUPABASE_PROJECT_ID` / `project-ref-unset` do MCP;
- detecção automática de migrations duplicadas;
- testes E2E em ambiente sandbox;
- governança Git e proteção gradual de `main`, com compatibilidade prévia para a
  sincronização da Lovable.
