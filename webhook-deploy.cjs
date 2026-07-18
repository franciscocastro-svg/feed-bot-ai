const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const {
  approveWorkflowRun,
  ensureRunner,
  getQueueStatus,
  rejectWorkflowRun,
  registerPush,
} = require("./scripts/deploy-queue.cjs");

const SHA_PATTERN = /^[0-9a-f]{40}$/;
const MAX_BODY_BYTES = Number(process.env.WEBHOOK_MAX_BODY_BYTES || 1024 * 1024);

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function send(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function verifySignature(rawBody, signature, secret) {
  if (!secret || !signature?.startsWith("sha256=")) return false;

  const expected = `sha256=${crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex")}`;

  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

function classifyWebhook(eventName, payload, branch, workflowName) {
  if (eventName === "push") {
    if (payload.ref !== `refs/heads/${branch}`) {
      return { kind: "ignored", reason: "different_branch", ref: payload.ref };
    }

    const sha = String(payload.after || "").toLowerCase();
    if (!SHA_PATTERN.test(sha)) {
      return { kind: "invalid", reason: "invalid_push_sha" };
    }

    return { kind: "push", sha };
  }

  if (eventName === "workflow_run") {
    const run = payload.workflow_run || {};
    if (payload.action !== "completed" || run.status !== "completed") {
      return { kind: "ignored", reason: "workflow_not_completed" };
    }
    if (run.name !== workflowName) {
      return { kind: "ignored", reason: "different_workflow", workflow: run.name };
    }
    if (run.event !== "push" || run.head_branch !== branch) {
      return { kind: "ignored", reason: "workflow_not_main_push" };
    }
    const sha = String(run.head_sha || "").toLowerCase();
    if (!SHA_PATTERN.test(sha)) {
      return { kind: "invalid", reason: "invalid_workflow_sha" };
    }

    if (run.conclusion !== "success") {
      return {
        kind: "ci_rejected",
        reason: "ci_not_successful",
        conclusion: run.conclusion,
        sha,
        runId: run.id,
      };
    }

    return { kind: "ci_success", sha, runId: run.id };
  }

  return { kind: "ignored", reason: "unsupported_event", event: eventName };
}

function createWebhookServer(options = {}) {
  const appDir = options.appDir || process.env.APP_DIR || __dirname;
  loadEnvFile(path.join(appDir, ".env"));

  const port = Number(options.port || process.env.WEBHOOK_PORT || 9000);
  const branch = options.branch || process.env.DEPLOY_BRANCH || "main";
  const workflowName = options.workflowName || process.env.DEPLOY_WORKFLOW || "CI";
  const secret = options.secret || process.env.GITHUB_WEBHOOK_SECRET || "";
  const stateDir = options.stateDir || process.env.DEPLOY_STATE_DIR || path.join(appDir, ".deploy-state");
  const queueScript = options.queueScript || path.join(appDir, "scripts", "deploy-queue.cjs");

  return http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/deploy-health") {
      try {
        return send(res, 200, {
          ok: true,
          service: "feedbot-deploy-webhook",
          ...getQueueStatus(stateDir),
        });
      } catch (error) {
        console.error(`[deploy] Health state failed: ${error.message}`);
        return send(res, 503, { ok: false, error: "deploy_state_unavailable" });
      }
    }

    if (req.method !== "POST" || req.url !== "/deploy") {
      return send(res, 404, { error: "not_found" });
    }

    const chunks = [];
    let size = 0;
    let tooLarge = false;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });

    req.on("error", (error) => {
      console.error(`[deploy] Request failed: ${error.message}`);
      if (!res.headersSent) send(res, 400, { error: "request_failed" });
    });

    req.on("end", () => {
      if (tooLarge) return send(res, 413, { error: "payload_too_large" });

      const rawBody = Buffer.concat(chunks);
      const signature = req.headers["x-hub-signature-256"];
      if (!verifySignature(rawBody, signature, secret)) {
        return send(res, 401, { error: "invalid_signature" });
      }

      let payload;
      try {
        payload = JSON.parse(rawBody.toString("utf8"));
      } catch {
        return send(res, 400, { error: "invalid_json" });
      }

      const eventName = String(req.headers["x-github-event"] || "");
      const event = classifyWebhook(eventName, payload, branch, workflowName);

      if (event.kind === "invalid") {
        return send(res, 400, { error: event.reason });
      }

      if (event.kind === "ignored") {
        return send(res, 202, { ok: true, ignored: true, ...event });
      }

      try {
        if (event.kind === "push") {
          const result = registerPush(stateDir, event.sha, {
            deliveryId: req.headers["x-github-delivery"] || null,
          });
          return send(res, 202, { ok: true, status: "awaiting_ci", ...result });
        }

        const metadata = {
          runId: event.runId,
          deliveryId: req.headers["x-github-delivery"] || null,
        };
        const result = event.kind === "ci_success"
          ? approveWorkflowRun(stateDir, event.sha, metadata)
          : rejectWorkflowRun(stateDir, event.sha, {
            ...metadata,
            conclusion: event.conclusion,
          });

        if (result.runnerRequired) {
          ensureRunner({ appDir, stateDir, queueScript });
        }

        return send(res, 202, { ok: true, ...result });
      } catch (error) {
        console.error(`[deploy] Queue operation failed: ${error.stack || error.message}`);
        return send(res, 500, { error: "queue_operation_failed" });
      }
    });
  }).listen(port, "127.0.0.1", () => {
    console.log(`[deploy] Webhook listening on 127.0.0.1:${port}`);
  });
}

if (require.main === module) {
  createWebhookServer();
}

module.exports = {
  classifyWebhook,
  createWebhookServer,
  verifySignature,
};
