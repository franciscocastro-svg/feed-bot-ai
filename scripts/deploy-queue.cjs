#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const STATE_LOCK_TIMEOUT_MS = 5000;
const STALE_LOCK_MS = 30 * 60 * 1000;
const RUNNER_LOCK_TIMEOUT_MS = Number(process.env.DEPLOY_RUNNER_WAIT_MS || 6 * 60 * 60 * 1000);
const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));

function sleep(milliseconds) {
  Atomics.wait(sleepBuffer, 0, 0, milliseconds);
}

function assertSha(sha) {
  if (!SHA_PATTERN.test(sha)) {
    throw new Error(`Invalid deploy SHA: ${sha}`);
  }
}

function ensureStateDir(stateDir) {
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(stateDir, 0o700);
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

function writeJsonAtomic(filePath, value) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tempPath, filePath);
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function removeStaleLock(lockDir) {
  let stats;
  try {
    stats = fs.statSync(lockDir);
  } catch (error) {
    if (error.code === "ENOENT") return true;
    throw error;
  }

  const owner = readJson(path.join(lockDir, "owner.json"), {});
  if (Number.isInteger(owner.pid)) {
    if (processIsAlive(owner.pid)) return false;
  } else if (Date.now() - stats.mtimeMs < STALE_LOCK_MS) {
    return false;
  }

  fs.rmSync(lockDir, { recursive: true, force: true });
  return true;
}

function acquireLock(lockDir, timeoutMs = STATE_LOCK_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  let firstAttempt = true;
  while (firstAttempt || Date.now() <= deadline) {
    firstAttempt = false;
    try {
      fs.mkdirSync(lockDir, { mode: 0o700 });
      writeJsonAtomic(path.join(lockDir, "owner.json"), {
        pid: process.pid,
        acquiredAt: new Date().toISOString(),
      });
      return true;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      if (!removeStaleLock(lockDir)) sleep(50);
    }
  }
  return false;
}

function releaseLock(lockDir) {
  fs.rmSync(lockDir, { recursive: true, force: true });
}

function withStateLock(stateDir, operation) {
  ensureStateDir(stateDir);
  const lockDir = path.join(stateDir, ".state-lock");
  if (!acquireLock(lockDir)) {
    throw new Error(`Timed out waiting for deploy state lock: ${lockDir}`);
  }
  try {
    return operation();
  } finally {
    releaseLock(lockDir);
  }
}

function statePaths(stateDir) {
  return {
    active: path.join(stateDir, "active.json"),
    awaiting: path.join(stateDir, "awaiting.json"),
    blocked: path.join(stateDir, "BLOCKED.json"),
    queue: path.join(stateDir, "queue.json"),
  };
}

function registerPush(stateDir, sha, metadata = {}) {
  assertSha(sha);
  return withStateLock(stateDir, () => {
    const files = statePaths(stateDir);
    const awaiting = readJson(files.awaiting, []);
    const queue = readJson(files.queue, []);
    const active = readJson(files.active, null);
    const alreadyKnown = awaiting.some((entry) => entry.sha === sha)
      || queue.some((entry) => entry.sha === sha)
      || active?.sha === sha;

    if (!alreadyKnown) {
      awaiting.push({
        sha,
        receivedAt: new Date().toISOString(),
        ...metadata,
      });
      writeJsonAtomic(files.awaiting, awaiting);
    }

    return { sha, alreadyKnown };
  });
}

function resolveWorkflowRun(stateDir, sha, outcome, metadata = {}) {
  assertSha(sha);
  return withStateLock(stateDir, () => {
    const files = statePaths(stateDir);
    const awaiting = readJson(files.awaiting, []);
    const queue = readJson(files.queue, []);
    const active = readJson(files.active, null);
    const waitingIndex = awaiting.findIndex((entry) => entry.sha === sha);

    if (queue.some((entry) => entry.sha === sha) || active?.sha === sha) {
      if (waitingIndex !== -1) {
        awaiting.splice(waitingIndex, 1);
        writeJsonAtomic(files.awaiting, awaiting);
      }
      return outcome === "success"
        ? { queued: true, status: "already_queued", sha, runnerRequired: true }
        : { ignored: true, status: "already_approved", sha };
    }

    if (waitingIndex === -1) {
      return { ignored: true, status: "push_not_registered", sha };
    }

    awaiting[waitingIndex] = {
      ...awaiting[waitingIndex],
      ciStatus: outcome,
      concludedAt: new Date().toISOString(),
      ...metadata,
    };

    let promoted = 0;
    let lastRejected = null;
    while (awaiting[0]?.ciStatus) {
      const resolved = awaiting.shift();
      if (resolved.ciStatus === "success") {
        if (!queue.some((entry) => entry.sha === resolved.sha) && active?.sha !== resolved.sha) {
          queue.push({
            sha: resolved.sha,
            receivedAt: resolved.receivedAt,
            approvedAt: resolved.concludedAt,
            runId: resolved.runId || null,
          });
          promoted += 1;
        }
      } else {
        lastRejected = resolved;
      }
    }

    writeJsonAtomic(files.awaiting, awaiting);
    writeJsonAtomic(files.queue, queue);
    if (lastRejected) {
      writeJsonAtomic(path.join(stateDir, "last-rejected.json"), lastRejected);
    }

    if (outcome !== "success") {
      return {
        ignored: true,
        status: "ci_not_successful",
        sha,
        runnerRequired: promoted > 0,
      };
    }

    const position = queue.findIndex((entry) => entry.sha === sha);

    return {
      queued: true,
      status: position === -1
        ? "approved_waiting_for_prior_ci"
        : fs.existsSync(files.blocked) ? "queued_while_blocked" : "queued",
      sha,
      ...(position === -1 ? {} : { position: position + 1 }),
      runnerRequired: promoted > 0,
    };
  });
}

function approveWorkflowRun(stateDir, sha, metadata = {}) {
  return resolveWorkflowRun(stateDir, sha, "success", metadata);
}

function rejectWorkflowRun(stateDir, sha, metadata = {}) {
  return resolveWorkflowRun(stateDir, sha, "rejected", metadata);
}

function recoverInterruptedDeploy(stateDir) {
  withStateLock(stateDir, () => {
    const files = statePaths(stateDir);
    const active = readJson(files.active, null);
    if (!active) return;

    const queue = readJson(files.queue, []);
    if (!queue.some((entry) => entry.sha === active.sha)) {
      queue.unshift({
        ...active,
        recoveredAt: new Date().toISOString(),
      });
      writeJsonAtomic(files.queue, queue);
    }
    fs.rmSync(files.active, { force: true });
  });
}

function claimNext(stateDir) {
  return withStateLock(stateDir, () => {
    const files = statePaths(stateDir);
    if (fs.existsSync(files.blocked)) return null;

    const queue = readJson(files.queue, []);
    if (queue.length === 0) return null;

    const entry = queue.shift();
    const active = {
      ...entry,
      startedAt: new Date().toISOString(),
      runnerPid: process.pid,
    };
    writeJsonAtomic(files.queue, queue);
    writeJsonAtomic(files.active, active);
    return active;
  });
}

function completeActive(stateDir, sha, result) {
  withStateLock(stateDir, () => {
    const files = statePaths(stateDir);
    const active = readJson(files.active, null);
    if (active?.sha === sha) fs.rmSync(files.active, { force: true });
    writeJsonAtomic(path.join(stateDir, "last-result.json"), {
      sha,
      completedAt: new Date().toISOString(),
      ...result,
    });
  });
}

function blockQueue(stateDir, sha, reason) {
  withStateLock(stateDir, () => {
    const files = statePaths(stateDir);
    const queue = readJson(files.queue, []);
    if (!queue.some((entry) => entry.sha === sha)) {
      queue.unshift({
        sha,
        recoveredAfterBlock: new Date().toISOString(),
      });
      writeJsonAtomic(files.queue, queue);
    }
    writeJsonAtomic(files.blocked, {
      sha,
      reason,
      blockedAt: new Date().toISOString(),
    });
  });
}

function getQueueStatus(stateDir) {
  ensureStateDir(stateDir);
  const files = statePaths(stateDir);
  const awaiting = readJson(files.awaiting, []);
  const queue = readJson(files.queue, []);
  const active = readJson(files.active, null);
  return {
    awaitingCi: awaiting.length,
    queued: queue.length,
    activeSha: active?.sha || null,
    blocked: fs.existsSync(files.blocked),
  };
}

function ensureRunner({ appDir, stateDir, queueScript }) {
  ensureStateDir(stateDir);
  const logDir = path.join(appDir, "logs");
  fs.mkdirSync(logDir, { recursive: true });
  const snapshotDir = fs.mkdtempSync(path.join(stateDir, "runner-"));
  fs.chmodSync(snapshotDir, 0o700);
  const queueSnapshot = path.join(snapshotDir, "deploy-queue.cjs");
  const deploySnapshot = path.join(snapshotDir, "deploy-vps.sh");
  const healthSnapshot = path.join(snapshotDir, "health-check-vps.sh");
  fs.copyFileSync(queueScript, queueSnapshot);
  fs.copyFileSync(path.join(appDir, "scripts", "deploy-vps.sh"), deploySnapshot);
  fs.copyFileSync(path.join(appDir, "scripts", "health-check-vps.sh"), healthSnapshot);
  fs.chmodSync(queueSnapshot, 0o700);
  fs.chmodSync(deploySnapshot, 0o700);
  fs.chmodSync(healthSnapshot, 0o700);

  const logFd = fs.openSync(path.join(logDir, "deploy-queue.log"), "a", 0o600);
  const child = spawn(process.execPath, [queueSnapshot, "--run"], {
    cwd: appDir,
    detached: true,
    env: {
      ...process.env,
      APP_DIR: appDir,
      DEPLOY_SCRIPT: deploySnapshot,
      DEPLOY_HEALTH_SCRIPT_SOURCE: healthSnapshot,
      DEPLOY_RUNNER_SNAPSHOT_DIR: snapshotDir,
      DEPLOY_STATE_DIR: stateDir,
    },
    stdio: ["ignore", logFd, logFd],
  });
  child.unref();
  fs.closeSync(logFd);
  return child.pid;
}

function cleanupRunnerSnapshot(stateDir) {
  const snapshotDir = process.env.DEPLOY_RUNNER_SNAPSHOT_DIR;
  if (!snapshotDir) return;

  const resolvedStateDir = path.resolve(stateDir);
  const resolvedSnapshotDir = path.resolve(snapshotDir);
  if (path.dirname(resolvedSnapshotDir) !== resolvedStateDir) return;
  if (!path.basename(resolvedSnapshotDir).startsWith("runner-")) return;
  fs.rmSync(resolvedSnapshotDir, { recursive: true, force: true });
}

function runQueue() {
  const appDir = process.env.APP_DIR || path.resolve(__dirname, "..");
  const stateDir = process.env.DEPLOY_STATE_DIR || path.join(appDir, ".deploy-state");
  const deployScript = process.env.DEPLOY_SCRIPT || path.join(appDir, "scripts", "deploy-vps.sh");
  ensureStateDir(stateDir);

  const runnerLock = path.join(stateDir, ".runner-lock");
  if (!acquireLock(runnerLock, RUNNER_LOCK_TIMEOUT_MS)) {
    console.error("[deploy-queue] Timed out waiting for the active runner");
    cleanupRunnerSnapshot(stateDir);
    return 2;
  }

  try {
    recoverInterruptedDeploy(stateDir);

    while (true) {
      const entry = claimNext(stateDir);
      if (!entry) break;

      console.log(`[deploy-queue] Deploying approved SHA ${entry.sha}`);
      const result = spawnSync("bash", [deployScript, entry.sha], {
        cwd: appDir,
        env: {
          ...process.env,
          APP_DIR: appDir,
          DEPLOY_SHA: entry.sha,
          DEPLOY_STATE_DIR: stateDir,
        },
        stdio: "inherit",
      });

      if (result.status === 0) {
        completeActive(stateDir, entry.sha, { ok: true });
        continue;
      }

      const reason = result.signal
        ? `deploy_terminated_by_${result.signal}`
        : `deploy_exit_${result.status}`;
      completeActive(stateDir, entry.sha, { ok: false, reason });

      if (result.status === 2 || result.status === null) {
        blockQueue(stateDir, entry.sha, reason);
        console.error(`[deploy-queue] Queue blocked: ${reason}`);
        return 2;
      }

      console.error(`[deploy-queue] ${entry.sha} failed and rolled back; continuing queue`);
    }

    return 0;
  } finally {
    releaseLock(runnerLock);
    cleanupRunnerSnapshot(stateDir);
  }
}

if (require.main === module && process.argv[2] === "--run") {
  process.exitCode = runQueue();
}

module.exports = {
  approveWorkflowRun,
  claimNext,
  completeActive,
  ensureRunner,
  getQueueStatus,
  recoverInterruptedDeploy,
  rejectWorkflowRun,
  registerPush,
  runQueue,
};
