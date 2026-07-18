#!/usr/bin/env bash
set -uo pipefail

APP_DIR="${APP_DIR:-/opt/feedbot}"
EXPECTED_SHA="${1:-${DEPLOY_SHA:-}}"
DEPLOY_STATE_DIR="${DEPLOY_STATE_DIR:-$APP_DIR/.deploy-state}"
WEBHOOK_PORT="${WEBHOOK_PORT:-9000}"
HEALTH_RETRIES="${HEALTH_RETRIES:-12}"
HEALTH_INTERVAL_SECONDS="${HEALTH_INTERVAL_SECONDS:-5}"
PM2_MIN_UPTIME_MS="${PM2_MIN_UPTIME_MS:-10000}"
PM2_HEALTH_FILE="$DEPLOY_STATE_DIR/health-pm2-$$.json"

if [[ ! "$EXPECTED_SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "ERRO: health check exige o SHA completo esperado."
  exit 1
fi

mkdir -p "$DEPLOY_STATE_DIR" || exit 1
chmod 700 "$DEPLOY_STATE_DIR" || exit 1
trap 'rm -f "$PM2_HEALTH_FILE"' EXIT

check_once() {
  local actual_sha
  actual_sha="$(git -C "$APP_DIR" rev-parse HEAD^{commit})" || return 1
  if [ "$actual_sha" != "$EXPECTED_SHA" ]; then
    echo "[health] SHA divergente: esperado $EXPECTED_SHA, encontrado $actual_sha"
    return 1
  fi

  if command -v nginx >/dev/null 2>&1; then
    nginx -t >/dev/null 2>&1 || {
      echo "[health] nginx -t falhou"
      return 1
    }
  fi

  curl --fail --silent --show-error --max-time 5 \
    "http://127.0.0.1:$WEBHOOK_PORT/deploy-health" >/dev/null || {
      echo "[health] endpoint local do webhook indisponivel"
      return 1
    }

  pm2 jlist >"$PM2_HEALTH_FILE" || {
    echo "[health] nao foi possivel consultar o PM2"
    return 1
  }

  node - "$PM2_HEALTH_FILE" "$PM2_MIN_UPTIME_MS" <<'NODE'
const fs = require("node:fs");

const filePath = process.argv[2];
const minimumUptime = Number(process.argv[3]);
const expectedNames = ["feedbot-cuts", "feedbot-media", "feedbot-webhook"];
const apps = JSON.parse(fs.readFileSync(filePath, "utf8"));
const now = Date.now();

for (const name of expectedNames) {
  const app = apps.find((candidate) => candidate.name === name);
  if (!app) throw new Error(`PM2 process missing: ${name}`);
  if (app.pm2_env?.status !== "online") {
    throw new Error(`PM2 process not online: ${name} (${app.pm2_env?.status})`);
  }
  if (!Number.isInteger(app.pid) || app.pid <= 0) {
    throw new Error(`PM2 process has invalid PID: ${name}`);
  }
  const uptime = now - Number(app.pm2_env?.pm_uptime || 0);
  if (uptime < minimumUptime) {
    throw new Error(`PM2 process below minimum uptime: ${name} (${uptime}ms)`);
  }
}
NODE
}

attempt=1
while [ "$attempt" -le "$HEALTH_RETRIES" ]; do
  if check_once; then
    echo "[health] SHA, nginx, webhook e os tres processos PM2 estao saudaveis"
    exit 0
  fi

  if [ "$attempt" -lt "$HEALTH_RETRIES" ]; then
    echo "[health] tentativa $attempt/$HEALTH_RETRIES falhou; aguardando ${HEALTH_INTERVAL_SECONDS}s"
    sleep "$HEALTH_INTERVAL_SECONDS"
  fi
  attempt=$((attempt + 1))
done

echo "ERRO: health check falhou apos $HEALTH_RETRIES tentativas"
exit 1
