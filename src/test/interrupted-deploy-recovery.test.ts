import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  PENDING_BLOCK_REASON,
  buildInterruptedQueuePlan,
  completeInterruptedQueueRecovery,
  executeInterruptedQueueReconciliation,
  fingerprintBackup,
} = require("../../scripts/reconcile-interrupted-deploy.cjs");

const ACTIVE_SHA = "1111111111111111111111111111111111111111";
const OLD_SHA_1 = "2222222222222222222222222222222222222222";
const OLD_SHA_2 = "3333333333333333333333333333333333333333";
const TARGET_SHA = "4444444444444444444444444444444444444444";
const LEGACY_RESULT_SHA = "5555555555555555555555555555555555555555";
const temporaryDirectories: string[] = [];

function temporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "fluxfeed-interrupted-deploy-"));
  temporaryDirectories.push(directory);
  return directory;
}

function writePrivateJson(filePath: string, value: unknown) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

function queueEntry(sha: string, index: number) {
  return {
    sha,
    status: "queued",
    receivedAt: new Date(Date.UTC(2026, 7, 1, 20, index, 0)).toISOString(),
    approvedAt: new Date(Date.UTC(2026, 7, 1, 20, index + 1, 0)).toISOString(),
    runId: 3000 + index,
  };
}

function fixture() {
  const root = temporaryDirectory();
  const repoDir = path.join(root, "repo");
  const stateDir = path.join(root, "state");
  const evidenceParent = path.join(root, "evidence");
  fs.mkdirSync(repoDir, { mode: 0o700 });
  fs.mkdirSync(stateDir, { mode: 0o700 });
  fs.mkdirSync(evidenceParent, { mode: 0o700 });

  const active = {
    sha: ACTIVE_SHA,
    status: "deploying",
    runnerPid: 2_000_000_001,
    deployPid: 2_000_000_002,
    deployProcessGroupId: 2_000_000_002,
    startedAt: "2026-07-29T03:13:34.210Z",
  };
  const blocked = {
    sha: ACTIVE_SHA,
    status: "interrupted",
    reason: "deploy_process_exit_unobserved",
    deployPid: active.deployPid,
    blockedAt: "2026-07-29T03:15:07.949Z",
  };
  const queue = [queueEntry(OLD_SHA_1, 1), queueEntry(OLD_SHA_2, 2), queueEntry(TARGET_SHA, 3)];
  writePrivateJson(path.join(stateDir, "active.json"), active);
  writePrivateJson(path.join(stateDir, "BLOCKED.json"), blocked);
  writePrivateJson(path.join(stateDir, "awaiting.json"), []);
  writePrivateJson(path.join(stateDir, "queue.json"), queue);
  writePrivateJson(path.join(stateDir, "results.json"), {
    version: 1,
    bySha: {
      [LEGACY_RESULT_SHA]: {
        sha: LEGACY_RESULT_SHA,
        status: "succeeded",
        ok: true,
      },
    },
  });
  writePrivateJson(path.join(stateDir, "reconciliations.json"), {
    version: 1,
    byTarget: {
      [LEGACY_RESULT_SHA]: { targetSha: LEGACY_RESULT_SHA, status: "completed" },
    },
  });
  writePrivateJson(path.join(stateDir, "last-result.json"), {
    sha: LEGACY_RESULT_SHA,
    status: "succeeded",
    ok: true,
  });

  const inspectInterruptedRepository = () => ({
    headSha: ACTIVE_SHA,
    mainSha: TARGET_SHA,
    nonAncestors: [],
  });
  const common = {
    inspectRepository: inspectInterruptedRepository,
    isPidAlive: () => false,
    isProcessGroupAlive: () => false,
    repoDir,
    stateDir,
    targetSha: TARGET_SHA,
  };
  return {
    active,
    blocked,
    common,
    evidenceDir: path.join(evidenceParent, "recovery-evidence"),
    evidenceParent,
    queue,
    repoDir,
    root,
    stateDir,
  };
}

function stateSnapshot(stateDir: string) {
  return Object.fromEntries([
    "BLOCKED.json",
    "active.json",
    "queue.json",
    "awaiting.json",
    "results.json",
    "reconciliations.json",
    "last-result.json",
  ].map((name) => [name, fs.readFileSync(path.join(stateDir, name), "utf8")]));
}

function executeFixture(
  context: ReturnType<typeof fixture>,
  stageHook: (stage: string) => void = () => {},
) {
  const inspected = buildInterruptedQueuePlan(context.common);
  const result = executeInterruptedQueueReconciliation({
    ...context.common,
    evidenceDir: context.evidenceDir,
    executionApproval: TARGET_SHA,
    expectedPlanSha256: inspected.planSha256,
    stageHook,
  });
  return { inspected, result };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("interrupted VPS deploy queue recovery", () => {
  it("builds a read-only plan for one interrupted deploy and the final approved target", () => {
    const context = fixture();
    const result = buildInterruptedQueuePlan(context.common);

    expect(result.plan).toMatchObject({
      installedSha: ACTIVE_SHA,
      kind: "fluxfeed-interrupted-deploy-recovery-plan",
      queueCount: 3,
      supersededQueueCount: 2,
      targetSha: TARGET_SHA,
      totalSupersededCount: 3,
    });
    expect(result.planSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(fs.existsSync(context.evidenceDir)).toBe(false);
    expect(fs.existsSync(path.join(context.stateDir, ".state-lock"))).toBe(false);
  });

  it("halts if an interrupted runner or deploy process is still alive", () => {
    const context = fixture();
    expect(() => buildInterruptedQueuePlan({
      ...context.common,
      isPidAlive: (pid: number) => pid === context.active.deployPid,
    })).toThrow("still alive");
    expect(fs.existsSync(context.evidenceDir)).toBe(false);
  });

  it("requires the target to be the final queue item and every SHA to be its ancestor", () => {
    const context = fixture();
    const queuePath = path.join(context.stateDir, "queue.json");
    writePrivateJson(queuePath, [context.queue[2], context.queue[0], context.queue[1]]);
    expect(() => buildInterruptedQueuePlan(context.common)).toThrow("final and unique");

    writePrivateJson(queuePath, context.queue);
    expect(() => buildInterruptedQueuePlan({
      ...context.common,
      inspectRepository: () => ({
        headSha: ACTIVE_SHA,
        mainSha: TARGET_SHA,
        nonAncestors: [OLD_SHA_2],
      }),
    })).toThrow("ancestry diverged");
  });

  it("preserves evidence, terminalizes older SHAs and remains blocked on the target", () => {
    const context = fixture();
    const { inspected, result } = executeFixture(context);

    expect(result).toMatchObject({
      installedSha: ACTIVE_SHA,
      queueCount: 1,
      status: "target_pending_manual_media_deploy",
      supersededCount: 3,
      targetSha: TARGET_SHA,
    });
    expect(result.evidenceSha256).toBe(fingerprintBackup(context.evidenceDir).sha256);
    const blocked = JSON.parse(fs.readFileSync(path.join(context.stateDir, "BLOCKED.json"), "utf8"));
    const queue = JSON.parse(fs.readFileSync(path.join(context.stateDir, "queue.json"), "utf8"));
    const results = JSON.parse(fs.readFileSync(path.join(context.stateDir, "results.json"), "utf8"));
    const reconciliations = JSON.parse(
      fs.readFileSync(path.join(context.stateDir, "reconciliations.json"), "utf8"),
    );
    expect(blocked).toMatchObject({
      sha: TARGET_SHA,
      reason: PENDING_BLOCK_REASON,
      recoveryPlanSha256: inspected.planSha256,
      evidenceSha256: result.evidenceSha256,
    });
    expect(queue).toEqual([context.queue.at(-1)]);
    expect(fs.existsSync(path.join(context.stateDir, "active.json"))).toBe(false);
    for (const sha of [ACTIVE_SHA, OLD_SHA_1, OLD_SHA_2]) {
      expect(results.bySha[sha]).toMatchObject({ status: "superseded", approvedTargetSha: TARGET_SHA });
    }
    expect(results.bySha[TARGET_SHA]).toBeUndefined();
    expect(reconciliations.byTarget[TARGET_SHA]).toMatchObject({
      status: "target_pending_manual_media_deploy",
      supersededCount: 3,
    });
  });

  it("requires exact approval and plan hash before creating evidence", () => {
    const context = fixture();
    const inspected = buildInterruptedQueuePlan(context.common);
    expect(() => executeInterruptedQueueReconciliation({
      ...context.common,
      evidenceDir: context.evidenceDir,
      executionApproval: ACTIVE_SHA,
      expectedPlanSha256: inspected.planSha256,
    })).toThrow("approval");
    expect(fs.existsSync(context.evidenceDir)).toBe(false);
  });

  it("detects queue drift between inspection and execution", () => {
    const context = fixture();
    const inspected = buildInterruptedQueuePlan(context.common);
    const queuePath = path.join(context.stateDir, "queue.json");
    const queue = JSON.parse(fs.readFileSync(queuePath, "utf8"));
    queue[0].approvedAt = "2026-08-01T23:00:00.000Z";
    writePrivateJson(queuePath, queue);
    expect(() => executeInterruptedQueueReconciliation({
      ...context.common,
      evidenceDir: context.evidenceDir,
      executionApproval: TARGET_SHA,
      expectedPlanSha256: inspected.planSha256,
    })).toThrow("plan hash mismatch");
    expect(fs.existsSync(context.evidenceDir)).toBe(false);
  });

  it("restores the exact original state if reconciliation fails after active removal", () => {
    const context = fixture();
    const before = stateSnapshot(context.stateDir);
    expect(() => executeFixture(context, (stage: string) => {
      if (stage === "active_removed") throw new Error("simulated reconciliation failure");
    })).toThrow("simulated reconciliation failure");
    for (const [name, content] of Object.entries(before)) {
      expect(fs.readFileSync(path.join(context.stateDir, name), "utf8")).toBe(content);
    }
    expect(fs.existsSync(context.evidenceDir)).toBe(true);
    expect(fs.existsSync(path.join(context.stateDir, ".state-lock"))).toBe(false);
  });

  it("completes only after main, CI, health and VPS all match the target", () => {
    const context = fixture();
    const { result: reconciliation } = executeFixture(context);
    const backupDir = path.join(context.evidenceParent, "completion-backup");
    const completion = {
      backupDir,
      ciSha: TARGET_SHA,
      executionApproval: TARGET_SHA,
      expectedEvidenceSha256: reconciliation.evidenceSha256,
      healthSha: TARGET_SHA,
      inspectRepository: () => ({ headSha: TARGET_SHA, mainSha: TARGET_SHA, nonAncestors: [] }),
      mainSha: TARGET_SHA,
      repoDir: context.repoDir,
      stateDir: context.stateDir,
      targetSha: TARGET_SHA,
      vpsHeadSha: TARGET_SHA,
    };

    expect(() => completeInterruptedQueueRecovery({ ...completion, healthSha: ACTIVE_SHA }))
      .toThrow("matching target");
    expect(fs.existsSync(backupDir)).toBe(false);

    const result = completeInterruptedQueueRecovery(completion);
    expect(result).toMatchObject({
      deployedScope: "feedbot-media",
      queueCount: 0,
      status: "completed",
      targetSha: TARGET_SHA,
    });
    expect(fs.existsSync(path.join(context.stateDir, "BLOCKED.json"))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(context.stateDir, "queue.json"), "utf8"))).toEqual([]);
    const results = JSON.parse(fs.readFileSync(path.join(context.stateDir, "results.json"), "utf8"));
    const lastResult = JSON.parse(fs.readFileSync(path.join(context.stateDir, "last-result.json"), "utf8"));
    expect(results.bySha[TARGET_SHA]).toMatchObject({ status: "succeeded", mediaOnly: true });
    expect(lastResult).toMatchObject({ sha: TARGET_SHA, status: "succeeded" });
    expect(fs.statSync(backupDir).mode & 0o077).toBe(0);
  });

  it("restores the pending block if completion fails after removing it", () => {
    const context = fixture();
    const { result: reconciliation } = executeFixture(context);
    const before = stateSnapshotAfterReconciliation(context.stateDir);
    const backupDir = path.join(context.evidenceParent, "failed-completion-backup");
    expect(() => completeInterruptedQueueRecovery({
      backupDir,
      ciSha: TARGET_SHA,
      executionApproval: TARGET_SHA,
      expectedEvidenceSha256: reconciliation.evidenceSha256,
      healthSha: TARGET_SHA,
      inspectRepository: () => ({ headSha: TARGET_SHA, mainSha: TARGET_SHA, nonAncestors: [] }),
      mainSha: TARGET_SHA,
      repoDir: context.repoDir,
      stageHook: (stage: string) => {
        if (stage === "block_removed") throw new Error("simulated completion failure");
      },
      stateDir: context.stateDir,
      targetSha: TARGET_SHA,
      vpsHeadSha: TARGET_SHA,
    })).toThrow("simulated completion failure");
    for (const [name, content] of Object.entries(before)) {
      expect(fs.readFileSync(path.join(context.stateDir, name), "utf8")).toBe(content);
    }
    expect(fs.existsSync(path.join(context.stateDir, "BLOCKED.json"))).toBe(true);
  });
});

function stateSnapshotAfterReconciliation(stateDir: string) {
  return Object.fromEntries([
    "BLOCKED.json",
    "queue.json",
    "awaiting.json",
    "results.json",
    "reconciliations.json",
    "last-result.json",
  ].map((name) => [name, fs.readFileSync(path.join(stateDir, name), "utf8")]));
}
