#!/usr/bin/env bash
set -uo pipefail

APP_DIR="${APP_DIR:-/opt/feedbot}"
BRANCH="${DEPLOY_BRANCH:-main}"
TARGET_SHA="${1:-${DEPLOY_SHA:-}}"
DEPLOY_STATE_DIR="${DEPLOY_STATE_DIR:-$APP_DIR/.deploy-state}"
DEPLOY_TRASH_DIR="${DEPLOY_TRASH_DIR:-$APP_DIR/.deploy-trash}"
HEALTH_SCRIPT_SOURCE="${DEPLOY_HEALTH_SCRIPT_SOURCE:-$APP_DIR/scripts/health-check-vps.sh}"
HEALTH_SCRIPT_SNAPSHOT="$DEPLOY_STATE_DIR/health-check-vps.sh"

if [[ ! "$TARGET_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "ERRO: informe o SHA completo de 40 caracteres aprovado pelo CI."
  exit 2
fi

cd "$APP_DIR" || exit 2
mkdir -p "$DEPLOY_STATE_DIR" || exit 2
chmod 700 "$DEPLOY_STATE_DIR" || exit 2

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

prepare_release() {
  local sha="$1"

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

  if command -v nginx >/dev/null 2>&1; then
    echo "==> Testing and reloading nginx"
    nginx -t || return 1
    systemctl reload nginx || return 1
  fi

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

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "==> Local tracked changes detected; saving them in git stash before deploy"
  git stash push -m "auto-deploy backup $(date -Is)" || exit 2
fi

PREVIOUS_SHA="$(git rev-parse HEAD^{commit})" || exit 2
echo "==> Previous SHA: $PREVIOUS_SHA"

if [ "$HEALTH_SCRIPT_SOURCE" != "$HEALTH_SCRIPT_SNAPSHOT" ]; then
  cp "$HEALTH_SCRIPT_SOURCE" "$HEALTH_SCRIPT_SNAPSHOT" || exit 2
fi
chmod 700 "$HEALTH_SCRIPT_SNAPSHOT" || exit 2

echo "==> Fetching origin/$BRANCH without changing the working tree"
if ! git fetch --prune origin "$BRANCH"; then
  echo "ERRO: nao foi possivel atualizar origin/$BRANCH. Nenhum deploy foi ativado."
  exit 1
fi

if ! verify_target_sha "$TARGET_SHA"; then
  exit 1
fi

if ! git merge-base --is-ancestor "$PREVIOUS_SHA" "$TARGET_SHA"; then
  echo "ERRO: recusando regressao automatica de $PREVIOUS_SHA para $TARGET_SHA."
  exit 1
fi

if deploy_release "$TARGET_SHA"; then
  cleanup_deploy_trash
  echo "==> Deploy of exact SHA $TARGET_SHA finished healthy at $(date -Is)"
  exit 0
fi

echo "ERRO: deploy of $TARGET_SHA failed; starting rollback to $PREVIOUS_SHA"
if rollback_release "$PREVIOUS_SHA"; then
  cleanup_deploy_trash
  exit 1
fi

exit 2
