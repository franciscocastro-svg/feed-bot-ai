#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const RECOVERABLE_BLOCK_REASON = "deploy_process_exit_unobserved";
const PENDING_BLOCK_REASON = "vps_recovery_target_pending_manual_media_deploy";
const PLAN_KIND = "fluxfeed-interrupted-deploy-recovery-plan";
const RECONCILIATION_KIND = "fluxfeed-interrupted-deploy-recovery";

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function readJsonExact(filePath) {
  const raw = fs.readFileSync(filePath);
  return { raw, value: JSON.parse(raw.toString("utf8")) };
}

function writeFileAtomic(filePath, content, mode = 0o600) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  let descriptor;
  try {
    descriptor = fs.openSync(tempPath, "wx", mode);
    fs.writeFileSync(descriptor, content);
    fs.fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }

  try {
    fs.renameSync(tempPath, filePath);
    fsyncDirectory(path.dirname(filePath));
  } catch (error) {
    fs.rmSync(tempPath, { force: true });
    throw error;
  }
}

function writeJsonAtomic(filePath, value) {
  writeFileAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function fsyncDirectory(directoryPath) {
  const descriptor = fs.openSync(directoryPath, "r");
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function isPrivateOwnedDirectory(directoryPath) {
  const stats = fs.lstatSync(directoryPath);
  return stats.isDirectory() && !stats.isSymbolicLink() && (stats.mode & 0o077) === 0
    && (typeof process.getuid !== "function" || stats.uid === process.getuid());
}

function isPrivateOwnedFile(filePath) {
  const stats = fs.lstatSync(filePath);
  return stats.isFile() && !stats.isSymbolicLink() && (stats.mode & 0o077) === 0
    && (typeof process.getuid !== "function" || stats.uid === process.getuid());
}

function isSameOrDescendant(parentPath, candidatePath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".."
    && !path.isAbsolute(relative));
}

function statePaths(stateDir) {
  return {
    active: path.join(stateDir, "active.json"),
    awaiting: path.join(stateDir, "awaiting.json"),
    blocked: path.join(stateDir, "BLOCKED.json"),
    lastResult: path.join(stateDir, "last-result.json"),
    queue: path.join(stateDir, "queue.json"),
    reconciliations: path.join(stateDir, "reconciliations.json"),
    results: path.join(stateDir, "results.json"),
    runnerLock: path.join(stateDir, ".runner-lock"),
    stateLock: path.join(stateDir, ".state-lock"),
  };
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

function defaultRepositoryInspector(repoDir, targetSha, ancestryShas) {
  const git = (...args) => execFileSync("git", args, {
    cwd: repoDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  const headSha = git("rev-parse", "HEAD^{commit}");
  const mainSha = git("rev-parse", "origin/main^{commit}");
  git("cat-file", "-e", `${targetSha}^{commit}`);
  const nonAncestors = [];
  for (const sha of ancestryShas) {
    try {
      execFileSync("git", ["merge-base", "--is-ancestor", sha, targetSha], {
        cwd: repoDir,
        stdio: "ignore",
      });
    } catch {
      nonAncestors.push(sha);
    }
  }
  return { headSha, mainSha, nonAncestors };
}

function validateJournal(value, label) {
  if (!value || value.version !== 1 || !value.bySha
    || typeof value.bySha !== "object" || Array.isArray(value.bySha)) {
    throw new Error(`Invalid ${label} journal`);
  }
}

function validateReconciliations(value) {
  if (!value || value.version !== 1 || !value.byTarget
    || typeof value.byTarget !== "object" || Array.isArray(value.byTarget)) {
    throw new Error("Invalid reconciliations journal");
  }
}

function requirePrivateFiles(files, labels) {
  for (const label of labels) {
    if (!isPrivateOwnedFile(files[label])) {
      throw new Error(`Deploy state file must be private and regular: ${label}`);
    }
  }
}

function validateQueueEntry(entry, index) {
  if (!entry || typeof entry !== "object" || !SHA_PATTERN.test(entry.sha || "")
    || entry.status !== "queued" || !Number.isInteger(entry.runId) || entry.runId <= 0
    || !Number.isFinite(Date.parse(entry.receivedAt || ""))
    || !Number.isFinite(Date.parse(entry.approvedAt || ""))) {
    throw new Error(`Invalid approved queue entry at position ${index + 1}`);
  }
}

function buildInterruptedQueuePlan(options) {
  const {
    allowStateLock = false,
    inspectRepository = defaultRepositoryInspector,
    isPidAlive = processIsAlive,
    isProcessGroupAlive = processGroupIsAlive,
    repoDir,
    stateDir,
    targetSha,
  } = options;
  if (!path.isAbsolute(stateDir || "") || !path.isAbsolute(repoDir || "")
    || !SHA_PATTERN.test(targetSha || "")) {
    throw new Error("Recovery inspection requires absolute paths and a full target SHA");
  }
  if (!isPrivateOwnedDirectory(stateDir)) {
    throw new Error("Deploy state directory must be private and regular");
  }
  const files = statePaths(stateDir);
  if ((!allowStateLock && fs.existsSync(files.stateLock)) || fs.existsSync(files.runnerLock)) {
    throw new Error("A deploy state or runner lock is active");
  }
  requirePrivateFiles(files, [
    "active",
    "awaiting",
    "blocked",
    "lastResult",
    "queue",
    "reconciliations",
    "results",
  ]);

  const state = {};
  for (const label of [
    "active",
    "awaiting",
    "blocked",
    "lastResult",
    "queue",
    "reconciliations",
    "results",
  ]) {
    state[label] = readJsonExact(files[label]);
  }
  const active = state.active.value;
  const blocked = state.blocked.value;
  const awaiting = state.awaiting.value;
  const queue = state.queue.value;
  const results = state.results.value;
  const reconciliations = state.reconciliations.value;

  if (!active || active.status !== "deploying" || !SHA_PATTERN.test(active.sha || "")
    || blocked?.sha !== active.sha || blocked?.status !== "interrupted"
    || blocked?.reason !== RECOVERABLE_BLOCK_REASON
    || blocked?.deployPid !== active.deployPid) {
    throw new Error("Interrupted active deployment and block do not match the recoverable contract");
  }
  if (isPidAlive(active.runnerPid) || isPidAlive(active.deployPid)
    || isProcessGroupAlive(active.deployProcessGroupId)) {
    throw new Error("An interrupted runner or deploy process is still alive");
  }
  if (!Array.isArray(awaiting) || awaiting.length !== 0) {
    throw new Error("awaiting.json must be empty before interrupted queue reconciliation");
  }
  if (!Array.isArray(queue) || queue.length < 1) {
    throw new Error("Approved deploy queue is empty");
  }
  const seen = new Set();
  queue.forEach((entry, index) => {
    validateQueueEntry(entry, index);
    if (seen.has(entry.sha) || entry.sha === active.sha) {
      throw new Error("Deploy queue contains a duplicate or active SHA");
    }
    seen.add(entry.sha);
  });
  if (queue.at(-1)?.sha !== targetSha || queue.filter((entry) => entry.sha === targetSha).length !== 1) {
    throw new Error("Approved target must be the final and unique queue entry");
  }
  validateJournal(results, "results");
  validateReconciliations(reconciliations);
  const operationalShas = [active.sha, ...queue.map((entry) => entry.sha)];
  if (operationalShas.some((sha) => results.bySha[sha])) {
    throw new Error("An operational SHA already has a terminal result");
  }
  if (reconciliations.byTarget[targetSha]) {
    throw new Error("Target already has a reconciliation record");
  }

  const repository = inspectRepository(repoDir, targetSha, operationalShas);
  if (repository.headSha !== active.sha || repository.mainSha !== targetSha
    || repository.nonAncestors.length > 0) {
    throw new Error("Git HEAD, origin/main or target ancestry diverged from the recovery plan");
  }

  const runnerSnapshotCount = fs.readdirSync(stateDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("runner-")).length;
  const stateHashes = {};
  for (const [label, snapshot] of Object.entries(state)) stateHashes[label] = sha256(snapshot.raw);
  const plan = {
    version: 1,
    kind: PLAN_KIND,
    installedSha: active.sha,
    targetSha,
    targetRunId: queue.at(-1).runId,
    queueCount: queue.length,
    supersededQueueCount: queue.length - 1,
    totalSupersededCount: queue.length,
    runnerSnapshotCount,
    stateHashes,
  };
  return {
    active,
    awaiting,
    blocked,
    files,
    plan,
    planSha256: sha256(JSON.stringify(plan)),
    queue,
    reconciliations,
    results,
    state,
  };
}

function acquireStateLock(lockDir, purpose) {
  fs.mkdirSync(lockDir, { mode: 0o700 });
  writeJsonAtomic(path.join(lockDir, "owner.json"), {
    pid: process.pid,
    acquiredAt: new Date().toISOString(),
    purpose,
  });
}

function releaseStateLock(lockDir) {
  fs.rmSync(lockDir, { recursive: true, force: true });
}

function createBackupDirectory(backupDir, files, labels, metadata) {
  if (!path.isAbsolute(backupDir || "")) throw new Error("Backup directory must be absolute");
  const parent = path.dirname(backupDir);
  if (!isPrivateOwnedDirectory(parent) || fs.lstatSync(backupDir, { throwIfNoEntry: false })) {
    throw new Error("Backup destination must be new under a private directory");
  }
  const tempDir = `${backupDir}.tmp-${process.pid}-${Date.now()}`;
  const manifest = {
    version: 1,
    kind: "fluxfeed-interrupted-deploy-state-backup",
    createdAt: new Date().toISOString(),
    ...metadata,
    files: {},
  };
  try {
    fs.mkdirSync(tempDir, { mode: 0o700 });
    for (const label of labels) {
      const sourcePath = files[label];
      if (!isPrivateOwnedFile(sourcePath)) throw new Error(`Cannot back up unsafe state file: ${label}`);
      const content = fs.readFileSync(sourcePath);
      writeFileAtomic(path.join(tempDir, path.basename(sourcePath)), content);
      manifest.files[label] = {
        name: path.basename(sourcePath),
        bytes: content.length,
        sha256: sha256(content),
      };
    }
    writeJsonAtomic(path.join(tempDir, "manifest.json"), manifest);
    fsyncDirectory(tempDir);
    fs.renameSync(tempDir, backupDir);
    fsyncDirectory(parent);
  } catch (error) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
  return manifest;
}

function restoreBackup(backupDir, files, manifest, labels) {
  if (!isPrivateOwnedDirectory(backupDir)
    || manifest?.kind !== "fluxfeed-interrupted-deploy-state-backup") {
    throw new Error("State backup cannot be restored safely");
  }
  for (const label of labels) {
    const expected = manifest.files?.[label];
    const sourcePath = path.join(backupDir, expected?.name || "missing");
    if (!expected || !isPrivateOwnedFile(sourcePath)) {
      throw new Error(`State backup is incomplete: ${label}`);
    }
    const content = fs.readFileSync(sourcePath);
    if (content.length !== expected.bytes || sha256(content) !== expected.sha256) {
      throw new Error(`State backup hash mismatch: ${label}`);
    }
    writeFileAtomic(files[label], content);
  }
  fsyncDirectory(path.dirname(files.blocked));
}

function fingerprintBackup(backupDir) {
  if (!isPrivateOwnedDirectory(backupDir)) throw new Error("Evidence directory is not private");
  const digest = crypto.createHash("sha256");
  let fileCount = 0;
  for (const entry of fs.readdirSync(backupDir, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = path.join(backupDir, entry.name);
    if (!entry.isFile() || !isPrivateOwnedFile(entryPath)) {
      throw new Error(`Evidence entry is not a private regular file: ${entry.name}`);
    }
    const content = fs.readFileSync(entryPath);
    digest.update(`${entry.name}\0${content.length}\0`);
    digest.update(content);
    digest.update("\0");
    fileCount += 1;
  }
  if (fileCount === 0) throw new Error("Evidence directory is empty");
  return { fileCount, sha256: digest.digest("hex") };
}

function executeInterruptedQueueReconciliation(options) {
  const {
    evidenceDir,
    executionApproval,
    expectedPlanSha256,
    repoDir,
    stageHook = () => {},
    stateDir,
    targetSha,
  } = options;
  if (executionApproval !== targetSha || !HASH_PATTERN.test(expectedPlanSha256 || "")) {
    throw new Error("Execution approval or expected recovery plan hash is invalid");
  }
  if (isSameOrDescendant(stateDir, evidenceDir)) {
    throw new Error("Evidence directory must stay outside deploy state");
  }
  const initial = buildInterruptedQueuePlan(options);
  if (initial.planSha256 !== expectedPlanSha256) {
    throw new Error("Interrupted queue recovery plan hash mismatch");
  }
  acquireStateLock(initial.files.stateLock, "interrupted_deploy_queue_reconciliation");
  let backupManifest;
  const backupLabels = [
    "blocked",
    "active",
    "queue",
    "awaiting",
    "results",
    "reconciliations",
    "lastResult",
  ];
  try {
    const current = buildInterruptedQueuePlan({ ...options, allowStateLock: true });
    if (current.planSha256 !== expectedPlanSha256) {
      throw new Error("Interrupted queue state changed after lock acquisition");
    }
    backupManifest = createBackupDirectory(evidenceDir, current.files, backupLabels, {
      plan: current.plan,
      planSha256: current.planSha256,
    });
    const evidence = fingerprintBackup(evidenceDir);
    stageHook("backup_created");

    const reconciledAt = new Date().toISOString();
    writeJsonAtomic(current.files.blocked, {
      sha: targetSha,
      status: "target_pending_manual_media_deploy",
      reason: PENDING_BLOCK_REASON,
      blockedAt: reconciledAt,
      previousBlockedSha: current.active.sha,
      previousBlockedReason: current.blocked.reason,
      recoveryPlanSha256: current.planSha256,
      evidenceDir,
      evidenceSha256: evidence.sha256,
    });
    stageHook("target_block_written");

    const results = current.results;
    results.bySha[current.active.sha] = {
      sha: current.active.sha,
      status: "superseded",
      ok: false,
      reason: "interrupted_deploy_superseded_by_newer_approved_target",
      interruptedReason: current.blocked.reason,
      approvedTargetSha: targetSha,
      reconciledAt,
    };
    for (const entry of current.queue.slice(0, -1)) {
      results.bySha[entry.sha] = {
        sha: entry.sha,
        status: "superseded",
        ok: false,
        reason: "newer_approved_target",
        approvedTargetSha: targetSha,
        runId: entry.runId,
        reconciledAt,
      };
    }
    writeJsonAtomic(current.files.results, results);
    stageHook("results_written");

    const reconciliations = current.reconciliations;
    reconciliations.byTarget[targetSha] = {
      kind: RECONCILIATION_KIND,
      targetSha,
      installedSha: current.active.sha,
      status: "target_pending_manual_media_deploy",
      reconciledAt,
      queueBeforeCount: current.queue.length,
      supersededCount: current.plan.totalSupersededCount,
      recoveryPlanSha256: current.planSha256,
      evidenceDir,
      evidenceSha256: evidence.sha256,
    };
    writeJsonAtomic(current.files.reconciliations, reconciliations);
    stageHook("reconciliation_written");

    writeJsonAtomic(current.files.queue, [current.queue.at(-1)]);
    stageHook("queue_reduced_to_target");
    fs.rmSync(current.files.active);
    fsyncDirectory(stateDir);
    stageHook("active_removed");

    const finalBlocked = JSON.parse(fs.readFileSync(current.files.blocked, "utf8"));
    const finalQueue = JSON.parse(fs.readFileSync(current.files.queue, "utf8"));
    const finalResults = JSON.parse(fs.readFileSync(current.files.results, "utf8"));
    const finalReconciliations = JSON.parse(fs.readFileSync(current.files.reconciliations, "utf8"));
    if (finalBlocked?.sha !== targetSha || finalBlocked?.reason !== PENDING_BLOCK_REASON
      || finalQueue.length !== 1 || finalQueue[0]?.sha !== targetSha
      || fs.existsSync(current.files.active)
      || finalReconciliations.byTarget?.[targetSha]?.status !== "target_pending_manual_media_deploy"
      || finalReconciliations.byTarget?.[targetSha]?.evidenceSha256 !== evidence.sha256
      || finalResults.bySha?.[targetSha]
      || finalResults.bySha?.[current.active.sha]?.status !== "superseded") {
      throw new Error("Interrupted queue reconciliation postcheck failed");
    }
    stageHook("postcheck_complete");
    return {
      evidenceDir,
      evidenceSha256: evidence.sha256,
      installedSha: current.active.sha,
      queueCount: 1,
      status: "target_pending_manual_media_deploy",
      supersededCount: current.plan.totalSupersededCount,
      targetSha,
    };
  } catch (error) {
    if (backupManifest) {
      try {
        restoreBackup(evidenceDir, initial.files, backupManifest, backupLabels);
      } catch (restoreError) {
        throw new Error(`${error.message}; STATE RESTORE FAILED: ${restoreError.message}`);
      }
    }
    throw error;
  } finally {
    releaseStateLock(initial.files.stateLock);
  }
}

function validateCompletionState(options, allowStateLock = false) {
  const {
    expectedEvidenceSha256,
    inspectRepository = defaultRepositoryInspector,
    repoDir,
    stateDir,
    targetSha,
  } = options;
  const files = statePaths(stateDir);
  if ((!allowStateLock && fs.existsSync(files.stateLock)) || fs.existsSync(files.runnerLock)
    || fs.existsSync(files.active)) {
    throw new Error("Recovery completion found active deployment or lock");
  }
  requirePrivateFiles(files, [
    "awaiting",
    "blocked",
    "lastResult",
    "queue",
    "reconciliations",
    "results",
  ]);
  const awaiting = readJsonExact(files.awaiting).value;
  const blocked = readJsonExact(files.blocked).value;
  const queue = readJsonExact(files.queue).value;
  const results = readJsonExact(files.results).value;
  const reconciliations = readJsonExact(files.reconciliations).value;
  validateJournal(results, "results");
  validateReconciliations(reconciliations);
  const record = reconciliations.byTarget[targetSha];
  if (!Array.isArray(awaiting) || awaiting.length !== 0
    || !Array.isArray(queue) || queue.length !== 1 || queue[0]?.sha !== targetSha
    || blocked?.sha !== targetSha || blocked?.reason !== PENDING_BLOCK_REASON
    || record?.kind !== RECONCILIATION_KIND
    || record?.status !== "target_pending_manual_media_deploy"
    || record?.evidenceDir !== blocked.evidenceDir
    || record?.evidenceSha256 !== expectedEvidenceSha256
    || results.bySha[targetSha]) {
    throw new Error("Pending manual media deployment state diverged");
  }
  const evidence = fingerprintBackup(blocked.evidenceDir);
  if (evidence.sha256 !== expectedEvidenceSha256) {
    throw new Error("Recovery evidence fingerprint mismatch");
  }
  const repository = inspectRepository(repoDir, targetSha, [targetSha]);
  if (repository.headSha !== targetSha || repository.mainSha !== targetSha
    || repository.nonAncestors.length > 0) {
    throw new Error("VPS HEAD or origin/main does not match the completed media deployment");
  }
  return { awaiting, blocked, evidence, files, queue, reconciliations, record, results };
}

function completeInterruptedQueueRecovery(options) {
  const {
    backupDir,
    ciSha,
    executionApproval,
    expectedEvidenceSha256,
    healthSha,
    mainSha,
    stageHook = () => {},
    stateDir,
    targetSha,
    vpsHeadSha,
  } = options;
  const exactShas = [ciSha, executionApproval, healthSha, mainSha, vpsHeadSha];
  if (!SHA_PATTERN.test(targetSha || "") || exactShas.some((sha) => sha !== targetSha)
    || !HASH_PATTERN.test(expectedEvidenceSha256 || "")
    || !path.isAbsolute(stateDir || "") || !path.isAbsolute(backupDir || "")) {
    throw new Error("Recovery completion requires matching target, CI, health, main and VPS SHAs");
  }
  if (isSameOrDescendant(stateDir, backupDir)) {
    throw new Error("Completion backup must stay outside deploy state");
  }
  const initial = validateCompletionState(options);
  if (isSameOrDescendant(initial.blocked.evidenceDir, backupDir)) {
    throw new Error("Completion backup must stay outside recovery evidence");
  }
  acquireStateLock(initial.files.stateLock, "interrupted_deploy_queue_completion");
  let backupManifest;
  const backupLabels = ["blocked", "queue", "awaiting", "results", "reconciliations", "lastResult"];
  try {
    const current = validateCompletionState(options, true);
    backupManifest = createBackupDirectory(backupDir, current.files, backupLabels, {
      targetSha,
      evidenceDir: current.blocked.evidenceDir,
      evidenceSha256: expectedEvidenceSha256,
    });
    stageHook("backup_created");

    const completedAt = new Date().toISOString();
    const targetResult = {
      sha: targetSha,
      status: "succeeded",
      ok: true,
      reason: "manual_media_deploy_verified_after_interrupted_queue_recovery",
      completedAt,
      previousInstalledSha: current.record.installedSha,
      mediaOnly: true,
    };
    current.results.bySha[targetSha] = targetResult;
    writeJsonAtomic(current.files.results, current.results);
    writeJsonAtomic(current.files.lastResult, targetResult);
    stageHook("results_written");

    current.reconciliations.byTarget[targetSha] = {
      ...current.record,
      status: "completed",
      completedAt,
      completionBackupDir: backupDir,
      deployedScope: "feedbot-media",
    };
    writeJsonAtomic(current.files.reconciliations, current.reconciliations);
    stageHook("reconciliation_completed");
    writeJsonAtomic(current.files.queue, []);
    stageHook("queue_emptied");
    fs.rmSync(current.files.blocked);
    fsyncDirectory(stateDir);
    stageHook("block_removed");

    const finalQueue = JSON.parse(fs.readFileSync(current.files.queue, "utf8"));
    const finalResults = JSON.parse(fs.readFileSync(current.files.results, "utf8"));
    const finalReconciliations = JSON.parse(fs.readFileSync(current.files.reconciliations, "utf8"));
    const finalLastResult = JSON.parse(fs.readFileSync(current.files.lastResult, "utf8"));
    if (fs.existsSync(current.files.blocked) || finalQueue.length !== 0
      || finalResults.bySha?.[targetSha]?.status !== "succeeded"
      || finalReconciliations.byTarget?.[targetSha]?.status !== "completed"
      || finalLastResult?.sha !== targetSha || finalLastResult?.status !== "succeeded"
      || fingerprintBackup(current.blocked.evidenceDir).sha256 !== expectedEvidenceSha256) {
      throw new Error("Interrupted queue completion postcheck failed");
    }
    stageHook("postcheck_complete");
    return {
      backupDir,
      completedAt,
      deployedScope: "feedbot-media",
      queueCount: 0,
      status: "completed",
      targetSha,
    };
  } catch (error) {
    if (backupManifest) {
      try {
        restoreBackup(backupDir, initial.files, backupManifest, backupLabels);
      } catch (restoreError) {
        throw new Error(`${error.message}; COMPLETION RESTORE FAILED: ${restoreError.message}`);
      }
    }
    throw error;
  } finally {
    releaseStateLock(initial.files.stateLock);
  }
}

function requiredEnvironment(name) {
  const value = process.env[name] || "";
  if (!value) throw new Error(`Missing required environment value: ${name}`);
  return value;
}

function main() {
  const mode = process.argv[2];
  const common = {
    repoDir: process.env.APP_DIR || "/opt/feedbot",
    stateDir: process.env.DEPLOY_STATE_DIR || "/opt/feedbot/.deploy-state",
    targetSha: requiredEnvironment("VPS_RECOVERY_TARGET_SHA"),
  };
  if (mode === "--inspect") {
    const result = buildInterruptedQueuePlan(common);
    process.stdout.write(`VPS_RECOVERY_PLAN=${JSON.stringify(result.plan)}\n`);
    process.stdout.write(`VPS_RECOVERY_PLAN_SHA256=${result.planSha256}\n`);
    process.stdout.write("VPS_RECOVERY_MUTATION_AUTHORIZED=false\n");
    return;
  }
  if (mode === "--execute") {
    const result = executeInterruptedQueueReconciliation({
      ...common,
      evidenceDir: requiredEnvironment("VPS_RECOVERY_EVIDENCE_DIR"),
      executionApproval: requiredEnvironment("VPS_RECOVERY_APPROVED_TARGET"),
      expectedPlanSha256: requiredEnvironment("VPS_RECOVERY_EXPECTED_PLAN_SHA256"),
    });
    process.stdout.write(`VPS_RECOVERY_RECONCILIATION=${JSON.stringify(result)}\n`);
    process.stdout.write("VPS_RECOVERY_DEPLOY_AUTHORIZED=false\n");
    process.stdout.write("VPS_RECOVERY_RESULT=PASS_TARGET_BLOCKED_PENDING_MANUAL_MEDIA_DEPLOY\n");
    return;
  }
  if (mode === "--complete") {
    const result = completeInterruptedQueueRecovery({
      ...common,
      backupDir: requiredEnvironment("VPS_RECOVERY_COMPLETION_BACKUP_DIR"),
      ciSha: requiredEnvironment("VPS_RECOVERY_CI_SHA"),
      executionApproval: requiredEnvironment("VPS_RECOVERY_COMPLETION_APPROVED"),
      expectedEvidenceSha256: requiredEnvironment("VPS_RECOVERY_EXPECTED_EVIDENCE_SHA256"),
      healthSha: requiredEnvironment("VPS_RECOVERY_HEALTH_SHA"),
      mainSha: requiredEnvironment("VPS_RECOVERY_MAIN_SHA"),
      vpsHeadSha: requiredEnvironment("VPS_RECOVERY_VPS_HEAD_SHA"),
    });
    process.stdout.write(`VPS_RECOVERY_COMPLETION=${JSON.stringify(result)}\n`);
    process.stdout.write("VPS_RECOVERY_DEPLOY_AUTHORIZED=false\n");
    process.stdout.write("VPS_RECOVERY_RESULT=PASS_COMPLETED_BLOCK_REMOVED\n");
    return;
  }
  throw new Error("Use --inspect, --execute or --complete");
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`VPS_RECOVERY_RESULT=HALT_PRESERVE_OR_RESTORE_STATE\n${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  PENDING_BLOCK_REASON,
  buildInterruptedQueuePlan,
  completeInterruptedQueueRecovery,
  executeInterruptedQueueReconciliation,
  fingerprintBackup,
  sha256,
};
