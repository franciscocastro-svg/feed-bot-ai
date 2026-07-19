#!/usr/bin/env bash
set -uo pipefail
umask 077

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

  if ! command -v nginx >/dev/null 2>&1; then
    echo "[health] nginx nao esta disponivel"
    return 1
  fi
  nginx -t >/dev/null 2>&1 || {
    echo "[health] nginx -t falhou"
    return 1
  }

  curl --fail --silent --show-error --max-time 5 \
    "http://127.0.0.1:$WEBHOOK_PORT/deploy-health" >/dev/null || {
      echo "[health] endpoint local do webhook indisponivel"
      return 1
    }

  pm2 jlist >"$PM2_HEALTH_FILE" || {
    echo "[health] nao foi possivel consultar o PM2"
    return 1
  }

  node - "$PM2_HEALTH_FILE" "$PM2_MIN_UPTIME_MS" "$APP_DIR" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const filePath = process.argv[2];
const minimumUptime = Number(process.argv[3]);
const appDir = path.resolve(process.argv[4]);
const expectedNames = ["feedbot-cuts", "feedbot-media", "feedbot-webhook"];
let apps;
try {
  apps = JSON.parse(fs.readFileSync(filePath, "utf8"));
} catch {
  throw new Error("PM2 response is not valid JSON");
}
const now = Date.now();

if (!Array.isArray(apps)) throw new Error("PM2 response is not an array");
if (apps.length !== expectedNames.length) {
  throw new Error(`PM2 must contain exactly ${expectedNames.length} processes; found ${apps.length}`);
}

const counts = new Map();
for (const app of apps) counts.set(app.name, (counts.get(app.name) || 0) + 1);
for (const name of expectedNames) {
  if (counts.get(name) !== 1) {
    throw new Error(`PM2 process must appear exactly once: ${name}`);
  }
}
for (const name of counts.keys()) {
  if (!expectedNames.includes(name)) throw new Error(`Unexpected PM2 process: ${name}`);
}

const expectedScripts = {
  "feedbot-cuts": path.join(appDir, "worker", "index.js"),
  "feedbot-media": path.join(appDir, "worker", "index.js"),
  "feedbot-webhook": path.join(appDir, "webhook-deploy.cjs"),
};
const expectedWorkerRoles = {
  "feedbot-cuts": { WORKER_ID: "vps-cuts", WORKER_QUEUES: "cuts" },
  "feedbot-media": { WORKER_ID: "vps-media", WORKER_QUEUES: "media" },
};

function validateRequiredPath(value, expected, label, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`PM2 ${label} missing: ${name}`);
  }
  if (path.resolve(String(value)) !== path.resolve(expected)) {
    throw new Error(`PM2 ${label} mismatch: ${name} (${value})`);
  }
}

function validateWorkerRole(pm2Environment, expectedRole, name) {
  const sources = [pm2Environment, pm2Environment?.env]
    .filter((candidate) => candidate && typeof candidate === "object" && !Array.isArray(candidate));

  for (const [key, expectedValue] of Object.entries(expectedRole)) {
    const observedValues = sources
      .filter((source) => Object.prototype.hasOwnProperty.call(source, key))
      .map((source) => source[key]);

    if (observedValues.length === 0) {
      throw new Error(`PM2 worker role missing: ${name}/${key}`);
    }
    if (observedValues.some((value) => value !== expectedValue)) {
      throw new Error(`PM2 worker role mismatch: ${name}/${key}`);
    }
  }
}

for (const name of expectedNames) {
  const app = apps.find((candidate) => candidate.name === name);
  if (app.pm2_env?.status !== "online") {
    throw new Error(`PM2 process not online: ${name} (${app.pm2_env?.status})`);
  }
  if (!Number.isInteger(app.pid) || app.pid <= 0) {
    throw new Error(`PM2 process has invalid PID: ${name}`);
  }
  const startedAt = Number(app.pm2_env?.pm_uptime);
  if (!Number.isFinite(startedAt) || startedAt <= 0 || startedAt > now) {
    throw new Error(`PM2 process has invalid start time: ${name}`);
  }
  const uptime = now - startedAt;
  if (uptime < minimumUptime) {
    throw new Error(`PM2 process below minimum uptime: ${name} (${uptime}ms)`);
  }

  validateRequiredPath(app.pm2_env?.pm_exec_path, expectedScripts[name], "script", name);
  validateRequiredPath(app.pm2_env?.pm_cwd, appDir, "cwd", name);
  if (!Object.prototype.hasOwnProperty.call(app.pm2_env || {}, "watch")) {
    throw new Error(`PM2 watch missing: ${name}`);
  }
  const watch = app.pm2_env?.watch;
  if (watch !== false) {
    throw new Error(`PM2 watch must be disabled: ${name}`);
  }

  const expectedRole = expectedWorkerRoles[name];
  if (expectedRole) validateWorkerRole(app.pm2_env, expectedRole, name);
}
NODE
}

attempt=1
while [ "$attempt" -le "$HEALTH_RETRIES" ]; do
  if check_once; then
    echo "[health] SHA, nginx, webhook e os tres processos PM2 com papeis esperados estao saudaveis"
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
