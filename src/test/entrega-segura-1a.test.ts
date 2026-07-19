import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHmac } from "node:crypto";
import { request, type Server } from "node:http";
import { createRequire } from "node:module";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const queue = require(resolve(process.cwd(), "scripts/deploy-queue.cjs"));
process.env.DEPLOY_WEBHOOK_NO_LISTEN = "1";
const webhook = require(resolve(process.cwd(), "webhook-deploy.cjs"));
delete process.env.DEPLOY_WEBHOOK_NO_LISTEN;
const childProcesses: ChildProcessWithoutNullStreams[] = [];
const webhookServers: Server[] = [];
const temporaryDirectories: string[] = [];
const sha1 = "1111111111111111111111111111111111111111";
const sha2 = "2222222222222222222222222222222222222222";

function temporaryStateDir() {
  const directory = mkdtempSync(join(tmpdir(), "feedbot-delivery-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

function read(relativePath: string) {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

function waitForOutput(child: ChildProcessWithoutNullStreams, expected: string) {
  return new Promise<string>((resolvePromise, rejectPromise) => {
    let output = "";
    const timeout = setTimeout(() => {
      rejectPromise(new Error(`Timed out waiting for child output: ${output}`));
    }, 5000);

    const finish = () => {
      clearTimeout(timeout);
      resolvePromise(output);
    };

    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
      if (output.includes(expected)) finish();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      rejectPromise(error);
    });
    child.once("exit", (code) => {
      if (!output.includes(expected)) {
        clearTimeout(timeout);
        rejectPromise(new Error(`Child exited with ${code}: ${output}`));
      }
    });
  });
}

async function postWebhook(server: Server, options: {
  deliveryId?: string;
  event: string;
  payload: object;
  secret: string;
  signature?: string;
}) {
  if (!server.listening) {
    await new Promise<void>((resolvePromise) => server.once("listening", resolvePromise));
  }
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Webhook has no TCP address");
  const rawBody = Buffer.from(JSON.stringify(options.payload));
  const signature = options.signature ?? `sha256=${createHmac("sha256", options.secret)
    .update(rawBody)
    .digest("hex")}`;

  return new Promise<{ body: Record<string, unknown>; status: number }>((resolvePromise, rejectPromise) => {
    const headers: Record<string, string | number> = {
      "content-length": rawBody.length,
      "content-type": "application/json",
      "x-github-event": options.event,
      "x-hub-signature-256": signature,
    };
    if (options.deliveryId !== undefined) headers["x-github-delivery"] = options.deliveryId;

    const req = request({
      host: "127.0.0.1",
      port: address.port,
      method: "POST",
      path: "/deploy",
      headers,
    }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        resolvePromise({ body, status: res.statusCode || 0 });
      });
    });
    req.once("error", rejectPromise);
    req.end(rawBody);
  });
}

afterEach(async () => {
  for (const child of childProcesses.splice(0)) {
    child.kill("SIGTERM");
  }
  await Promise.all(webhookServers.splice(0).map((server) => new Promise<void>((resolvePromise) => {
    server.close(() => resolvePromise());
  })));
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("Entrega Segura 1A", () => {
  it("starts the listener when PM2 loads the entrypoint through require", async () => {
    const childEnvironment: NodeJS.ProcessEnv = {
      ...process.env,
      APP_DIR: process.cwd(),
      DEPLOY_STATE_DIR: temporaryStateDir(),
      WEBHOOK_PORT: "0",
    };
    delete childEnvironment.DEPLOY_WEBHOOK_NO_LISTEN;

    const child = spawn(process.execPath, [
      "-e",
      `
        const http = require("node:http");
        http.createServer = () => ({
          once() {
            return this;
          },
          listen(_port, _host, callback) {
            callback();
            return this;
          },
        });
        require(${JSON.stringify(resolve(process.cwd(), "webhook-deploy.cjs"))});
      `,
    ], {
      cwd: process.cwd(),
      env: childEnvironment,
    });
    childProcesses.push(child);

    await expect(waitForOutput(child, "Webhook listening on 127.0.0.1:0"))
      .resolves.toContain("Webhook listening on 127.0.0.1:0");
    expect([null, 0]).toContain(child.exitCode);
    expect(webhook.shouldStartWebhook({})).toBe(true);
    expect(webhook.shouldStartWebhook({ DEPLOY_WEBHOOK_NO_LISTEN: "1" })).toBe(false);
  });

  it("separates push registration from the successful main CI gate", () => {
    expect(webhook.classifyWebhook("push", {
      ref: "refs/heads/main",
      after: sha1,
    }, "main", "CI")).toEqual({ kind: "push", sha: sha1 });

    expect(webhook.classifyWebhook("workflow_run", {
      action: "completed",
      workflow_run: {
        id: 123,
        name: "CI",
        event: "push",
        head_branch: "main",
        head_sha: sha1,
        status: "completed",
        conclusion: "success",
      },
    }, "main", "CI")).toEqual({ kind: "ci_success", sha: sha1, runId: 123 });

    expect(webhook.classifyWebhook("workflow_run", {
      action: "completed",
      workflow_run: {
        name: "CI",
        event: "push",
        head_branch: "main",
        head_sha: sha1,
        status: "completed",
        conclusion: "failure",
      },
    }, "main", "CI")).toMatchObject({
      kind: "ci_rejected",
      reason: "ci_not_successful",
      sha: sha1,
    });
  });

  it("rejects invalid signatures, deliveries and repositories before state mutation", async () => {
    const stateDir = temporaryStateDir();
    rmSync(stateDir, { recursive: true, force: true });
    const secret = "test-only-webhook-secret";
    const server = webhook.createWebhookServer({
      appDir: process.cwd(),
      port: 0,
      repository: "franciscocastro-svg/feed-bot-ai",
      secret,
      stateDir,
    });
    webhookServers.push(server);
    const payload = {
      after: sha1,
      ref: "refs/heads/main",
      repository: { full_name: "franciscocastro-svg/feed-bot-ai" },
    };

    const invalidSignature = await postWebhook(server, {
      deliveryId: "delivery-invalid-signature",
      event: "push",
      payload,
      secret,
      signature: "sha256=0000000000000000000000000000000000000000000000000000000000000000",
    });
    expect(invalidSignature).toMatchObject({ status: 401, body: { error: "invalid_signature" } });
    expect(existsSync(stateDir)).toBe(false);

    const missingDelivery = await postWebhook(server, { event: "push", payload, secret });
    expect(missingDelivery).toMatchObject({ status: 400, body: { error: "invalid_delivery_id" } });
    expect(existsSync(stateDir)).toBe(false);

    const wrongRepository = await postWebhook(server, {
      deliveryId: "delivery-wrong-repository",
      event: "push",
      payload: { ...payload, repository: { full_name: "attacker/example" } },
      secret,
    });
    expect(wrongRepository).toMatchObject({ status: 403, body: { error: "unexpected_repository" } });
    expect(existsSync(stateDir)).toBe(false);
  }, 15_000);

  it("deduplicates HTTP deliveries and rejects conflicting reuse of an ID", async () => {
    const stateDir = temporaryStateDir();
    const secret = "test-only-webhook-secret";
    const server = webhook.createWebhookServer({
      appDir: process.cwd(),
      port: 0,
      repository: "franciscocastro-svg/feed-bot-ai",
      secret,
      stateDir,
    });
    webhookServers.push(server);
    const basePayload = {
      ref: "refs/heads/main",
      repository: { full_name: "franciscocastro-svg/feed-bot-ai" },
    };

    const first = await postWebhook(server, {
      deliveryId: "delivery-push-1",
      event: "push",
      payload: { ...basePayload, after: sha1 },
      secret,
    });
    expect(first).toMatchObject({
      status: 202,
      body: { accepted: true, duplicateDelivery: false, duplicateSha: false, status: "awaiting_ci" },
    });

    const repeated = await postWebhook(server, {
      deliveryId: "delivery-push-1",
      event: "push",
      payload: { ...basePayload, after: sha1 },
      secret,
    });
    expect(repeated).toMatchObject({
      status: 202,
      body: { accepted: true, duplicateDelivery: true, duplicateSha: true },
    });

    const sameShaNewDelivery = await postWebhook(server, {
      deliveryId: "delivery-push-2",
      event: "push",
      payload: { ...basePayload, after: sha1 },
      secret,
    });
    expect(sameShaNewDelivery).toMatchObject({
      status: 202,
      body: { duplicateDelivery: false, duplicateSha: true },
    });

    const conflict = await postWebhook(server, {
      deliveryId: "delivery-push-1",
      event: "push",
      payload: { ...basePayload, after: sha2 },
      secret,
    });
    expect(conflict).toMatchObject({ status: 409, body: { error: "conflicting_delivery" } });
    expect(queue.getQueueStatus(stateDir)).toMatchObject({ awaitingCi: 1, queued: 0 });
  }, 15_000);

  it("reconciles durable queued work when the webhook listener restarts", async () => {
    const stateDir = temporaryStateDir();
    writeFileSync(join(stateDir, "queue.json"), JSON.stringify([{ sha: sha1, status: "queued" }]));
    let runnerStarts = 0;
    const server = webhook.createWebhookServer({
      appDir: process.cwd(),
      port: 0,
      secret: "test-only-webhook-secret",
      stateDir,
      runnerStarter: () => {
        runnerStarts += 1;
        return 12345;
      },
    });
    webhookServers.push(server);
    if (!server.listening) {
      await new Promise<void>((resolvePromise) => server.once("listening", resolvePromise));
    }

    expect(runnerStarts).toBe(1);
  });

  it("retries transient startup reconciliation failures with backoff", async () => {
    const stateDir = temporaryStateDir();
    writeFileSync(join(stateDir, "queue.json"), JSON.stringify([{ sha: sha1, status: "queued" }]));
    let runnerStarts = 0;
    const server = webhook.createWebhookServer({
      appDir: process.cwd(),
      port: 0,
      secret: "test-only-webhook-secret",
      startupMaxAttempts: 3,
      startupRetryBaseMs: 1,
      stateDir,
      runnerStarter: () => {
        runnerStarts += 1;
        if (runnerStarts < 3) throw new Error("transient runner launch failure");
        return 12345;
      },
    });
    webhookServers.push(server);

    await new Promise<void>((resolvePromise, rejectPromise) => {
      const deadline = Date.now() + 2000;
      const poll = () => {
        if (runnerStarts === 3) return resolvePromise();
        if (Date.now() >= deadline) return rejectPromise(new Error("startup retry did not converge"));
        setTimeout(poll, 5);
      };
      poll();
    });

    expect(runnerStarts).toBe(3);
  });

  it("replays a processing delivery reservation after a crash", () => {
    const stateDir = temporaryStateDir();
    writeFileSync(join(stateDir, "deliveries.json"), JSON.stringify({
      version: 1,
      entries: {
        "delivery-processing-push": {
          deliveryId: "delivery-processing-push",
          event: "push",
          sha: sha1,
          firstSeenAt: "2026-07-18T00:00:00.000Z",
          lastSeenAt: "2026-07-18T00:00:00.000Z",
          status: "processing",
        },
      },
    }));

    expect(queue.reconcileProcessingDeliveries(stateDir)).toEqual({ reconciled: 1 });
    expect(queue.getQueueStatus(stateDir)).toMatchObject({ awaitingCi: 1, queued: 0 });
    const deliveries = JSON.parse(readFileSync(join(stateDir, "deliveries.json"), "utf8"));
    expect(deliveries.entries["delivery-processing-push"].status).toBe("awaiting_ci");
  });

  it("persists approved SHAs in FIFO order while another deploy can be active", () => {
    const stateDir = temporaryStateDir();

    queue.registerPush(stateDir, sha1);
    queue.registerPush(stateDir, sha2);
    expect(queue.approveWorkflowRun(stateDir, sha1)).toMatchObject({ queued: true, position: 1 });
    expect(queue.approveWorkflowRun(stateDir, sha2)).toMatchObject({ queued: true, position: 2 });

    const first = queue.claimNext(stateDir);
    expect(first.sha).toBe(sha1);
    expect(queue.getQueueStatus(stateDir)).toMatchObject({ activeSha: sha1, queued: 1 });

    queue.completeActive(stateDir, sha1, { ok: true });
    const second = queue.claimNext(stateDir);
    expect(second.sha).toBe(sha2);
  });

  it("deduplicates deliveries and never promotes an unregistered push", () => {
    const stateDir = temporaryStateDir();

    expect(queue.approveWorkflowRun(stateDir, sha1)).toMatchObject({
      ignored: true,
      status: "push_not_registered",
      sha: sha1,
    });

    queue.registerPush(stateDir, sha1);
    queue.registerPush(stateDir, sha1);
    expect(queue.approveWorkflowRun(stateDir, sha1)).toMatchObject({ queued: true, position: 1 });
    expect(queue.approveWorkflowRun(stateDir, sha1)).toMatchObject({
      queued: true,
      status: "already_queued",
    });
    expect(queue.getQueueStatus(stateDir).queued).toBe(1);
  });

  it("preserves push order when CI runs finish out of order", () => {
    const stateDir = temporaryStateDir();

    queue.registerPush(stateDir, sha1);
    queue.registerPush(stateDir, sha2);
    expect(queue.approveWorkflowRun(stateDir, sha2)).toMatchObject({
      queued: true,
      status: "ci_passed_waiting_fifo",
      runnerRequired: false,
    });
    expect(queue.getQueueStatus(stateDir)).toMatchObject({ awaitingCi: 2, queued: 0 });

    expect(queue.rejectWorkflowRun(stateDir, sha1, { conclusion: "failure" })).toMatchObject({
      status: "failed_ci",
      runnerRequired: true,
    });
    expect(queue.claimNext(stateDir).sha).toBe(sha2);
  });

  it("preserves workflow completion received before its push and wakes a waiting runner", () => {
    const stateDir = temporaryStateDir();
    const early = queue.approveWorkflowRun(stateDir, sha1, {
      deliveryId: "delivery-workflow-before-push",
      runId: 701,
    });
    expect(early).toMatchObject({
      accepted: true,
      runnerRequired: false,
      status: "workflow_before_push",
    });
    expect(queue.getQueueStatus(stateDir)).toMatchObject({ awaitingCi: 0, queued: 0 });

    mkdirSync(join(stateDir, ".runner-lock"));
    writeFileSync(join(stateDir, ".runner-lock", "owner.json"), JSON.stringify({ pid: process.pid }));
    const push = queue.registerPush(stateDir, sha1, {
      deliveryId: "delivery-push-after-workflow",
    });
    expect(push).toMatchObject({ runnerRequired: true, status: "queued" });
    expect(queue.getQueueStatus(stateDir)).toMatchObject({ awaitingCi: 0, queued: 1 });
  });

  it("pins deployment to the approved SHA and includes health rollback gates", () => {
    const deploy = read("scripts/deploy-vps.sh");
    const health = read("scripts/health-check-vps.sh");
    const hook = read("webhook-deploy.cjs");
    const runner = read("scripts/deploy-queue.cjs");
    const ecosystem = read("ecosystem.config.cjs");

    expect(deploy).toContain("git checkout --detach \"$sha\"");
    expect(deploy).toContain("git merge-base --is-ancestor");
    expect(deploy).toContain("rollback_release \"$PREVIOUS_SHA\"");
    expect(deploy).toContain("git merge-base --is-ancestor \"$PREVIOUS_SHA\" \"$TARGET_SHA\"");
    expect(deploy).not.toContain("git pull");
    expect(hook).toContain("workflow_run");
    expect(hook).not.toContain("queued: false");
    expect(hook).toContain("DEPLOY_REPOSITORY");
    expect(runner).toContain("RUNNER_LOCK_TIMEOUT_MS");

    for (const name of ["feedbot-cuts", "feedbot-media", "feedbot-webhook"]) {
      expect(health).toContain(name);
      expect(ecosystem).toContain(name);
    }
  });

  it("fails closed on corrupted state and does not recover a terminal SHA", () => {
    const corruptedState = temporaryStateDir();
    writeFileSync(join(corruptedState, "awaiting.json"), "not-json");
    expect(() => queue.registerPush(corruptedState, sha1, {
      deliveryId: "delivery-corrupt-state",
    })).toThrow();

    const recoveredState = temporaryStateDir();
    writeFileSync(join(recoveredState, "active.json"), JSON.stringify({
      sha: sha1,
      startedAt: new Date().toISOString(),
    }));
    writeFileSync(join(recoveredState, "results.json"), JSON.stringify({
      version: 1,
      bySha: {
        [sha1]: { sha: sha1, status: "succeeded", ok: true },
      },
    }));
    queue.recoverInterruptedDeploy(recoveredState);
    expect(queue.getQueueStatus(recoveredState)).toMatchObject({ activeSha: null, queued: 0 });

    const corruptedJournal = temporaryStateDir();
    writeFileSync(join(corruptedJournal, "deliveries.json"), JSON.stringify({
      version: 1,
      entries: "invalid",
    }));
    expect(() => queue.getQueueStatus(corruptedJournal)).toThrow(/journal/i);

    const overlappingState = temporaryStateDir();
    writeFileSync(join(overlappingState, "awaiting.json"), JSON.stringify([{ sha: sha1 }]));
    writeFileSync(join(overlappingState, "queue.json"), JSON.stringify([{ sha: sha1 }]));
    expect(() => queue.getQueueStatus(overlappingState)).toThrow(/multiple operational states/i);

    const successfulBlock = temporaryStateDir();
    writeFileSync(join(successfulBlock, "BLOCKED.json"), JSON.stringify({ sha: sha1, ok: true }));
    expect(() => queue.getQueueStatus(successfulBlock)).toThrow(/cannot be successful/i);
  });

  it("recognizes terminal 1A.1 results and blocks recovery while an orphan deploy is alive", () => {
    const legacyState = temporaryStateDir();
    writeFileSync(join(legacyState, "last-result.json"), JSON.stringify({
      sha: sha1,
      ok: true,
      completedAt: new Date().toISOString(),
    }));
    expect(queue.registerPush(legacyState, sha1)).toMatchObject({
      status: "succeeded",
      terminal: true,
    });
    expect(queue.getQueueStatus(legacyState)).toMatchObject({ awaitingCi: 0, queued: 0 });

    const orphanState = temporaryStateDir();
    writeFileSync(join(orphanState, "active.json"), JSON.stringify({
      sha: sha2,
      deployPid: process.pid,
      runnerPid: 999999,
      startedAt: new Date().toISOString(),
    }));
    queue.recoverInterruptedDeploy(orphanState);
    expect(queue.getQueueStatus(orphanState)).toMatchObject({
      activeSha: sha2,
      blocked: true,
      queued: 0,
    });

    const deadChildState = temporaryStateDir();
    writeFileSync(join(deadChildState, "active.json"), JSON.stringify({
      sha: sha1,
      deployPid: 2_000_000_000,
      deployProcessGroupId: 2_000_000_000,
      startedAt: new Date().toISOString(),
    }));
    queue.recoverInterruptedDeploy(deadChildState);
    expect(queue.getQueueStatus(deadChildState)).toMatchObject({
      activeSha: sha1,
      blocked: true,
      blockedReason: "deploy_process_exit_unobserved",
      queued: 0,
    });
  });

  it("requires completeActive to match the active deployment", () => {
    const stateDir = temporaryStateDir();
    queue.registerPush(stateDir, sha1);
    queue.approveWorkflowRun(stateDir, sha1);
    queue.claimNext(stateDir);

    expect(() => queue.completeActive(stateDir, sha2, { ok: true, status: "succeeded" }))
      .toThrow(/inactive deploy SHA/i);
    expect(queue.getQueueStatus(stateDir).activeSha).toBe(sha1);
  });

  it.each([
    [10, 0, "rolled_back", false, 0],
    [20, 2, "failed_preflight", true, 1],
    [21, 2, "rollback_failed", true, 1],
    [22, 2, "interrupted", true, 1],
  ])("maps deploy exit %i to persistent queue state", async (
    deployExit,
    runnerExit,
    status,
    blocked,
    queued,
  ) => {
    const stateDir = temporaryStateDir();
    const deployScript = join(stateDir, "fake-deploy.sh");
    writeFileSync(deployScript, `#!/usr/bin/env bash\nexit ${deployExit}\n`);
    queue.registerPush(stateDir, sha1);
    queue.approveWorkflowRun(stateDir, sha1);

    const previous = {
      APP_DIR: process.env.APP_DIR,
      DEPLOY_SCRIPT: process.env.DEPLOY_SCRIPT,
      DEPLOY_STATE_DIR: process.env.DEPLOY_STATE_DIR,
    };
    process.env.APP_DIR = stateDir;
    process.env.DEPLOY_SCRIPT = deployScript;
    process.env.DEPLOY_STATE_DIR = stateDir;
    let result: number;
    try {
      result = await queue.runQueue();
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }

    expect(result).toBe(runnerExit);
    expect(JSON.parse(readFileSync(join(stateDir, "last-result.json"), "utf8")))
      .toMatchObject({ exitCode: deployExit, sha: sha1, status });
    expect(queue.getQueueStatus(stateDir)).toMatchObject({ blocked, queued });
  });

  it("persists BLOCKED before a non-terminal result can be recorded", () => {
    const source = read("scripts/deploy-queue.cjs");
    const blockedFunction = source.slice(
      source.indexOf("function completeBlockedActive"),
      source.indexOf("function assertStateEntries"),
    );
    expect(blockedFunction.indexOf("writeJsonAtomic(files.blocked"))
      .toBeLessThan(blockedFunction.indexOf("writeResult(files"));
    expect(source).toContain("fs.fsyncSync(tempFd)");
  });
});
