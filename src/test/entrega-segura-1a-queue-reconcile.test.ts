import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const {
  completeBootstrapReconciliation,
  executeLegacyReconciliation,
  fingerprintEvidenceTree,
  sha256,
  validateClassificationReport,
} = require("../../scripts/reconcile-deploy-backlog.cjs");
const { approveWorkflowRun, registerPush } = require("../../scripts/deploy-queue.cjs");

const TARGET_SHA = "9453a1ca1fafb5bc9f6a52dc880f1f1d954f82aa";
const INSTALLED_SHA = "645f337bd285cb72f991a7b19cce6dff1c07ee1c";
const FUTURE_MERGE_SHA = "f1a2b3c4d5e6f7081928374655aabbccddeeff00";
const SHAS = [
  "ed0896786f276ee498208726d079cdccc6112151",
  "ad119b4081b15e74e584465c61c1554abe6c47aa",
  "6af1d7e6358c7f9576f22fc3985a55dacebded4c",
  "c134556c2ec12fb2818b7ee5d58b740dc6bbf074",
  "25eefef8216b461458bda16589c0fe60f001d874",
  "8f19fc282c18024c1a51165b6404808b13ee56d2",
  "eba5b13fbb57cf16745d503a214ac719e80bcc1c",
  "497485f932c3f67059d0b4edbb96cc7080b51863",
  TARGET_SHA,
];
const FAILED_POSITIONS = new Set([0, 2]);
const tempDirectories: string[] = [];

function temporaryDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "feedbot-b1q1-"));
  tempDirectories.push(directory);
  return directory;
}

function fixture() {
  const root = temporaryDirectory();
  const stateDir = path.join(root, "state");
  const evidenceDir = path.join(root, "evidence");
  fs.mkdirSync(stateDir, { mode: 0o700 });
  const awaiting = SHAS.map((sha, index) => ({
    sha,
    receivedAt: new Date(Date.UTC(2026, 6, 19, 21, index, 0)).toISOString(),
    deliveryId: `delivery-${index + 1}`,
  }));
  const awaitingRaw = `${JSON.stringify(awaiting, null, 2)}\n`;
  fs.writeFileSync(path.join(stateDir, "awaiting.json"), awaitingRaw, { mode: 0o600 });
  const awaitingSha256 = sha256(awaitingRaw);
  const report = {
    version: 1,
    kind: "fluxfeed-b1q0-github-classification",
    repository: "franciscocastro-svg/feed-bot-ai",
    targetSha: TARGET_SHA,
    installedSha: INSTALLED_SHA,
    currentMain: TARGET_SHA,
    inventorySha256: crypto.createHash("sha256").update("inventory").digest("hex"),
    awaitingFileSha256: awaitingSha256,
    mainRefResponseSha256: crypto.createHash("sha256").update("main-ref").digest("hex"),
    records: awaiting.map((entry, index) => {
      const isTarget = entry.sha === TARGET_SHA;
      const failed = FAILED_POSITIONS.has(index);
      return {
        ordinal: index + 1,
        sha: entry.sha,
        receivedAt: entry.receivedAt,
        classification: isTarget
          ? "approved_target"
          : failed ? "superseded_failed_ci" : "superseded_green",
        relationToTarget: isTarget ? "identical" : "ancestor",
        ci: {
          runId: 1000 + index,
          runAttempt: 1,
          status: "completed",
          conclusion: isTarget || !failed ? "success" : index === 0 ? "cancelled" : "failure",
          workflow: "CI",
          event: "push",
          branch: "main",
          headSha: entry.sha,
        },
        evidence: {
          commitResponseSha256: crypto.createHash("sha256").update(`commit-${entry.sha}`).digest("hex"),
          runsResponseSha256: crypto.createHash("sha256").update(`runs-${entry.sha}`).digest("hex"),
          compareResponseSha256: crypto.createHash("sha256").update(`compare-${entry.sha}`).digest("hex"),
        },
      };
    }),
    deployAuthorized: false,
    mutationAuthorized: false,
  };
  const reportRaw = JSON.stringify(report);
  return {
    awaiting,
    awaitingRaw,
    awaitingSha256,
    evidenceDir,
    report,
    reportRaw,
    reportSha256: sha256(reportRaw),
    root,
    stateDir,
  };
}

function completionFixture() {
  const context = fixture();
  executeLegacyReconciliation({
    evidenceDir: context.evidenceDir,
    executionApproval: TARGET_SHA,
    expectedAwaitingSha256: context.awaitingSha256,
    expectedReportSha256: context.reportSha256,
    installedSha: INSTALLED_SHA,
    reportRaw: context.reportRaw,
    stateDir: context.stateDir,
    targetSha: TARGET_SHA,
  });
  registerPush(context.stateDir, FUTURE_MERGE_SHA, { deliveryId: "future-merge-push" });
  const stateFiles = ["BLOCKED.json", "awaiting.json", "reconciliations.json", "results.json"];
  const originalState = Object.fromEntries(stateFiles.map((name) => [
    name,
    fs.readFileSync(path.join(context.stateDir, name), "utf8"),
  ]));
  const evidence = fingerprintEvidenceTree(context.evidenceDir);
  const options = {
    backupDir: path.join(context.root, "completion-backup"),
    ciSha: FUTURE_MERGE_SHA,
    executionApproval: FUTURE_MERGE_SHA,
    expectedAwaitingSha256: sha256(originalState["awaiting.json"]),
    expectedEvidenceSha256: evidence.sha256,
    healthSha: FUTURE_MERGE_SHA,
    installedMergeSha: FUTURE_MERGE_SHA,
    legacyTargetSha: TARGET_SHA,
    mainSha: FUTURE_MERGE_SHA,
    stateDir: context.stateDir,
    vpsHeadSha: FUTURE_MERGE_SHA,
  };
  return { ...context, evidence, options, originalState };
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("Gate B1-Q1 legacy queue reconciliation", () => {
  it("accepts exactly six green ancestors, two rejected ancestors and one green target", () => {
    const context = fixture();
    expect(validateClassificationReport(context.report, {
      installedSha: INSTALLED_SHA,
      targetSha: TARGET_SHA,
    })).toMatchObject({
      counts: {
        approved_target: 1,
        superseded_failed_ci: 2,
        superseded_green: 6,
      },
    });
  });

  it("preserves evidence, terminalizes eight ancestors and leaves only a blocked target", () => {
    const context = fixture();
    const result = executeLegacyReconciliation({
      evidenceDir: context.evidenceDir,
      executionApproval: TARGET_SHA,
      expectedAwaitingSha256: context.awaitingSha256,
      expectedReportSha256: context.reportSha256,
      installedSha: INSTALLED_SHA,
      reportRaw: context.reportRaw,
      stateDir: context.stateDir,
      targetSha: TARGET_SHA,
    });

    expect(result).toMatchObject({
      alreadyReconciled: false,
      failedCiCount: 2,
      originalCount: 9,
      supersededCount: 6,
      targetSha: TARGET_SHA,
    });
    expect(fs.readFileSync(path.join(context.evidenceDir, "awaiting.original.json"), "utf8"))
      .toBe(context.awaitingRaw);
    expect(fs.readFileSync(path.join(context.evidenceDir, "classification-report.json"), "utf8"))
      .toBe(context.reportRaw);
    const awaiting = JSON.parse(fs.readFileSync(path.join(context.stateDir, "awaiting.json"), "utf8"));
    expect(awaiting).toEqual([context.awaiting[8]]);
    const blocked = JSON.parse(fs.readFileSync(path.join(context.stateDir, "BLOCKED.json"), "utf8"));
    expect(blocked).toMatchObject({
      reason: "b1q_target_pending_bootstrap",
      sha: TARGET_SHA,
    });
    const results = JSON.parse(fs.readFileSync(path.join(context.stateDir, "results.json"), "utf8"));
    const resultEntries = Object.values(results.bySha) as Array<{ status: string }>;
    expect(resultEntries).toHaveLength(8);
    expect(resultEntries.filter((entry) => entry.status === "superseded"))
      .toHaveLength(6);
    expect(resultEntries.filter((entry) => entry.status === "failed_ci"))
      .toHaveLength(2);
    expect(fs.existsSync(path.join(context.stateDir, "queue.json"))).toBe(false);
    expect(fs.existsSync(path.join(context.stateDir, "active.json"))).toBe(false);
  });

  it("is idempotent for the same completed reconciliation", () => {
    const context = fixture();
    const options = {
      evidenceDir: context.evidenceDir,
      executionApproval: TARGET_SHA,
      expectedAwaitingSha256: context.awaitingSha256,
      expectedReportSha256: context.reportSha256,
      installedSha: INSTALLED_SHA,
      reportRaw: context.reportRaw,
      stateDir: context.stateDir,
      targetSha: TARGET_SHA,
    };
    executeLegacyReconciliation(options);
    expect(executeLegacyReconciliation(options)).toMatchObject({
      alreadyReconciled: true,
      evidenceDir: context.evidenceDir,
      targetSha: TARGET_SHA,
    });
  });

  it("requires explicit approval for the exact target before any mutation", () => {
    const context = fixture();
    expect(() => executeLegacyReconciliation({
      evidenceDir: context.evidenceDir,
      executionApproval: "",
      expectedAwaitingSha256: context.awaitingSha256,
      expectedReportSha256: context.reportSha256,
      installedSha: INSTALLED_SHA,
      reportRaw: context.reportRaw,
      stateDir: context.stateDir,
      targetSha: TARGET_SHA,
    })).toThrow("Execution approval does not match the target SHA");
    expect(fs.existsSync(context.evidenceDir)).toBe(false);
    expect(fs.readdirSync(context.stateDir)).toEqual(["awaiting.json"]);
  });

  it("rejects report drift before creating evidence or state", () => {
    const context = fixture();
    context.report.currentMain = SHAS[7];
    const driftedRaw = JSON.stringify(context.report);
    expect(() => executeLegacyReconciliation({
      evidenceDir: context.evidenceDir,
      executionApproval: TARGET_SHA,
      expectedAwaitingSha256: context.awaitingSha256,
      expectedReportSha256: sha256(driftedRaw),
      installedSha: INSTALLED_SHA,
      reportRaw: driftedRaw,
      stateDir: context.stateDir,
      targetSha: TARGET_SHA,
    })).toThrow("Classification report header is invalid");
    expect(fs.existsSync(context.evidenceDir)).toBe(false);
    expect(fs.readdirSync(context.stateDir)).toEqual(["awaiting.json"]);
  });

  it("rejects awaiting drift before preserving or rewriting state", () => {
    const context = fixture();
    const changed = JSON.parse(context.awaitingRaw);
    changed[0].receivedAt = "2026-07-21T00:00:00.000Z";
    fs.writeFileSync(path.join(context.stateDir, "awaiting.json"), `${JSON.stringify(changed, null, 2)}\n`);
    expect(() => executeLegacyReconciliation({
      evidenceDir: context.evidenceDir,
      executionApproval: TARGET_SHA,
      expectedAwaitingSha256: context.awaitingSha256,
      expectedReportSha256: context.reportSha256,
      installedSha: INSTALLED_SHA,
      reportRaw: context.reportRaw,
      stateDir: context.stateDir,
      targetSha: TARGET_SHA,
    })).toThrow("awaiting.json hash mismatch");
    expect(fs.existsSync(context.evidenceDir)).toBe(false);
    expect(fs.readdirSync(context.stateDir)).toEqual(["awaiting.json"]);
  });

  it("makes rejected SHAs terminal so repeated push and CI events cannot requeue them", () => {
    const context = fixture();
    executeLegacyReconciliation({
      evidenceDir: context.evidenceDir,
      executionApproval: TARGET_SHA,
      expectedAwaitingSha256: context.awaitingSha256,
      expectedReportSha256: context.reportSha256,
      installedSha: INSTALLED_SHA,
      reportRaw: context.reportRaw,
      stateDir: context.stateDir,
      targetSha: TARGET_SHA,
    });
    const result = registerPush(context.stateDir, SHAS[1], { deliveryId: "repeat-delivery" });
    expect(result).toMatchObject({
      alreadyKnown: true,
      runnerRequired: false,
      status: "superseded",
      terminal: true,
    });
    expect(approveWorkflowRun(context.stateDir, SHAS[1], { runId: 2001 }))
      .toMatchObject({
        ignored: true,
        runnerRequired: false,
        status: "superseded",
        terminal: true,
      });
    expect(approveWorkflowRun(context.stateDir, SHAS[0], { runId: 2002 }))
      .toMatchObject({
        ignored: true,
        runnerRequired: false,
        status: "failed_ci",
        terminal: true,
      });
    const awaiting = JSON.parse(fs.readFileSync(path.join(context.stateDir, "awaiting.json"), "utf8"));
    expect(awaiting).toEqual([context.awaiting[8]]);
    expect(fs.existsSync(path.join(context.stateDir, "queue.json"))).toBe(false);
  });
});

describe("Gate B2-F.1 post-bootstrap block closure", () => {
  it("records both installed SHAs, completes reconciliation and removes the block last", () => {
    const context = completionFixture();
    const stages: string[] = [];
    const result = completeBootstrapReconciliation({
      ...context.options,
      stageHook: (stage: string) => stages.push(stage),
    });

    expect(result).toMatchObject({
      awaitingCount: 0,
      installedMergeSha: FUTURE_MERGE_SHA,
      legacyTargetSha: TARGET_SHA,
      status: "bootstrap_completed",
    });
    expect(stages).toEqual([
      "backup_created",
      "results_written",
      "reconciliation_written",
      "awaiting_emptied",
      "block_removed",
      "postcheck_complete",
    ]);
    expect(fs.existsSync(path.join(context.stateDir, "BLOCKED.json"))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(context.stateDir, "awaiting.json"), "utf8")))
      .toEqual([]);
    const results = JSON.parse(fs.readFileSync(path.join(context.stateDir, "results.json"), "utf8"));
    expect(results.bySha[TARGET_SHA]).toMatchObject({ status: "already_installed", ok: true });
    expect(results.bySha[FUTURE_MERGE_SHA])
      .toMatchObject({ status: "already_installed", ok: true });
    const reconciliations = JSON.parse(
      fs.readFileSync(path.join(context.stateDir, "reconciliations.json"), "utf8"),
    );
    expect(reconciliations.byTarget[TARGET_SHA]).toMatchObject({
      status: "bootstrap_completed",
      installedMergeSha: FUTURE_MERGE_SHA,
    });
    expect(fingerprintEvidenceTree(context.evidenceDir)).toEqual(context.evidence);
    expect(fs.statSync(context.options.backupDir).mode & 0o077).toBe(0);
    for (const [name, content] of Object.entries(context.originalState)) {
      expect(fs.readFileSync(path.join(context.options.backupDir, name), "utf8")).toBe(content);
    }
    expect(fs.existsSync(path.join(context.stateDir, "queue.json"))).toBe(false);
    expect(fs.existsSync(path.join(context.stateDir, "active.json"))).toBe(false);
  });

  it("requires main, CI, VPS, health and approval to match the same full merge SHA", () => {
    const context = completionFixture();
    expect(() => completeBootstrapReconciliation({
      ...context.options,
      ciSha: TARGET_SHA,
    })).toThrow("validation inputs do not authorize the exact installed merge SHA");
    expect(fs.existsSync(context.options.backupDir)).toBe(false);
    for (const [name, content] of Object.entries(context.originalState)) {
      expect(fs.readFileSync(path.join(context.stateDir, name), "utf8")).toBe(content);
    }
  });

  it("halts while blocked when awaiting contains any unexpected SHA", () => {
    const context = completionFixture();
    const awaitingPath = path.join(context.stateDir, "awaiting.json");
    const awaiting = JSON.parse(fs.readFileSync(awaitingPath, "utf8"));
    awaiting.push({
      sha: "1111111111111111111111111111111111111111",
      status: "awaiting_ci",
      receivedAt: "2026-07-21T03:00:00.000Z",
      deliveryId: "unexpected-push",
    });
    fs.writeFileSync(awaitingPath, `${JSON.stringify(awaiting, null, 2)}\n`, { mode: 0o600 });
    expect(() => completeBootstrapReconciliation({
      ...context.options,
      expectedAwaitingSha256: sha256(fs.readFileSync(awaitingPath)),
    })).toThrow("exactly the legacy target and installed merge SHA");
    expect(fs.existsSync(path.join(context.stateDir, "BLOCKED.json"))).toBe(true);
    expect(fs.existsSync(context.options.backupDir)).toBe(false);
    expect(fingerprintEvidenceTree(context.evidenceDir)).toEqual(context.evidence);
  });

  it("refuses completion if workflow_run evidence appeared before gradual activation", () => {
    const context = completionFixture();
    const awaitingPath = path.join(context.stateDir, "awaiting.json");
    const awaiting = JSON.parse(fs.readFileSync(awaitingPath, "utf8"));
    const mergeEntry = awaiting.find((entry: { sha: string }) => entry.sha === FUTURE_MERGE_SHA);
    mergeEntry.ciStatus = "success";
    mergeEntry.concludedAt = "2026-07-21T03:00:00.000Z";
    fs.writeFileSync(awaitingPath, `${JSON.stringify(awaiting, null, 2)}\n`, { mode: 0o600 });
    expect(() => completeBootstrapReconciliation({
      ...context.options,
      expectedAwaitingSha256: sha256(fs.readFileSync(awaitingPath)),
    })).toThrow("workflow_run evidence exists before B2-F.1 completion");
    expect(fs.existsSync(path.join(context.stateDir, "BLOCKED.json"))).toBe(true);
    expect(fs.existsSync(context.options.backupDir)).toBe(false);
  });

  it("requires the private backup to stay outside state and evidence directories", () => {
    const context = completionFixture();
    expect(() => completeBootstrapReconciliation({
      ...context.options,
      backupDir: path.join(context.evidenceDir, "unsafe-completion-backup"),
    })).toThrow("backup must be outside state and evidence directories");
    expect(fs.existsSync(path.join(context.stateDir, "BLOCKED.json"))).toBe(true);
    expect(fs.existsSync(path.join(context.evidenceDir, "unsafe-completion-backup"))).toBe(false);
    expect(fingerprintEvidenceTree(context.evidenceDir)).toEqual(context.evidence);
  });

  it("rejects evidence drift before creating a backup or changing blocked state", () => {
    const context = completionFixture();
    const evidenceFile = path.join(context.evidenceDir, "manifest.json");
    fs.appendFileSync(evidenceFile, "\n");
    expect(() => completeBootstrapReconciliation(context.options))
      .toThrow("evidence fingerprint mismatch");
    expect(fs.existsSync(path.join(context.stateDir, "BLOCKED.json"))).toBe(true);
    expect(fs.existsSync(context.options.backupDir)).toBe(false);
  });

  it("restores the exact blocked state if a failure occurs after BLOCKED is removed", () => {
    const context = completionFixture();
    expect(() => completeBootstrapReconciliation({
      ...context.options,
      stageHook: (stage: string) => {
        if (stage === "block_removed") throw new Error("simulated post-remove failure");
      },
    })).toThrow("simulated post-remove failure");
    expect(fs.existsSync(path.join(context.stateDir, "BLOCKED.json"))).toBe(true);
    for (const [name, content] of Object.entries(context.originalState)) {
      expect(fs.readFileSync(path.join(context.stateDir, name), "utf8")).toBe(content);
    }
    expect(fingerprintEvidenceTree(context.evidenceDir)).toEqual(context.evidence);
    expect(fs.existsSync(context.options.backupDir)).toBe(true);
  });

  it("refuses completion until the future merge push is present in awaiting", () => {
    const context = fixture();
    executeLegacyReconciliation({
      evidenceDir: context.evidenceDir,
      executionApproval: TARGET_SHA,
      expectedAwaitingSha256: context.awaitingSha256,
      expectedReportSha256: context.reportSha256,
      installedSha: INSTALLED_SHA,
      reportRaw: context.reportRaw,
      stateDir: context.stateDir,
      targetSha: TARGET_SHA,
    });
    const awaitingPath = path.join(context.stateDir, "awaiting.json");
    const evidence = fingerprintEvidenceTree(context.evidenceDir);
    expect(() => completeBootstrapReconciliation({
      backupDir: path.join(context.root, "completion-backup"),
      ciSha: FUTURE_MERGE_SHA,
      executionApproval: FUTURE_MERGE_SHA,
      expectedAwaitingSha256: sha256(fs.readFileSync(awaitingPath)),
      expectedEvidenceSha256: evidence.sha256,
      healthSha: FUTURE_MERGE_SHA,
      installedMergeSha: FUTURE_MERGE_SHA,
      legacyTargetSha: TARGET_SHA,
      mainSha: FUTURE_MERGE_SHA,
      stateDir: context.stateDir,
      vpsHeadSha: FUTURE_MERGE_SHA,
    })).toThrow("exactly the legacy target and installed merge SHA");
    expect(fs.existsSync(path.join(context.stateDir, "BLOCKED.json"))).toBe(true);
  });
});
