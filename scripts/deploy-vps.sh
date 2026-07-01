#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/feedbot}"
BRANCH="${DEPLOY_BRANCH:-main}"

cd "$APP_DIR"

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
  rm -rf node_modules
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
  rm -rf worker/node_modules
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

echo "==> Deploy finished at $(date -Is)"
