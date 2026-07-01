#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/feedbot}"
BRANCH="${DEPLOY_BRANCH:-main}"
DEPLOY_TRASH_DIR="${DEPLOY_TRASH_DIR:-.deploy-trash}"

cd "$APP_DIR"

clean_dependency_dir() {
  local target="$1"

  if [ ! -e "$target" ]; then
    return
  fi

  mkdir -p "$DEPLOY_TRASH_DIR"
  local safe_name="${target//\//-}"
  local trash_target="$DEPLOY_TRASH_DIR/${safe_name}-$(date +%s)-$$"

  if mv "$target" "$trash_target" 2>/dev/null; then
    rm -rf "$trash_target" >/dev/null 2>&1 || true
    return
  fi

  echo "==> Could not move $target aside; forcing direct cleanup"
  rm -rf "$target" 2>/dev/null || true
  if [ -e "$target" ]; then
    find "$target" -mindepth 1 -maxdepth 1 -exec rm -rf {} + 2>/dev/null || true
    rmdir "$target" 2>/dev/null || true
  fi

  if [ -e "$target" ]; then
    echo "ERRO: nao foi possivel limpar $target. Feche processos que estejam usando essa pasta e tente novamente."
    exit 1
  fi
}

cleanup_deploy_trash() {
  rm -rf "$DEPLOY_TRASH_DIR" >/dev/null 2>&1 || true
}

secure_secret_files() {
  for secret_file in .env .env.local .env.production worker/.env worker/.env.production; do
    if [ -f "$secret_file" ]; then
      chmod 600 "$secret_file"
    fi
  done
}

install_web_dependencies() {
  echo "==> Installing web dependencies"
  if npm ci; then
    return
  fi

  echo "==> Web dependency install failed; cleaning node_modules and retrying once"
  clean_dependency_dir node_modules
  npm ci
}

install_worker_dependencies() {
  echo "==> Installing worker dependencies"
  local -a install_cmd
  if [ -f worker/package-lock.json ]; then
    install_cmd=(npm --prefix worker ci --omit=dev)
  else
    install_cmd=(npm --prefix worker install --omit=dev --no-package-lock)
  fi

  if "${install_cmd[@]}"; then
    return
  fi

  echo "==> Worker dependency install failed; cleaning worker/node_modules and retrying once"
  clean_dependency_dir worker/node_modules
  "${install_cmd[@]}"
}

echo "==> Deploy started at $(date -Is)"
echo "==> Directory: $APP_DIR"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "==> Local tracked changes detected; saving them in git stash before deploy"
  git stash push -m "auto-deploy backup $(date -Is)"
fi

echo "==> Fetching origin/$BRANCH"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
if ! git pull --ff-only origin "$BRANCH"; then
  echo "ERRO: a copia do VPS divergiu da origin/$BRANCH. Resolva o historico local antes de fazer deploy."
  exit 1
fi

secure_secret_files

install_web_dependencies
install_worker_dependencies

echo "==> Building frontend"
npm run build

echo "==> Checking worker syntax"
node --check worker/index.js

echo "==> Restarting PM2 services"
pm2 restart feedbot-worker --update-env
pm2 restart feedbot-webhook --update-env
pm2 save

if command -v nginx >/dev/null 2>&1; then
  echo "==> Testing and reloading nginx"
  nginx -t
  systemctl reload nginx
fi

cleanup_deploy_trash

echo "==> Deploy finished at $(date -Is)"
