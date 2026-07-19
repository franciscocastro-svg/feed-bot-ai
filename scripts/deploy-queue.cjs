#!/usr/bin/env node

const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DELIVERY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
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

function assertDeliveryId(deliveryId) {
  if (deliveryId === undefined || deliveryId === null) return;
  if (typeof deliveryId !== "string" || !DELIVERY_ID_PATTERN.test(deliveryId)) {
    throw new Error("Invalid GitHub delivery ID");
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
  let tempFd;
  try {
    tempFd = fs.openSync(tempPath, "wx", 0o600);
    fs.writeFileSync(tempFd, `${JSON.stringify(value, null, 2)}\n`);
    fs.fsyncSync(tempFd);
  } finally {
    if (tempFd !== undefined) fs.closeSync(tempFd);
  }

  try {
    fs.renameSync(tempPath, filePath);
    const directoryFd = fs.openSync(path.dirname(filePath), "r");
    try {
      fs.fsyncSync(directoryFd);
    } finally {
      fs.closeSync(directoryFd);
    }
  } catch (error) {
    fs.rmSync(tempPath, { force: true });
    throw error;
  }
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

function processGroupIsAlive(groupId) {
  if (!Number.isInteger(groupId) || groupId <= 0) return false;
  try {
    process.kill(-groupId, 0);
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
    deliveries: path.join(stateDir, "deliveries.json"),
    earlyWorkflows: path.join(stateDir, "early-workflows.json"),
    lastRejected: path.join(stateDir, "last-rejected.json"),
    lastResult: path.join(stateDir, "last-result.json"),
    queue: path.join(stateDir, "queue.json"),
    results: path.join(stateDir, "results.json"),
    runnerLock: path.join(stateDir, ".runner-lock"),
  };
}

function readJournal(filePath, key) {
  const value = readJson(filePath, { version: 1, [key]: {} });
  if (!value || value.version !== 1 || !value[key]
    || typeof value[key] !== "object" || Array.isArray(value[key])) {
    throw new Error(`Invalid deploy ${key} journal`);
  }
  return value;
}

function terminalResult(results, sha) {
  const result = results.bySha[sha];
  return result && ["succeeded", "rolled_back", "failed_ci"].includes(result.status)
    ? result
    : null;
}

function terminalResultForFiles(files, results, sha) {
  const journalResult = terminalResult(results, sha);
  if (journalResult) return journalResult;
  const legacy = readJson(files.lastResult, null);
  if (legacy?.sha !== sha) return null;
  if (legacy.status && ["succeeded", "rolled_back", "failed_ci"].includes(legacy.status)) {
    return legacy;
  }
  if (legacy.ok === true) return { ...legacy, status: "succeeded" };
  if (legacy.reason === "deploy_exit_1") return { ...legacy, status: "rolled_back" };
  return null;
}

function beginDelivery(files, metadata, identity) {
  const deliveryId = metadata.deliveryId ?? null;
  assertDeliveryId(deliveryId);
  if (!deliveryId) return { deliveryId: null, journal: null, duplicate: false };
  const journal = readJournal(files.deliveries, "entries");
  const existing = journal.entries[deliveryId];
  if (existing && Object.entries(identity).some(([key, value]) => existing[key] !== value)) {
    const error = new Error(`Conflicting redelivery for ${deliveryId}`);
    error.code = "DELIVERY_CONFLICT";
    throw error;
  }
  const now = new Date().toISOString();
  journal.entries[deliveryId] = {
    ...existing,
    ...identity,
    deliveryId,
    firstSeenAt: existing?.firstSeenAt || now,
    lastSeenAt: now,
    status: existing?.status || "processing",
    duplicateCount: (existing?.duplicateCount || 0) + (existing ? 1 : 0),
  };
  writeJsonAtomic(files.deliveries, journal);
  return { deliveryId, journal, duplicate: Boolean(existing) };
}

function finishDelivery(files, delivery, identity, result) {
  if (!delivery.deliveryId) return;
  const now = new Date().toISOString();
  const existing = delivery.journal.entries[delivery.deliveryId];
  delivery.journal.entries[delivery.deliveryId] = {
    ...existing,
    ...identity,
    deliveryId: delivery.deliveryId,
    firstSeenAt: existing?.firstSeenAt || now,
    lastSeenAt: now,
    status: result.status || null,
    duplicateCount: existing?.duplicateCount || 0,
  };
  writeJsonAtomic(files.deliveries, delivery.journal);
}

function runnerRequired(files, queue) {
  const active = readJson(files.active, null);
  return (queue.length > 0 || Boolean(active))
    && !fs.existsSync(files.blocked);
}

function writeResult(files, sha, result) {
  const results = readJournal(files.results, "bySha");
  results.bySha[sha] = result;
  writeJsonAtomic(files.results, results);
  writeJsonAtomic(files.lastResult, result);
}

function promoteResolvedPrefix(files, awaiting, queue, active, results) {
  let resolvedCount = 0;
  let promotedCount = 0;
  let rejectedCount = 0;
  let resultsChanged = false;
  let lastRejected = null;

  while (awaiting[resolvedCount]?.ciStatus) {
    const resolved = awaiting[resolvedCount];
    if (resolved.ciStatus === "success") {
      if (!queue.some((entry) => entry.sha === resolved.sha) && active?.sha !== resolved.sha) {
        queue.push({
          sha: resolved.sha,
          status: "queued",
          receivedAt: resolved.receivedAt,
          approvedAt: resolved.concludedAt,
          runId: resolved.runId || null,
        });
        promotedCount += 1;
      }
    } else {
      lastRejected = resolved;
      results.bySha[resolved.sha] = {
        sha: resolved.sha,
        status: "failed_ci",
        ok: false,
        reason: "ci_not_successful",
        completedAt: resolved.concludedAt,
        conclusion: resolved.conclusion || null,
      };
      resultsChanged = true;
      rejectedCount += 1;
    }
    resolvedCount += 1;
  }

  if (resolvedCount === 0) {
    writeJsonAtomic(files.awaiting, awaiting);
    return { promoted: 0, rejected: 0 };
  }

  // Destination files are durable before resolved entries leave awaiting.json.
  if (resultsChanged) writeJsonAtomic(files.results, results);
  if (lastRejected) writeJsonAtomic(files.lastRejected, lastRejected);
  writeJsonAtomic(files.queue, queue);
  awaiting.splice(0, resolvedCount);
  writeJsonAtomic(files.awaiting, awaiting);

  return {
    promoted: promotedCount,
    rejected: rejectedCount,
  };
}

function recordEarlyWorkflow(files, sha, outcome, metadata) {
  const early = readJournal(files.earlyWorkflows, "bySha");
  const records = Array.isArray(early.bySha[sha]) ? early.bySha[sha] : [];
  if (!records.some((entry) => entry.deliveryId === metadata.deliveryId)) {
    records.push({
      sha,
      outcome,
      status: outcome === "success" ? "ci_passed_waiting_for_push" : "failed_ci_waiting_for_push",
      concludedAt: new Date().toISOString(),
      ...metadata,
    });
  }
  early.bySha[sha] = records;
  writeJsonAtomic(files.earlyWorkflows, early);
  return early;
}

function registerPush(stateDir, sha, metadata = {}) {
  assertSha(sha);
  return withStateLock(stateDir, () => {
    const files = statePaths(stateDir);
    const identity = { event: "push", sha };
    const delivery = beginDelivery(files, metadata, identity);
    const awaiting = readJson(files.awaiting, []);
    const queue = readJson(files.queue, []);
    const active = readJson(files.active, null);
    const results = readJournal(files.results, "bySha");
    const early = readJournal(files.earlyWorkflows, "bySha");
    const earlyRecords = Array.isArray(early.bySha[sha]) ? early.bySha[sha] : [];
    const terminal = terminalResultForFiles(files, results, sha);
    const alreadyKnown = awaiting.some((entry) => entry.sha === sha)
      || queue.some((entry) => entry.sha === sha)
      || active?.sha === sha
      || Boolean(terminal);

    if (!alreadyKnown) {
      awaiting.push({
        sha,
        status: "awaiting_ci",
        receivedAt: new Date().toISOString(),
        ...metadata,
      });
    }

    let waitingIndex = awaiting.findIndex((entry) => entry.sha === sha);
    if (earlyRecords.length > 0 && !terminal
      && !queue.some((entry) => entry.sha === sha) && active?.sha !== sha) {
      const earlyResult = earlyRecords[earlyRecords.length - 1];
      awaiting[waitingIndex] = {
        ...awaiting[waitingIndex],
        ciStatus: earlyResult.outcome,
        status: earlyResult.outcome === "success" ? "ci_passed_waiting_fifo" : "failed_ci",
        concludedAt: earlyResult.concludedAt,
        runId: earlyResult.runId || null,
        conclusion: earlyResult.conclusion || null,
        workflowDeliveryId: earlyResult.deliveryId || null,
      };
      promoteResolvedPrefix(files, awaiting, queue, active, results);
      delete early.bySha[sha];
      writeJsonAtomic(files.earlyWorkflows, early);
      waitingIndex = awaiting.findIndex((entry) => entry.sha === sha);
    } else {
      if ((terminal || queue.some((entry) => entry.sha === sha) || active?.sha === sha)
        && waitingIndex !== -1) {
        awaiting.splice(waitingIndex, 1);
      }
      writeJsonAtomic(files.awaiting, awaiting);
      if (earlyRecords.length > 0) {
        delete early.bySha[sha];
        writeJsonAtomic(files.earlyWorkflows, early);
      }
    }

    const terminalAfter = terminalResultForFiles(files, results, sha);
    const queuePosition = queue.findIndex((entry) => entry.sha === sha);
    const waiting = awaiting.find((entry) => entry.sha === sha);
    const status = terminalAfter?.status
      || (active?.sha === sha ? "deploying"
        : queuePosition !== -1 ? (fs.existsSync(files.blocked) ? "blocked" : "queued")
          : waiting?.status || "already_known");

    const result = {
      accepted: true,
      sha,
      alreadyKnown,
      duplicateDelivery: delivery.duplicate,
      duplicateSha: alreadyKnown || earlyRecords.length > 0,
      status,
      terminal: Boolean(terminalAfter),
      runnerRequired: runnerRequired(files, queue),
    };
    finishDelivery(files, delivery, identity, result);
    return result;
  });
}

function resolveWorkflowRun(stateDir, sha, outcome, metadata = {}) {
  assertSha(sha);
  return withStateLock(stateDir, () => {
    const files = statePaths(stateDir);
    const identity = {
      event: "workflow_run",
      sha,
      outcome,
      runId: metadata.runId ?? null,
    };
    const delivery = beginDelivery(files, metadata, identity);
    const awaiting = readJson(files.awaiting, []);
    const queue = readJson(files.queue, []);
    const active = readJson(files.active, null);
    const results = readJournal(files.results, "bySha");
    const terminal = terminalResultForFiles(files, results, sha);
    const waitingIndex = awaiting.findIndex((entry) => entry.sha === sha);

    if (terminal) {
      if (waitingIndex !== -1) {
        awaiting.splice(waitingIndex, 1);
        writeJsonAtomic(files.awaiting, awaiting);
      }
      const result = {
        accepted: true,
        ignored: true,
        status: terminal.status,
        sha,
        terminal: true,
        duplicateDelivery: delivery.duplicate,
        duplicateSha: true,
        runnerRequired: runnerRequired(files, queue),
      };
      finishDelivery(files, delivery, identity, result);
      return result;
    }

    if (queue.some((entry) => entry.sha === sha) || active?.sha === sha) {
      if (waitingIndex !== -1) {
        awaiting.splice(waitingIndex, 1);
        writeJsonAtomic(files.awaiting, awaiting);
      }
      const result = outcome === "success"
        ? {
            accepted: true,
            queued: true,
            status: "already_queued",
            sha,
            duplicateDelivery: delivery.duplicate,
            duplicateSha: true,
            runnerRequired: runnerRequired(files, queue),
          }
        : {
            accepted: true,
            ignored: true,
            status: "already_approved",
            sha,
            duplicateDelivery: delivery.duplicate,
            duplicateSha: true,
            runnerRequired: false,
          };
      finishDelivery(files, delivery, identity, result);
      return result;
    }

    if (waitingIndex === -1) {
      if (!delivery.deliveryId) {
        return { ignored: true, status: "push_not_registered", sha };
      }
      recordEarlyWorkflow(files, sha, outcome, metadata);
      const result = {
        accepted: true,
        status: "workflow_before_push",
        sha,
        duplicateDelivery: delivery.duplicate,
        duplicateSha: false,
        runnerRequired: false,
      };
      finishDelivery(files, delivery, identity, result);
      return result;
    }

    awaiting[waitingIndex] = {
      ...awaiting[waitingIndex],
      ciStatus: outcome,
      status: outcome === "success" ? "ci_passed_waiting_fifo" : "failed_ci",
      concludedAt: new Date().toISOString(),
      ...metadata,
    };

    promoteResolvedPrefix(files, awaiting, queue, active, results);

    if (outcome !== "success") {
      const result = {
        accepted: true,
        ignored: true,
        status: "failed_ci",
        sha,
        duplicateDelivery: delivery.duplicate,
        duplicateSha: false,
        runnerRequired: runnerRequired(files, queue),
      };
      finishDelivery(files, delivery, identity, result);
      return result;
    }

    const position = queue.findIndex((entry) => entry.sha === sha);

    const result = {
      accepted: true,
      queued: true,
      status: position === -1
        ? "ci_passed_waiting_fifo"
        : fs.existsSync(files.blocked) ? "blocked" : "queued",
      sha,
      duplicateDelivery: delivery.duplicate,
      duplicateSha: false,
      ...(position === -1 ? {} : { position: position + 1 }),
      runnerRequired: runnerRequired(files, queue),
    };
    finishDelivery(files, delivery, identity, result);
    return result;
  });
}

function approveWorkflowRun(stateDir, sha, metadata = {}) {
  return resolveWorkflowRun(stateDir, sha, "success", metadata);
}

function rejectWorkflowRun(stateDir, sha, metadata = {}) {
  return resolveWorkflowRun(stateDir, sha, "rejected", metadata);
}

function reconcileProcessingDeliveries(stateDir) {
  if (!fs.existsSync(stateDir)) return { reconciled: 0 };
  const pending = withStateLock(stateDir, () => {
    const files = statePaths(stateDir);
    const deliveries = readJournal(files.deliveries, "entries");
    return Object.values(deliveries.entries)
      .filter((entry) => entry?.status === "processing")
      .sort((left, right) => String(left.firstSeenAt || "").localeCompare(
        String(right.firstSeenAt || ""),
      ) || String(left.deliveryId).localeCompare(String(right.deliveryId)));
  });

  for (const entry of pending) {
    const metadata = {
      deliveryId: entry.deliveryId,
      runId: entry.runId ?? null,
      ...(entry.conclusion ? { conclusion: entry.conclusion } : {}),
    };
    if (entry.event === "push") {
      registerPush(stateDir, entry.sha, metadata);
      continue;
    }
    if (entry.event === "workflow_run" && ["success", "rejected"].includes(entry.outcome)) {
      resolveWorkflowRun(stateDir, entry.sha, entry.outcome, metadata);
      continue;
    }
    throw new Error(`Invalid processing delivery: ${entry.deliveryId || "unknown"}`);
  }

  return { reconciled: pending.length };
}

function markActiveDeployProcess(stateDir, sha, deployPid) {
  withStateLock(stateDir, () => {
    const files = statePaths(stateDir);
    const active = readJson(files.active, null);
    if (!active || active.sha !== sha) {
      throw new Error(`Cannot attach deploy process to inactive SHA: ${sha}`);
    }
    writeJsonAtomic(files.active, {
      ...active,
      deployPid,
      deployProcessGroupId: deployPid,
      deployStartedAt: new Date().toISOString(),
    });
  });
}

function spawnDeployProcess({ appDir, deployScript, entry, stateDir }) {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const child = spawn("bash", [deployScript, entry.sha], {
      cwd: appDir,
      detached: true,
      env: {
        ...process.env,
        APP_DIR: appDir,
        DEPLOY_SHA: entry.sha,
        DEPLOY_STATE_DIR: stateDir,
      },
      stdio: "inherit",
    });

    child.once("error", (error) => settle({ status: null, signal: null, error }));
    if (!Number.isInteger(child.pid) || child.pid <= 0) return;

    try {
      markActiveDeployProcess(stateDir, entry.sha, child.pid);
    } catch (error) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
      settle({ status: null, signal: "SIGTERM", error });
      return;
    }

    child.once("close", (status, signal) => settle({ status, signal, error: null }));
  });
}

function recoverInterruptedDeploy(stateDir) {
  withStateLock(stateDir, () => {
    const files = statePaths(stateDir);
    const active = readJson(files.active, null);
    if (!active) return;

    const results = readJournal(files.results, "bySha");
    if (terminalResultForFiles(files, results, active.sha)) {
      fs.rmSync(files.active, { force: true });
      return;
    }
    if (fs.existsSync(files.blocked)) return;

    const deployProcessAlive = processIsAlive(active.deployPid)
      || processGroupIsAlive(active.deployProcessGroupId);
    const hasDeployPid = Number.isInteger(active.deployPid) && active.deployPid > 0;
    writeJsonAtomic(files.blocked, {
      sha: active.sha,
      status: "interrupted",
      reason: deployProcessAlive
        ? "orphan_deploy_process_still_running"
        : hasDeployPid ? "deploy_process_exit_unobserved" : "deploy_process_pid_not_recorded",
      deployPid: active.deployPid || null,
      blockedAt: new Date().toISOString(),
    });
  });
}

function claimNext(stateDir) {
  return withStateLock(stateDir, () => {
    const files = statePaths(stateDir);
    if (fs.existsSync(files.blocked)) return null;

    const queue = readJson(files.queue, []);
    const results = readJournal(files.results, "bySha");
    while (queue.length > 0 && terminalResultForFiles(files, results, queue[0].sha)) queue.shift();
    if (queue.length === 0) {
      writeJsonAtomic(files.queue, queue);
      return null;
    }

    const entry = queue[0];
    const active = {
      ...entry,
      status: "deploying",
      startedAt: new Date().toISOString(),
      runnerPid: process.pid,
    };
    writeJsonAtomic(files.active, active);
    queue.shift();
    writeJsonAtomic(files.queue, queue);
    return active;
  });
}

function detailedResultForActive(active, sha, result) {
  if (!active || active.sha !== sha) {
    throw new Error(`Inactive deploy SHA or mismatch: ${sha}`);
  }
  const completedAt = new Date().toISOString();
  return {
    sha,
    status: result.status || (result.ok ? "succeeded" : "failed_unknown"),
    startedAt: active.startedAt || result.startedAt || null,
    completedAt,
    durationMs: active.startedAt
      ? Math.max(0, Date.parse(completedAt) - Date.parse(active.startedAt))
      : null,
    exitCode: result.exitCode ?? null,
    signal: result.signal ?? null,
    ...result,
  };
}

function completeActive(stateDir, sha, result) {
  withStateLock(stateDir, () => {
    const files = statePaths(stateDir);
    const active = readJson(files.active, null);
    const detailedResult = detailedResultForActive(active, sha, result);
    writeResult(files, sha, detailedResult);
    fs.rmSync(files.active, { force: true });
  });
}

function completeBlockedActive(stateDir, sha, result) {
  withStateLock(stateDir, () => {
    const files = statePaths(stateDir);
    const active = readJson(files.active, null);
    const detailedResult = detailedResultForActive(active, sha, result);
    const queue = readJson(files.queue, []);
    // BLOCKED must be the first durable transition. A crash after this write
    // can never make a failed/interrupted deploy eligible for automatic retry.
    writeJsonAtomic(files.blocked, {
      sha,
      status: detailedResult.status,
      reason: detailedResult.reason,
      exitCode: detailedResult.exitCode,
      signal: detailedResult.signal,
      blockedAt: new Date().toISOString(),
    });
    writeResult(files, sha, detailedResult);
    if (!queue.some((entry) => entry.sha === sha)) {
      queue.unshift({
        sha,
        status: "queued",
        recoveredAfterBlock: new Date().toISOString(),
      });
    }
    writeJsonAtomic(files.queue, queue);
    fs.rmSync(files.active, { force: true });
  });
}

function assertStateEntries(entries, label) {
  if (!Array.isArray(entries)) throw new Error(`Invalid ${label}: expected an array`);
  const seen = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry !== "object" || !SHA_PATTERN.test(entry.sha || "")) {
      throw new Error(`Invalid ${label} entry`);
    }
    if (seen.has(entry.sha)) throw new Error(`Duplicate SHA in ${label}: ${entry.sha}`);
    seen.add(entry.sha);
  }
}

function validateJournals(files) {
  const deliveries = readJournal(files.deliveries, "entries");
  for (const [deliveryId, entry] of Object.entries(deliveries.entries)) {
    if (!DELIVERY_ID_PATTERN.test(deliveryId) || !entry || typeof entry !== "object"
      || entry.deliveryId !== deliveryId || !SHA_PATTERN.test(entry.sha || "")
      || !["push", "workflow_run"].includes(entry.event)) {
      throw new Error(`Invalid delivery journal entry: ${deliveryId}`);
    }
  }

  const results = readJournal(files.results, "bySha");
  for (const [sha, entry] of Object.entries(results.bySha)) {
    if (!SHA_PATTERN.test(sha) || !entry || typeof entry !== "object" || entry.sha !== sha) {
      throw new Error(`Invalid result journal entry: ${sha}`);
    }
  }

  const early = readJournal(files.earlyWorkflows, "bySha");
  for (const [sha, records] of Object.entries(early.bySha)) {
    if (!SHA_PATTERN.test(sha) || !Array.isArray(records)) {
      throw new Error(`Invalid early workflow journal entry: ${sha}`);
    }
    for (const record of records) {
      if (!record || record.sha !== sha || !["success", "rejected"].includes(record.outcome)) {
        throw new Error(`Invalid early workflow record: ${sha}`);
      }
    }
  }
}

function getQueueStatus(stateDir) {
  return withStateLock(stateDir, () => {
    const files = statePaths(stateDir);
    const awaiting = readJson(files.awaiting, []);
    const queue = readJson(files.queue, []);
    const active = readJson(files.active, null);
    const blocked = readJson(files.blocked, null);
    const lastResult = readJson(files.lastResult, null);
    assertStateEntries(awaiting, "awaiting.json");
    assertStateEntries(queue, "queue.json");
    if (active && (typeof active !== "object" || !SHA_PATTERN.test(active.sha || ""))) {
      throw new Error("Invalid active.json");
    }
    if (blocked && (typeof blocked !== "object" || !SHA_PATTERN.test(blocked.sha || ""))) {
      throw new Error("Invalid BLOCKED.json");
    }
    if (lastResult && (typeof lastResult !== "object" || !SHA_PATTERN.test(lastResult.sha || ""))) {
      throw new Error("Invalid last-result.json");
    }
    const operationalShas = [
      ...awaiting.map((entry) => entry.sha),
      ...queue.map((entry) => entry.sha),
      ...(active ? [active.sha] : []),
    ];
    if (new Set(operationalShas).size !== operationalShas.length) {
      throw new Error("A deploy SHA appears in multiple operational states");
    }
    if (blocked?.ok === true) {
      throw new Error("Invalid BLOCKED.json: blocked state cannot be successful");
    }
    validateJournals(files);
    return {
      awaitingCi: awaiting.length,
      queued: queue.length,
      activeSha: active?.sha || null,
      activeStatus: active?.status || null,
      blocked: Boolean(blocked),
      blockedReason: blocked?.reason || null,
      lastResult,
    };
  });
}

function ensureRunner({ appDir, stateDir, queueScript }) {
  // An absent state directory means no webhook event has ever been persisted.
  // Keep listener startup read-only until there is durable work to reconcile.
  if (!fs.existsSync(stateDir)) return null;
  ensureStateDir(stateDir);
  const shouldStart = withStateLock(stateDir, () => {
    const files = statePaths(stateDir);
    const queue = readJson(files.queue, []);
    assertStateEntries(queue, "queue.json");
    return runnerRequired(files, queue);
  });
  if (!shouldStart) return null;
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

async function runQueue() {
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
      const result = await spawnDeployProcess({ appDir, deployScript, entry, stateDir });

      if (result.status === 0) {
        completeActive(stateDir, entry.sha, {
          ok: true,
          status: "succeeded",
          exitCode: 0,
        });
        continue;
      }

      const exitCode = result.status;
      const signal = result.signal || null;
      const status = exitCode === 10 || exitCode === 1
        ? "rolled_back"
        : exitCode === 20
          ? "failed_preflight"
          : exitCode === 21
            ? "rollback_failed"
            : exitCode === 22 || exitCode === null
              ? "interrupted"
              : "failed_unknown";
      const reason = result.error
        ? `deploy_spawn_failed_${result.error.code || "unknown"}`
        : signal ? `deploy_terminated_by_${signal}` : `deploy_exit_${exitCode}`;
      const completion = {
        ok: false,
        status,
        reason,
        exitCode,
        signal,
      };

      if (![10, 1].includes(exitCode)) {
        completeBlockedActive(stateDir, entry.sha, completion);
        console.error(`[deploy-queue] Queue blocked: ${reason}`);
        return 2;
      }

      completeActive(stateDir, entry.sha, completion);
      console.error(`[deploy-queue] ${entry.sha} failed and rolled back; continuing queue`);
    }

    return 0;
  } finally {
    releaseLock(runnerLock);
    cleanupRunnerSnapshot(stateDir);
  }
}

if (require.main === module && process.argv[2] === "--run") {
  runQueue()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(`[deploy-queue] Unhandled runner failure: ${error.stack || error.message}`);
      process.exitCode = 2;
    });
}

module.exports = {
  approveWorkflowRun,
  claimNext,
  completeActive,
  ensureRunner,
  getQueueStatus,
  reconcileProcessingDeliveries,
  recoverInterruptedDeploy,
  rejectWorkflowRun,
  registerPush,
  runQueue,
};
