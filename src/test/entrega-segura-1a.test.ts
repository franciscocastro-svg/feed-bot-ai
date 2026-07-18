import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const queue = require(resolve(process.cwd(), "scripts/deploy-queue.cjs"));
process.env.DEPLOY_WEBHOOK_NO_LISTEN = "1";
const webhook = require(resolve(process.cwd(), "webhook-deploy.cjs"));
delete process.env.DEPLOY_WEBHOOK_NO_LISTEN;
const childProcesses: ChildProcessWithoutNullStreams[] = [];
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

afterEach(() => {
  for (const child of childProcesses.splice(0)) {
    child.kill("SIGTERM");
  }
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

    expect(queue.approveWorkflowRun(stateDir, sha1)).toEqual({
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
      status: "approved_waiting_for_prior_ci",
      runnerRequired: false,
    });
    expect(queue.getQueueStatus(stateDir)).toMatchObject({ awaitingCi: 2, queued: 0 });

    expect(queue.rejectWorkflowRun(stateDir, sha1, { conclusion: "failure" })).toMatchObject({
      status: "ci_not_successful",
      runnerRequired: true,
    });
    expect(queue.claimNext(stateDir).sha).toBe(sha2);
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
    expect(runner).toContain("RUNNER_LOCK_TIMEOUT_MS");

    for (const name of ["feedbot-cuts", "feedbot-media", "feedbot-webhook"]) {
      expect(health).toContain(name);
      expect(ecosystem).toContain(name);
    }
  });
});
