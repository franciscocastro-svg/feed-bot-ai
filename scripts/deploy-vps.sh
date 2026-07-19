#!/usr/bin/env bash
set -uo pipefail

APP_DIR="${APP_DIR:-/opt/feedbot}"
BRANCH="${DEPLOY_BRANCH:-main}"
TARGET_SHA="${1:-${DEPLOY_SHA:-}}"
DEPLOY_STATE_DIR="${DEPLOY_STATE_DIR:-$APP_DIR/.deploy-state}"
DEPLOY_TRASH_DIR="${DEPLOY_TRASH_DIR:-$APP_DIR/.deploy-trash}"
HEALTH_SCRIPT_SOURCE="${DEPLOY_HEALTH_SCRIPT_SOURCE:-$APP_DIR/scripts/health-check-vps.sh}"
HEALTH_SCRIPT_SNAPSHOT="$DEPLOY_STATE_DIR/health-check-vps.sh"

# Exit contract consumed by the queue runner.
EXIT_SUCCEEDED=0
EXIT_ROLLED_BACK=10
EXIT_FAILED_PREFLIGHT=20
EXIT_ROLLBACK_FAILED=21
EXIT_INTERRUPTED=22

emit_result() {
  echo "DEPLOY_RESULT=$1"
  echo "DEPLOY_RESULT_REASON=${2:-none}"
  echo "DEPLOY_RESULT_SHA=$TARGET_SHA"
}

fail_preflight() {
  echo "ERRO: preflight falhou: $1"
  emit_result "FAILED_PREFLIGHT" "$1"
  exit "$EXIT_FAILED_PREFLIGHT"
}

handle_interruption() {
  trap - HUP INT TERM
  echo "ERRO: deploy interrompido pelo sinal $1. A fila deve permanecer bloqueada ate revisao."
  emit_result "INTERRUPTED" "signal_$1"
  exit "$EXIT_INTERRUPTED"
}

trap 'handle_interruption HUP' HUP
trap 'handle_interruption INT' INT
trap 'handle_interruption TERM' TERM

if [[ ! "$TARGET_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "ERRO: informe o SHA completo de 40 caracteres aprovado pelo CI."
  emit_result "FAILED_PREFLIGHT" "invalid_target_sha"
  exit "$EXIT_FAILED_PREFLIGHT"
fi

cd "$APP_DIR" || {
  emit_result "FAILED_PREFLIGHT" "app_dir_unavailable"
  exit "$EXIT_FAILED_PREFLIGHT"
}

assert_clean_tracked_worktree() {
  if ! git diff --quiet -- || ! git diff --cached --quiet --; then
    echo "ERRO: existem alteracoes rastreadas staged ou unstaged ($1)."
    echo "ERRO: o deploy nao cria, aplica nem remove stashes automaticamente."
    return 1
  fi
}

clean_dependency_dir() {
  local target="$1"

  if [ ! -e "$target" ]; then
    return 0
  fi

  mkdir -p "$DEPLOY_TRASH_DIR" || return 1
  local safe_name="${target//\//-}"
  local trash_target="$DEPLOY_TRASH_DIR/${safe_name}-$(date +%s)-$$"

  if mv "$target" "$trash_target" 2>/dev/null; then
    rm -rf "$trash_target" >/dev/null 2>&1 || true
    return 0
  fi

  echo "==> Could not move $target aside; forcing direct cleanup"
  rm -rf "$target" 2>/dev/null || true
  if [ -e "$target" ]; then
    find "$target" -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null || true
    rmdir "$target" 2>/dev/null || true
  fi

  if [ -e "$target" ]; then
    echo "ERRO: nao foi possivel limpar $target. Feche processos que estejam usando essa pasta e tente novamente."
    return 1
  fi
}

cleanup_deploy_trash() {
  rm -rf "$DEPLOY_TRASH_DIR" >/dev/null 2>&1 || true
}

secure_secret_files() {
  local secret_file
  for secret_file in .env .env.local .env.production worker/.env worker/.env.production; do
    if [ -f "$secret_file" ]; then
      chmod 600 "$secret_file" || return 1
    fi
  done
}

install_web_dependencies() {
  echo "==> Installing locked web dependencies"
  if npm ci; then
    return 0
  fi

  echo "==> Web dependency install failed; cleaning node_modules and retrying once"
  clean_dependency_dir node_modules || return 1
  npm ci
}

install_worker_dependencies() {
  echo "==> Installing locked worker dependencies"
  local -a install_cmd
  if [ -f worker/package-lock.json ]; then
    install_cmd=(npm --prefix worker ci --omit=dev)
  else
    install_cmd=(npm --prefix worker install --omit=dev --no-package-lock)
  fi

  if "${install_cmd[@]}"; then
    return 0
  fi

  echo "==> Worker dependency install failed; cleaning worker/node_modules and retrying once"
  clean_dependency_dir worker/node_modules || return 1
  "${install_cmd[@]}"
}

verify_target_sha() {
  local sha="$1"
  git cat-file -e "$sha^{commit}" 2>/dev/null || {
    echo "ERRO: o SHA $sha nao existe no repositorio local apos o fetch."
    return 1
  }
  git merge-base --is-ancestor "$sha" "origin/$BRANCH" || {
    echo "ERRO: o SHA $sha nao pertence ao historico de origin/$BRANCH."
    return 1
  }
}

test_nginx_configuration() {
  if ! command -v nginx >/dev/null 2>&1; then
    echo "ERRO: nginx nao esta disponivel para validacao."
    return 1
  fi

  echo "==> Testing nginx configuration (no reload)"
  nginx -t
}

prepare_release() {
  local sha="$1"

  assert_clean_tracked_worktree "imediatamente antes do checkout de $sha" || return 1
  echo "==> Checking out exact SHA $sha"
  git checkout --detach "$sha" || return 1
  [ "$(git rev-parse HEAD^{commit})" = "$sha" ] || return 1

  secure_secret_files || return 1
  install_web_dependencies || return 1
  install_worker_dependencies || return 1

  echo "==> Running automated checks"
  npm run check || return 1

  echo "==> Building frontend"
  npm run build || return 1

  echo "==> Checking worker syntax"
  node --check worker/index.js || return 1
}

activate_release() {
  local sha="$1"

  echo "==> Restarting the three PM2 services for $sha"
  pm2 startOrReload ecosystem.config.cjs --update-env || return 1
  pm2 save || return 1

  test_nginx_configuration || return 1

  echo "==> Running post-deploy health checks"
  APP_DIR="$APP_DIR" DEPLOY_STATE_DIR="$DEPLOY_STATE_DIR" \
    bash "$HEALTH_SCRIPT_SNAPSHOT" "$sha" || return 1
}

deploy_release() {
  local sha="$1"
  prepare_release "$sha" || return 1
  activate_release "$sha" || return 1
}

rollback_release() {
  local previous_sha="$1"

  echo "==> Rolling back automatically to $previous_sha"
  if ! deploy_release "$previous_sha"; then
    echo "ERRO CRITICO: rollback para $previous_sha falhou. A fila sera bloqueada."
    return 1
  fi
  echo "==> Rollback to $previous_sha completed and healthy"
}

echo "==> Deploy started at $(date -Is)"
echo "==> Directory: $APP_DIR"
echo "==> Approved SHA: $TARGET_SHA"

# First mutation gate: state files, fetches and checkouts happen only after it.
assert_clean_tracked_worktree "antes da primeira mutacao" || \
  fail_preflight "tracked_worktree_not_clean"

test_nginx_configuration || fail_preflight "nginx_preflight_failed"

PREVIOUS_SHA="$(git rev-parse HEAD^{commit})" || fail_preflight "cannot_resolve_current_sha"
echo "==> Previous SHA: $PREVIOUS_SHA"

mkdir -p "$DEPLOY_STATE_DIR" || fail_preflight "cannot_create_state_dir"
chmod 700 "$DEPLOY_STATE_DIR" || fail_preflight "cannot_secure_state_dir"

if [ "$HEALTH_SCRIPT_SOURCE" != "$HEALTH_SCRIPT_SNAPSHOT" ]; then
  cp "$HEALTH_SCRIPT_SOURCE" "$HEALTH_SCRIPT_SNAPSHOT" || \
    fail_preflight "cannot_snapshot_health_script"
fi
chmod 700 "$HEALTH_SCRIPT_SNAPSHOT" || fail_preflight "cannot_secure_health_snapshot"

echo "==> Fetching origin/$BRANCH without changing the working tree"
if ! git fetch --prune origin "$BRANCH"; then
  echo "ERRO: nao foi possivel atualizar origin/$BRANCH. Nenhum deploy foi ativado."
  fail_preflight "fetch_failed"
fi

if ! verify_target_sha "$TARGET_SHA"; then
  fail_preflight "target_not_verified"
fi

if ! git merge-base --is-ancestor "$PREVIOUS_SHA" "$TARGET_SHA"; then
  echo "ERRO: recusando regressao automatica de $PREVIOUS_SHA para $TARGET_SHA."
  fail_preflight "automatic_regression_refused"
fi

assert_clean_tracked_worktree "fim do preflight, imediatamente antes do checkout" || \
  fail_preflight "tracked_worktree_changed_during_preflight"

if [ "$TARGET_SHA" = "$PREVIOUS_SHA" ]; then
  echo "==> Target SHA is already checked out; running health-only idempotent path"
  if APP_DIR="$APP_DIR" DEPLOY_STATE_DIR="$DEPLOY_STATE_DIR" \
    bash "$HEALTH_SCRIPT_SNAPSHOT" "$TARGET_SHA"; then
    emit_result "SAME_SHA_HEALTHY" "same_sha_healthy"
    exit "$EXIT_SUCCEEDED"
  fi

  echo "ERRO: same-SHA health failed; no checkout, install, build or restart was executed."
  emit_result "FAILED_PREFLIGHT" "same_sha_health_failed"
  exit "$EXIT_FAILED_PREFLIGHT"
fi

if deploy_release "$TARGET_SHA"; then
  cleanup_deploy_trash
  echo "==> Deploy of exact SHA $TARGET_SHA finished healthy at $(date -Is)"
  emit_result "SUCCEEDED" "target_healthy"
  exit "$EXIT_SUCCEEDED"
fi

CURRENT_SHA_AFTER_FAILURE="$(git rev-parse HEAD^{commit})" || \
  fail_preflight "cannot_resolve_sha_after_target_failure"
if [ "$CURRENT_SHA_AFTER_FAILURE" != "$TARGET_SHA" ]; then
  echo "ERRO: target nao chegou a ser ativado; nenhum rollback ou restart adicional sera executado."
  fail_preflight "target_checkout_not_completed"
fi

echo "ERRO: deploy of $TARGET_SHA failed; starting rollback to $PREVIOUS_SHA"
if rollback_release "$PREVIOUS_SHA"; then
  cleanup_deploy_trash
  emit_result "ROLLED_BACK" "target_failed_previous_sha_healthy"
  exit "$EXIT_ROLLED_BACK"
fi

emit_result "ROLLBACK_FAILED" "target_and_rollback_failed"
exit "$EXIT_ROLLBACK_FAILED"
