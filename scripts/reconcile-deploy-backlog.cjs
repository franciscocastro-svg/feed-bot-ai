#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const DELIVERY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const EXPECTED_REPOSITORY = "franciscocastro-svg/feed-bot-ai";
const EXPECTED_RECORD_COUNT = 9;
const B2F_LEGACY_TARGET_SHA = "9453a1ca1fafb5bc9f6a52dc880f1f1d954f82aa";
const EXPECTED_COUNTS = Object.freeze({
  approved_target: 1,
  superseded_failed_ci: 2,
  superseded_green: 6,
});

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function readJsonExact(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return { raw, value: JSON.parse(raw) };
}

function writeFileAtomic(filePath, content, mode = 0o600) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  let fileDescriptor;
  try {
    fileDescriptor = fs.openSync(tempPath, "wx", mode);
    fs.writeFileSync(fileDescriptor, content);
    fs.fsyncSync(fileDescriptor);
  } finally {
    if (fileDescriptor !== undefined) fs.closeSync(fileDescriptor);
  }
  try {
    fs.renameSync(tempPath, filePath);
    const directoryDescriptor = fs.openSync(path.dirname(filePath), "r");
    try {
      fs.fsyncSync(directoryDescriptor);
    } finally {
      fs.closeSync(directoryDescriptor);
    }
  } catch (error) {
    fs.rmSync(tempPath, { force: true });
    throw error;
  }
}

function writeJsonAtomic(filePath, value) {
  writeFileAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function isRegularPrivateFile(filePath) {
  const stats = fs.lstatSync(filePath);
  return stats.isFile() && !stats.isSymbolicLink() && (stats.mode & 0o077) === 0
    && (typeof process.getuid !== "function" || stats.uid === process.getuid());
}

function isPrivateOwnedDirectory(directoryPath) {
  const stats = fs.lstatSync(directoryPath);
  return stats.isDirectory() && !stats.isSymbolicLink() && (stats.mode & 0o077) === 0
    && (typeof process.getuid !== "function" || stats.uid === process.getuid());
}

function fsyncDirectory(directoryPath) {
  const descriptor = fs.openSync(directoryPath, "r");
  try {
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

function fingerprintEvidenceTree(evidenceDir) {
  if (!path.isAbsolute(evidenceDir) || !isPrivateOwnedDirectory(evidenceDir)) {
    throw new Error("Evidence directory must be absolute, private and regular");
  }
  const digest = crypto.createHash("sha256");
  let fileCount = 0;

  function visit(directoryPath, relativeDirectory) {
    const entries = fs.readdirSync(directoryPath, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const entryPath = path.join(directoryPath, entry.name);
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      const stats = fs.lstatSync(entryPath);
      if (stats.isSymbolicLink()) throw new Error(`Evidence contains symlink: ${relativePath}`);
      if (stats.isDirectory()) {
        if (!isPrivateOwnedDirectory(entryPath)) {
          throw new Error(`Evidence directory is not private: ${relativePath}`);
        }
        digest.update(`D\0${relativePath}\0${stats.mode & 0o777}\0`);
        visit(entryPath, relativePath);
        continue;
      }
      if (!stats.isFile() || !isRegularPrivateFile(entryPath)) {
        throw new Error(`Evidence file is not private and regular: ${relativePath}`);
      }
      const content = fs.readFileSync(entryPath);
      digest.update(`F\0${relativePath}\0${stats.mode & 0o777}\0${content.length}\0`);
      digest.update(content);
      digest.update("\0");
      fileCount += 1;
    }
  }

  visit(evidenceDir, "");
  if (fileCount === 0) throw new Error("Evidence directory is empty");
  return { fileCount, sha256: digest.digest("hex") };
}

function assertAbsent(filePath, label) {
  const targetStats = fs.lstatSync(filePath, { throwIfNoEntry: false });
  if (targetStats || fs.lstatSync(path.dirname(filePath)).isSymbolicLink()) {
    throw new Error(`${label} must be absent before reconciliation`);
  }
}

function validateClassificationReport(report, options = {}) {
  const targetSha = options.targetSha || report?.targetSha;
  const installedSha = options.installedSha || report?.installedSha;
  if (!SHA_PATTERN.test(targetSha || "") || !SHA_PATTERN.test(installedSha || "")) {
    throw new Error("Invalid approved or installed SHA");
  }
  if (!report || report.version !== 1
    || report.kind !== "fluxfeed-b1q0-github-classification"
    || report.repository !== EXPECTED_REPOSITORY
    || report.targetSha !== targetSha
    || report.installedSha !== installedSha
    || report.currentMain !== targetSha
    || report.deployAuthorized !== false
    || report.mutationAuthorized !== false
    || !HASH_PATTERN.test(report.inventorySha256 || "")
    || !HASH_PATTERN.test(report.awaitingFileSha256 || "")
    || !HASH_PATTERN.test(report.mainRefResponseSha256 || "")
    || !Array.isArray(report.records)
    || report.records.length !== EXPECTED_RECORD_COUNT) {
    throw new Error("Classification report header is invalid");
  }

  const seen = new Set();
  const counts = {
    approved_target: 0,
    superseded_failed_ci: 0,
    superseded_green: 0,
  };
  for (let index = 0; index < report.records.length; index += 1) {
    const record = report.records[index];
    if (!record || record.ordinal !== index + 1 || !SHA_PATTERN.test(record.sha || "")
      || seen.has(record.sha) || !Number.isFinite(Date.parse(record.receivedAt || ""))
      || !Object.hasOwn(counts, record.classification)) {
      throw new Error(`Invalid classification at position ${index + 1}`);
    }
    seen.add(record.sha);
    counts[record.classification] += 1;
    const ci = record.ci;
    if (!ci || ci.workflow !== "CI" || ci.event !== "push" || ci.branch !== "main"
      || ci.headSha !== record.sha || ci.status !== "completed"
      || !Number.isInteger(ci.runId) || ci.runId <= 0
      || !Number.isInteger(ci.runAttempt) || ci.runAttempt <= 0
      || !HASH_PATTERN.test(record.evidence?.commitResponseSha256 || "")
      || !HASH_PATTERN.test(record.evidence?.runsResponseSha256 || "")
      || !HASH_PATTERN.test(record.evidence?.compareResponseSha256 || "")) {
      throw new Error(`Invalid CI evidence for ${record.sha}`);
    }
    if (record.classification === "approved_target") {
      if (record.sha !== targetSha || record.relationToTarget !== "identical"
        || ci.conclusion !== "success") {
        throw new Error("Approved target evidence is invalid");
      }
      continue;
    }
    if (record.relationToTarget !== "ancestor" || record.sha === targetSha) {
      throw new Error(`Invalid target ancestry for ${record.sha}`);
    }
    if (record.classification === "superseded_green" && ci.conclusion !== "success") {
      throw new Error(`Green superseded SHA is not green: ${record.sha}`);
    }
    if (record.classification === "superseded_failed_ci" && ci.conclusion === "success") {
      throw new Error(`Rejected superseded SHA is green: ${record.sha}`);
    }
  }

  for (const [classification, expected] of Object.entries(EXPECTED_COUNTS)) {
    if (counts[classification] !== expected) {
      throw new Error(`Unexpected ${classification} count`);
    }
  }
  return { counts, installedSha, targetSha };
}

function validateAwaitingEntries(awaiting, report) {
  if (!Array.isArray(awaiting) || awaiting.length !== EXPECTED_RECORD_COUNT) {
    throw new Error("Legacy awaiting.json must contain exactly nine entries");
  }
  const seenShas = new Set();
  const seenDeliveries = new Set();
  let previousReceivedAt = -Infinity;
  for (let index = 0; index < awaiting.length; index += 1) {
    const entry = awaiting[index];
    const expected = report.records[index];
    const keys = entry && typeof entry === "object" ? Object.keys(entry).sort() : [];
    if (keys.join(",") !== "deliveryId,receivedAt,sha"
      || !SHA_PATTERN.test(entry.sha || "") || seenShas.has(entry.sha)
      || !DELIVERY_ID_PATTERN.test(entry.deliveryId || "")
      || seenDeliveries.has(entry.deliveryId)
      || entry.sha !== expected.sha || entry.receivedAt !== expected.receivedAt) {
      throw new Error(`awaiting.json diverged at position ${index + 1}`);
    }
    const receivedAt = Date.parse(entry.receivedAt);
    if (!Number.isFinite(receivedAt) || receivedAt < previousReceivedAt) {
      throw new Error("awaiting.json is not ordered by reception time");
    }
    previousReceivedAt = receivedAt;
    seenShas.add(entry.sha);
    seenDeliveries.add(entry.deliveryId);
  }
  const targetEntries = awaiting.filter((entry) => entry.sha === report.targetSha);
  if (targetEntries.length !== 1) throw new Error("Target must appear exactly once in awaiting.json");
  return targetEntries[0];
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
    reconciliations: path.join(stateDir, "reconciliations.json"),
    results: path.join(stateDir, "results.json"),
    runnerLock: path.join(stateDir, ".runner-lock"),
    stateLock: path.join(stateDir, ".state-lock"),
  };
}

function completedReconciliation(files, options) {
  const {
    evidenceDir,
    expectedAwaitingSha256,
    reportSha256,
    targetSha,
  } = options;
  if (!fs.existsSync(files.reconciliations) || !fs.existsSync(files.blocked)
    || !fs.existsSync(files.results) || !fs.existsSync(files.awaiting)) return null;
  const reconciliation = JSON.parse(fs.readFileSync(files.reconciliations, "utf8"));
  const blocked = JSON.parse(fs.readFileSync(files.blocked, "utf8"));
  const awaiting = JSON.parse(fs.readFileSync(files.awaiting, "utf8"));
  const record = reconciliation?.byTarget?.[targetSha];
  if (reconciliation?.version !== 1 || record?.reportSha256 !== reportSha256
    || record?.status !== "target_pending_bootstrap" || record?.evidenceDir !== evidenceDir
    || record?.awaitingBeforeSha256 !== expectedAwaitingSha256
    || blocked?.sha !== targetSha || blocked?.reason !== "b1q_target_pending_bootstrap"
    || !Array.isArray(awaiting) || awaiting.length !== 1 || awaiting[0]?.sha !== targetSha) {
    return null;
  }
  if (!fs.existsSync(evidenceDir) || fs.lstatSync(evidenceDir).isSymbolicLink()
    || !fs.lstatSync(evidenceDir).isDirectory()) return null;
  const awaitingEvidence = path.join(evidenceDir, "awaiting.original.json");
  const reportEvidence = path.join(evidenceDir, "classification-report.json");
  if (!isRegularPrivateFile(awaitingEvidence) || !isRegularPrivateFile(reportEvidence)
    || sha256(fs.readFileSync(awaitingEvidence)) !== expectedAwaitingSha256
    || sha256(fs.readFileSync(reportEvidence)) !== reportSha256) return null;
  const results = JSON.parse(fs.readFileSync(files.results, "utf8"));
  const statuses = Object.values(results?.bySha || {}).map((entry) => entry?.status);
  if (statuses.filter((status) => status === "superseded").length !== 6
    || statuses.filter((status) => status === "failed_ci").length !== 2) return null;
  return { evidenceDir: record.evidenceDir, reconciledAt: record.reconciledAt };
}

function acquireStateLock(lockDir) {
  fs.mkdirSync(lockDir, { mode: 0o700 });
  writeJsonAtomic(path.join(lockDir, "owner.json"), {
    pid: process.pid,
    acquiredAt: new Date().toISOString(),
    purpose: "b1q_legacy_backlog_reconciliation",
  });
}

function releaseStateLock(lockDir) {
  fs.rmSync(lockDir, { recursive: true, force: true });
}

function completionStateFiles(files) {
  return {
    "BLOCKED.json": files.blocked,
    "awaiting.json": files.awaiting,
    "reconciliations.json": files.reconciliations,
    "results.json": files.results,
  };
}

function createCompletionBackup(backupDir, files, metadata) {
  if (!path.isAbsolute(backupDir)) throw new Error("Completion backup directory must be absolute");
  const parent = path.dirname(backupDir);
  if (!isPrivateOwnedDirectory(parent) || fs.lstatSync(backupDir, { throwIfNoEntry: false })) {
    throw new Error("Completion backup destination must be new under a private directory");
  }
  const tempDir = `${backupDir}.tmp-${process.pid}-${Date.now()}`;
  const stateFiles = completionStateFiles(files);
  const manifest = {
    version: 1,
    kind: "fluxfeed-b2f1-bootstrap-completion-backup",
    createdAt: new Date().toISOString(),
    ...metadata,
    stateFiles: {},
  };
  try {
    fs.mkdirSync(tempDir, { mode: 0o700 });
    for (const [name, sourcePath] of Object.entries(stateFiles)) {
      if (!isRegularPrivateFile(sourcePath)) {
        throw new Error(`Completion state file is not private and regular: ${name}`);
      }
      const content = fs.readFileSync(sourcePath);
      writeFileAtomic(path.join(tempDir, name), content);
      manifest.stateFiles[name] = { bytes: content.length, sha256: sha256(content) };
    }
    writeJsonAtomic(path.join(tempDir, "manifest.json"), manifest);
    fsyncDirectory(tempDir);
    fs.renameSync(tempDir, backupDir);
    fsyncDirectory(parent);
  } catch (error) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
  if (!isPrivateOwnedDirectory(backupDir)) throw new Error("Completion backup is not private");
  for (const [name, expected] of Object.entries(manifest.stateFiles)) {
    const backupPath = path.join(backupDir, name);
    if (!isRegularPrivateFile(backupPath) || sha256(fs.readFileSync(backupPath)) !== expected.sha256) {
      throw new Error(`Completion backup verification failed: ${name}`);
    }
  }
  return manifest;
}

function restoreCompletionBackup(backupDir, files, manifest) {
  if (!isPrivateOwnedDirectory(backupDir)
    || manifest?.kind !== "fluxfeed-b2f1-bootstrap-completion-backup") {
    throw new Error("Completion backup cannot be restored safely");
  }
  const stateFiles = completionStateFiles(files);
  const restoreOrder = ["BLOCKED.json", "results.json", "reconciliations.json", "awaiting.json"];
  for (const name of restoreOrder) {
    const sourcePath = path.join(backupDir, name);
    const destinationPath = stateFiles[name];
    const expected = manifest.stateFiles?.[name];
    if (!expected || !isRegularPrivateFile(sourcePath)) {
      throw new Error(`Completion backup is incomplete: ${name}`);
    }
    const content = fs.readFileSync(sourcePath);
    if (sha256(content) !== expected.sha256 || content.length !== expected.bytes) {
      throw new Error(`Completion backup hash mismatch: ${name}`);
    }
    writeFileAtomic(destinationPath, content);
  }
  fsyncDirectory(path.dirname(files.blocked));
}

function assertNoOperationalWork(files) {
  if (fs.existsSync(files.queue) || fs.existsSync(files.active) || fs.existsSync(files.runnerLock)) {
    throw new Error("Queue, active deploy or runner lock exists");
  }
  const runnerDirectories = fs.readdirSync(path.dirname(files.awaiting), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("runner-"));
  if (runnerDirectories.length > 0) throw new Error("Runner snapshot exists");
}

function isSameOrDescendant(parentPath, candidatePath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".."
    && !path.isAbsolute(relative));
}

function validateCompletionState(files, options) {
  const {
    expectedAwaitingSha256,
    expectedEvidenceSha256,
    installedMergeSha,
    legacyTargetSha,
  } = options;
  assertNoOperationalWork(files);
  for (const filePath of [files.awaiting, files.blocked, files.reconciliations, files.results]) {
    if (!isRegularPrivateFile(filePath)) throw new Error("Completion state file is not private");
  }

  const awaitingRaw = fs.readFileSync(files.awaiting);
  if (sha256(awaitingRaw) !== expectedAwaitingSha256) {
    throw new Error("Completion awaiting.json hash mismatch");
  }
  const awaiting = JSON.parse(awaitingRaw.toString("utf8"));
  if (!Array.isArray(awaiting) || awaiting.length !== 2) {
    throw new Error("Completion requires exactly the legacy target and installed merge SHA");
  }
  const awaitingShas = awaiting.map((entry) => entry?.sha);
  if (awaitingShas.some((sha) => !SHA_PATTERN.test(sha || ""))
    || new Set(awaitingShas).size !== 2
    || !awaitingShas.includes(legacyTargetSha) || !awaitingShas.includes(installedMergeSha)) {
    throw new Error("Unexpected SHA in completion awaiting.json");
  }
  const mergeEntry = awaiting.find((entry) => entry.sha === installedMergeSha);
  if (mergeEntry?.status !== "awaiting_ci"
    || awaiting.some((entry) => entry.ciStatus || entry.concludedAt || entry.workflowDeliveryId)) {
    throw new Error("workflow_run evidence exists before B2-F.1 completion");
  }

  const blocked = JSON.parse(fs.readFileSync(files.blocked, "utf8"));
  const reconciliations = JSON.parse(fs.readFileSync(files.reconciliations, "utf8"));
  const results = JSON.parse(fs.readFileSync(files.results, "utf8"));
  const record = reconciliations?.byTarget?.[legacyTargetSha];
  if (blocked?.sha !== legacyTargetSha || blocked?.status !== "target_pending_bootstrap"
    || blocked?.reason !== "b1q_target_pending_bootstrap" || !path.isAbsolute(blocked?.evidenceDir || "")
    || reconciliations?.version !== 1 || record?.targetSha !== legacyTargetSha
    || record?.status !== "target_pending_bootstrap" || record?.evidenceDir !== blocked.evidenceDir
    || record?.reportSha256 !== blocked.reportSha256 || results?.version !== 1
    || !results.bySha || typeof results.bySha !== "object" || Array.isArray(results.bySha)) {
    throw new Error("B1-Q3 block or reconciliation record diverged");
  }
  const terminalEntries = Object.values(results.bySha);
  if (terminalEntries.length !== 8
    || terminalEntries.filter((entry) => entry?.status === "superseded").length !== 6
    || terminalEntries.filter((entry) => entry?.status === "failed_ci").length !== 2
    || results.bySha[legacyTargetSha] || results.bySha[installedMergeSha]) {
    throw new Error("B1-Q3 terminal results diverged");
  }
  const evidence = fingerprintEvidenceTree(blocked.evidenceDir);
  if (evidence.sha256 !== expectedEvidenceSha256) {
    throw new Error("B1-Q3 evidence fingerprint mismatch");
  }
  return { awaiting, blocked, evidence, reconciliations, record, results };
}

function completeBootstrapReconciliation(options) {
  const {
    backupDir,
    ciSha,
    executionApproval,
    expectedAwaitingSha256,
    expectedEvidenceSha256,
    healthSha,
    installedMergeSha,
    legacyTargetSha,
    mainSha,
    stageHook = () => {},
    stateDir,
    vpsHeadSha,
  } = options;
  const validatedShas = [installedMergeSha, ciSha, executionApproval, healthSha, mainSha, vpsHeadSha];
  if (legacyTargetSha !== B2F_LEGACY_TARGET_SHA
    || !SHA_PATTERN.test(legacyTargetSha || "") || !SHA_PATTERN.test(installedMergeSha || "")
    || installedMergeSha === legacyTargetSha || validatedShas.some((sha) => sha !== installedMergeSha)
    || !HASH_PATTERN.test(expectedAwaitingSha256 || "")
    || !HASH_PATTERN.test(expectedEvidenceSha256 || "")
    || !path.isAbsolute(stateDir || "") || !path.isAbsolute(backupDir || "")) {
    throw new Error("B2-F.1 validation inputs do not authorize the exact installed merge SHA");
  }
  if (!isPrivateOwnedDirectory(stateDir)) throw new Error("State directory must be private and regular");
  const files = statePaths(stateDir);
  if (fs.existsSync(files.stateLock)) throw new Error("Deploy state lock already exists");

  const initialState = validateCompletionState(files, {
    expectedAwaitingSha256,
    expectedEvidenceSha256,
    installedMergeSha,
    legacyTargetSha,
  });
  if (isSameOrDescendant(stateDir, backupDir)
    || isSameOrDescendant(initialState.blocked.evidenceDir, backupDir)) {
    throw new Error("Completion backup must be outside state and evidence directories");
  }
  acquireStateLock(files.stateLock);
  let backupManifest;
  try {
    const state = validateCompletionState(files, {
      expectedAwaitingSha256,
      expectedEvidenceSha256,
      installedMergeSha,
      legacyTargetSha,
    });
    backupManifest = createCompletionBackup(backupDir, files, {
      evidenceDir: state.blocked.evidenceDir,
      evidenceSha256: state.evidence.sha256,
      installedMergeSha,
      legacyTargetSha,
      awaitingBeforeSha256: expectedAwaitingSha256,
    });
    stageHook("backup_created");

    const completedAt = new Date().toISOString();
    const results = state.results;
    results.bySha[legacyTargetSha] = {
      sha: legacyTargetSha,
      status: "already_installed",
      ok: true,
      reason: "legacy_target_bootstrap_verified",
      completedAt,
      installedMergeSha,
    };
    results.bySha[installedMergeSha] = {
      sha: installedMergeSha,
      status: "already_installed",
      ok: true,
      reason: "manual_bootstrap_verified_before_workflow_run_activation",
      completedAt,
      previousInstalledSha: legacyTargetSha,
    };
    writeJsonAtomic(files.results, results);
    stageHook("results_written");

    const reconciliations = state.reconciliations;
    reconciliations.byTarget[legacyTargetSha] = {
      ...state.record,
      status: "bootstrap_completed",
      bootstrapCompletedAt: completedAt,
      installedMergeSha,
      completionBackupDir: backupDir,
      evidenceSha256: state.evidence.sha256,
      awaitingCompletionSha256: expectedAwaitingSha256,
    };
    writeJsonAtomic(files.reconciliations, reconciliations);
    stageHook("reconciliation_written");

    writeJsonAtomic(files.awaiting, []);
    stageHook("awaiting_emptied");

    fs.rmSync(files.blocked);
    fsyncDirectory(stateDir);
    stageHook("block_removed");

    const finalResults = JSON.parse(fs.readFileSync(files.results, "utf8"));
    const finalReconciliations = JSON.parse(fs.readFileSync(files.reconciliations, "utf8"));
    const finalAwaiting = JSON.parse(fs.readFileSync(files.awaiting, "utf8"));
    const finalEvidence = fingerprintEvidenceTree(state.blocked.evidenceDir);
    assertNoOperationalWork(files);
    if (fs.existsSync(files.blocked) || finalAwaiting.length !== 0
      || finalResults.bySha?.[legacyTargetSha]?.status !== "already_installed"
      || finalResults.bySha?.[installedMergeSha]?.status !== "already_installed"
      || finalReconciliations.byTarget?.[legacyTargetSha]?.status !== "bootstrap_completed"
      || finalReconciliations.byTarget?.[legacyTargetSha]?.installedMergeSha !== installedMergeSha
      || finalEvidence.sha256 !== expectedEvidenceSha256) {
      throw new Error("B2-F.1 post-completion validation failed");
    }
    stageHook("postcheck_complete");
    return {
      awaitingCount: 0,
      backupDir,
      bootstrapCompletedAt: completedAt,
      evidenceSha256: finalEvidence.sha256,
      installedMergeSha,
      legacyTargetSha,
      status: "bootstrap_completed",
    };
  } catch (error) {
    if (backupManifest) {
      try {
        restoreCompletionBackup(backupDir, files, backupManifest);
      } catch (restoreError) {
        throw new Error(`${error.message}; BLOCK RESTORE FAILED: ${restoreError.message}`);
      }
    }
    throw error;
  } finally {
    releaseStateLock(files.stateLock);
  }
}

function createEvidenceDirectory(evidenceDir, awaitingRaw, reportRaw, manifest) {
  if (!path.isAbsolute(evidenceDir)) throw new Error("Evidence directory must be absolute");
  const parent = path.dirname(evidenceDir);
  const parentStats = fs.lstatSync(parent);
  if (!parentStats.isDirectory() || parentStats.isSymbolicLink()
    || (parentStats.mode & 0o077) !== 0
    || (typeof process.getuid === "function" && parentStats.uid !== process.getuid())
    || fs.lstatSync(evidenceDir, { throwIfNoEntry: false })) {
    throw new Error("Evidence destination is not a new regular directory");
  }
  const tempDir = `${evidenceDir}.tmp-${process.pid}-${Date.now()}`;
  try {
    fs.mkdirSync(tempDir, { mode: 0o700 });
    writeFileAtomic(path.join(tempDir, "awaiting.original.json"), awaitingRaw);
    writeFileAtomic(path.join(tempDir, "classification-report.json"), reportRaw);
    writeJsonAtomic(path.join(tempDir, "manifest.json"), manifest);
    const tempDescriptor = fs.openSync(tempDir, "r");
    try {
      fs.fsyncSync(tempDescriptor);
    } finally {
      fs.closeSync(tempDescriptor);
    }
    fs.renameSync(tempDir, evidenceDir);
    const parentDescriptor = fs.openSync(parent, "r");
    try {
      fs.fsyncSync(parentDescriptor);
    } finally {
      fs.closeSync(parentDescriptor);
    }
  } catch (error) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
}

function assertInitialState(files) {
  for (const [label, filePath] of Object.entries(files)) {
    if (["awaiting", "stateLock"].includes(label)) continue;
    assertAbsent(filePath, label);
  }
  const runnerDirectories = fs.readdirSync(path.dirname(files.awaiting), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("runner-"));
  if (runnerDirectories.length > 0) throw new Error("Runner snapshot exists");
}

function executeLegacyReconciliation(options) {
  const {
    evidenceDir,
    executionApproval,
    expectedAwaitingSha256,
    expectedReportSha256,
    installedSha,
    reportRaw,
    stateDir,
    targetSha,
  } = options;
  if (!path.isAbsolute(stateDir) || !HASH_PATTERN.test(expectedAwaitingSha256 || "")
    || !HASH_PATTERN.test(expectedReportSha256 || "") || !reportRaw) {
    throw new Error("Execution options are invalid");
  }
  const reportSha256 = sha256(reportRaw);
  if (reportSha256 !== expectedReportSha256) throw new Error("Classification report hash mismatch");
  const report = JSON.parse(reportRaw);
  validateClassificationReport(report, { installedSha, targetSha });
  if (executionApproval !== targetSha) {
    throw new Error("Execution approval does not match the target SHA");
  }
  if (report.awaitingFileSha256 !== expectedAwaitingSha256) {
    throw new Error("Classification report references a different awaiting.json");
  }

  const stateStats = fs.lstatSync(stateDir);
  if (!stateStats.isDirectory() || stateStats.isSymbolicLink() || (stateStats.mode & 0o077) !== 0
    || (typeof process.getuid === "function" && stateStats.uid !== process.getuid())) {
    throw new Error("State directory must be private and regular");
  }
  const files = statePaths(stateDir);
  if (fs.existsSync(files.stateLock)) throw new Error("Deploy state lock already exists");
  acquireStateLock(files.stateLock);
  try {
    const alreadyCompleted = completedReconciliation(files, {
      evidenceDir,
      expectedAwaitingSha256,
      reportSha256,
      targetSha,
    });
    if (alreadyCompleted) return { alreadyReconciled: true, ...alreadyCompleted, targetSha };

    assertInitialState(files);
    if (!isRegularPrivateFile(files.awaiting)) throw new Error("awaiting.json must be private and regular");
    const { raw: awaitingRaw, value: awaiting } = readJsonExact(files.awaiting);
    if (sha256(awaitingRaw) !== expectedAwaitingSha256) throw new Error("awaiting.json hash mismatch");
    const targetEntry = validateAwaitingEntries(awaiting, report);
    const reconciledAt = new Date().toISOString();
    const evidenceManifest = {
      version: 1,
      kind: "fluxfeed-b1q-evidence",
      createdAt: reconciledAt,
      targetSha,
      installedSha,
      awaitingSha256: expectedAwaitingSha256,
      classificationReportSha256: reportSha256,
      originalCount: awaiting.length,
    };
    createEvidenceDirectory(evidenceDir, awaitingRaw, reportRaw, evidenceManifest);

    writeJsonAtomic(files.blocked, {
      sha: targetSha,
      status: "target_pending_bootstrap",
      reason: "b1q_target_pending_bootstrap",
      blockedAt: reconciledAt,
      reportSha256,
      evidenceDir,
    });

    const results = { version: 1, bySha: {} };
    for (const record of report.records) {
      if (record.classification === "approved_target") continue;
      results.bySha[record.sha] = {
        sha: record.sha,
        status: record.classification === "superseded_green" ? "superseded" : "failed_ci",
        ok: false,
        reason: record.classification === "superseded_green"
          ? "newer_approved_target"
          : "ci_not_successful",
        conclusion: record.ci.conclusion,
        runId: record.ci.runId,
        reconciledAt,
        approvedTargetSha: targetSha,
      };
    }
    writeJsonAtomic(files.results, results);
    writeJsonAtomic(files.reconciliations, {
      version: 1,
      byTarget: {
        [targetSha]: {
          targetSha,
          installedSha,
          status: "target_pending_bootstrap",
          reconciledAt,
          reportSha256,
          awaitingBeforeSha256: expectedAwaitingSha256,
          evidenceDir,
          originalCount: awaiting.length,
          terminalCount: Object.keys(results.bySha).length,
        },
      },
    });
    writeJsonAtomic(files.awaiting, [targetEntry]);

    const finalAwaiting = JSON.parse(fs.readFileSync(files.awaiting, "utf8"));
    const finalBlocked = JSON.parse(fs.readFileSync(files.blocked, "utf8"));
    if (finalAwaiting.length !== 1 || finalAwaiting[0].sha !== targetSha
      || finalBlocked.reason !== "b1q_target_pending_bootstrap"
      || fs.existsSync(files.queue) || fs.existsSync(files.active)) {
      throw new Error("Post-reconciliation state validation failed");
    }
    return {
      alreadyReconciled: false,
      evidenceDir,
      originalCount: awaiting.length,
      reconciledAt,
      supersededCount: Object.values(results.bySha)
        .filter((entry) => entry.status === "superseded").length,
      failedCiCount: Object.values(results.bySha)
        .filter((entry) => entry.status === "failed_ci").length,
      targetSha,
    };
  } finally {
    releaseStateLock(files.stateLock);
  }
}

function decodeReportFromEnvironment() {
  const encoded = process.env.B1Q_CLASSIFICATION_REPORT_B64 || "";
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new Error("B1Q_CLASSIFICATION_REPORT_B64 is absent or invalid");
  }
  return Buffer.from(encoded, "base64").toString("utf8");
}

function main() {
  const mode = process.argv[2];
  if (mode === "--complete-bootstrap") {
    const result = completeBootstrapReconciliation({
      backupDir: process.env.B2F_COMPLETION_BACKUP_DIR || "",
      ciSha: process.env.B2F_CI_SHA || "",
      executionApproval: process.env.B2F_COMPLETION_APPROVED || "",
      expectedAwaitingSha256: process.env.B2F_EXPECTED_AWAITING_SHA256 || "",
      expectedEvidenceSha256: process.env.B2F_EXPECTED_EVIDENCE_SHA256 || "",
      healthSha: process.env.B2F_HEALTH_SHA || "",
      installedMergeSha: process.env.B2F_INSTALLED_MERGE_SHA || "",
      legacyTargetSha: process.env.B1Q_TARGET_SHA || "",
      mainSha: process.env.B2F_MAIN_SHA || "",
      stateDir: process.env.DEPLOY_STATE_DIR || "",
      vpsHeadSha: process.env.B2F_VPS_HEAD_SHA || "",
    });
    process.stdout.write(`B2F1_COMPLETION=${JSON.stringify(result)}\n`);
    process.stdout.write("B2F1_DEPLOY_AUTHORIZED=false\n");
    process.stdout.write("B2F1_WORKFLOW_RUN_AUTHORIZED=false\n");
    process.stdout.write("B2F1_COMPLETION_RESULT=PASS_BOOTSTRAP_COMPLETED_BLOCK_REMOVED_NO_DEPLOY\n");
    return;
  }
  const reportRaw = decodeReportFromEnvironment();
  const targetSha = process.env.B1Q_TARGET_SHA || "";
  const installedSha = process.env.B1Q_INSTALLED_SHA || "";
  const expectedReportSha256 = process.env.B1Q_EXPECTED_REPORT_SHA256 || "";
  const expectedAwaitingSha256 = process.env.B1Q_EXPECTED_AWAITING_SHA256 || "";
  if (sha256(reportRaw) !== expectedReportSha256) {
    throw new Error("Classification report hash mismatch");
  }
  const report = JSON.parse(reportRaw);
  validateClassificationReport(report, { installedSha, targetSha });

  if (mode === "--validate-report") {
    process.stdout.write("B1Q1_REPORT_RESULT=PASS_VALIDATED_NO_MUTATION\n");
    return;
  }
  if (mode !== "--execute") {
    throw new Error("Use --validate-report, --execute or --complete-bootstrap");
  }
  const result = executeLegacyReconciliation({
    evidenceDir: process.env.B1Q_EVIDENCE_DIR || "",
    executionApproval: process.env.B1Q_EXECUTION_APPROVED || "",
    expectedAwaitingSha256,
    expectedReportSha256,
    installedSha,
    reportRaw,
    stateDir: process.env.DEPLOY_STATE_DIR || "",
    targetSha,
  });
  process.stdout.write(`B1Q1_RECONCILIATION=${JSON.stringify(result)}\n`);
  process.stdout.write("B1Q1_DEPLOY_AUTHORIZED=false\n");
  process.stdout.write("B1Q1_RECONCILIATION_RESULT=PASS_TARGET_ONLY_BLOCKED_NO_DEPLOY\n");
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    const label = process.argv[2] === "--complete-bootstrap"
      ? "B2F1_COMPLETION_RESULT=HALT_BLOCK_RESTORED_OR_PRESERVED"
      : "B1Q1_RECONCILIATION_RESULT=HALT_PRESERVE_EVIDENCE";
    process.stderr.write(`${label}\n${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  completeBootstrapReconciliation,
  executeLegacyReconciliation,
  fingerprintEvidenceTree,
  sha256,
  validateAwaitingEntries,
  validateClassificationReport,
};
