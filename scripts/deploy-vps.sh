#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/feedbot}"
BRANCH="${DEPLOY_BRANCH:-main}"

cd "$APP_DIR"

echo "==> Deploy started at $(date -Is)"
echo "==> Directory: $APP_DIR"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "==> Local tracked changes detected; saving them in git stash before deploy"
  git stash push -m "auto-deploy backup $(date -Is)"
fi

echo "==> Fetching origin/$BRANCH"
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "==> Installing web dependencies"
npm install

echo "==> Installing worker dependencies"
npm --prefix worker install

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
