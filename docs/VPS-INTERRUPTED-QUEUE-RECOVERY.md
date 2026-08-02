# Recuperação da fila VPS interrompida

Este runbook existe para o incidente de 2026-08-01. A VPS está saudável para tráfego, porém um deploy interrompido por `SIGINT` deixou `active.json`, `BLOCKED.json` e 42 releases acumulados. Não apague esses arquivos e não reinicie a fila inteira.

## Garantias

- O alvo é sempre um SHA completo, já integrado em `main` e aprovado pelo CI.
- A inspeção não escreve.
- A reconciliação cria evidência e backup fora de `.deploy-state`, elimina da fila somente ancestrais comprovados e mantém a VPS bloqueada.
- O deploy atualiza somente `feedbot-media`.
- A conclusão remove o bloqueio por último e somente quando CI, `main`, health e checkout coincidem.
- Qualquer falha nas fases mutáveis restaura o estado anterior.

## Pré-condições

1. Ler `README.md`, `PRODUCT.md`, `ARCHITECTURE.md`, `TASKS.md` e `HANDOFF.md`.
2. Obter autorização explícita para a mutação da VPS.
3. Definir `TARGET_SHA` como o SHA completo do merge que contém este runbook e a correção.
4. Confirmar CI verde e `origin/main` exatamente nesse SHA.
5. Não alterar os itens locais da VPS, inclusive `node_modules.partial-*`, `worker/temp/` e `youtube-cookies.txt`.

Como o checkout bloqueado é anterior à correção, execute o script a partir de uma cópia extraída e conferida do próprio `TARGET_SHA`, em diretório privado. Não use conteúdo de uma branch não integrada.

## 1. Inspecionar sem escrita

```bash
VPS_RECOVERY_TARGET_SHA="$TARGET_SHA" \
APP_DIR=/opt/feedbot \
DEPLOY_STATE_DIR=/opt/feedbot/.deploy-state \
node /caminho/privado/reconcile-interrupted-deploy.cjs --inspect
```

Guardar o valor `VPS_RECOVERY_PLAN_SHA256`. Se qualquer validação falhar, parar. A inspeção deve confirmar o release interrompido, PIDs mortos, fila válida, alvo final único, ancestralidade e `origin/main`.

## 2. Reconciliar e continuar bloqueado

```bash
VPS_RECOVERY_TARGET_SHA="$TARGET_SHA" \
VPS_RECOVERY_APPROVED_TARGET="$TARGET_SHA" \
VPS_RECOVERY_EXPECTED_PLAN_SHA256="$PLAN_SHA256" \
VPS_RECOVERY_EVIDENCE_DIR=/root/feedbot-recovery-evidence/$TARGET_SHA \
APP_DIR=/opt/feedbot \
DEPLOY_STATE_DIR=/opt/feedbot/.deploy-state \
node /caminho/privado/reconcile-interrupted-deploy.cjs --execute
```

O resultado esperado é `PASS_TARGET_BLOCKED_PENDING_MANUAL_MEDIA_DEPLOY`. Verifique que o alvo é o único item da fila e que `BLOCKED.json` continua presente com a razão de deploy manual pendente. Guarde o hash da evidência emitida.

## 3. Implantar somente mídia

Use o `deploy-vps.sh` extraído do mesmo `TARGET_SHA` e o mecanismo operacional existente para fornecer o SHA aprovado:

```bash
DEPLOY_PM2_SCOPE=media-only /caminho/privado/deploy-vps.sh "$TARGET_SHA"
```

O deploy ainda deve validar checkout, dependências, testes, fingerprint do artefato, PM2, health e rollback. O comando PM2 permitido nessa fase contém `--only feedbot-media`. Não reinicie webhook ou cortes manualmente.

Depois do deploy, confirme:

- `git rev-parse HEAD` igual a `TARGET_SHA`;
- `origin/main` igual a `TARGET_SHA`;
- `feedbot-media` online;
- health local HTTP 200 e identificando `TARGET_SHA`;
- `feedbot-webhook` e `feedbot-cuts` ainda online.

## 4. Concluir e remover o bloqueio

```bash
VPS_RECOVERY_TARGET_SHA="$TARGET_SHA" \
VPS_RECOVERY_COMPLETION_APPROVED="$TARGET_SHA" \
VPS_RECOVERY_CI_SHA="$TARGET_SHA" \
VPS_RECOVERY_MAIN_SHA="$TARGET_SHA" \
VPS_RECOVERY_HEALTH_SHA="$TARGET_SHA" \
VPS_RECOVERY_VPS_HEAD_SHA="$TARGET_SHA" \
VPS_RECOVERY_EXPECTED_EVIDENCE_SHA256="$EVIDENCE_SHA256" \
VPS_RECOVERY_COMPLETION_BACKUP_DIR=/root/feedbot-recovery-completion/$TARGET_SHA \
APP_DIR=/opt/feedbot \
DEPLOY_STATE_DIR=/opt/feedbot/.deploy-state \
node /caminho/privado/reconcile-interrupted-deploy.cjs --complete
```

O resultado esperado é `PASS_COMPLETED_BLOCK_REMOVED`, fila vazia, resultado terminal `succeeded` para o alvo e ausência de `BLOCKED.json`. Se falhar, o bloqueio pendente e o estado anterior à conclusão devem permanecer restaurados.

## 5. Smoke funcional

Recapture ou regenere a matéria usada no diagnóstico. Confirme que a imagem principal relacionada de 1200×747 foi selecionada, que o assunto não mudou e que o fallback pequeno continua disponível quando não houver alternativa segura. Arquivos gerados antes do deploy não mudam automaticamente.
