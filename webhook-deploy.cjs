const crypto = require("crypto");
const { execFile } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const PORT = Number(process.env.WEBHOOK_PORT || 9000);
const APP_DIR = process.env.APP_DIR || __dirname;
const DEPLOY_SCRIPT = process.env.DEPLOY_SCRIPT || path.join(APP_DIR, "scripts", "deploy-vps.sh");
const DEPLOY_BRANCH = process.env.DEPLOY_BRANCH || "main";

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

loadEnvFile(path.join(APP_DIR, ".env"));

const SECRET = process.env.GITHUB_WEBHOOK_SECRET || "";

let deploying = false;

function send(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function verifySignature(rawBody, signature) {
  if (!SECRET) return false;
  if (!signature?.startsWith("sha256=")) return false;

  const expected = `sha256=${crypto
    .createHmac("sha256", SECRET)
    .update(rawBody)
    .digest("hex")}`;

  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

function runDeploy() {
  deploying = true;
  console.log(`[deploy] Starting ${DEPLOY_SCRIPT}`);

  const child = execFile(
    "bash",
    [DEPLOY_SCRIPT],
    {
      cwd: APP_DIR,
      env: {
        ...process.env,
        APP_DIR,
        DEPLOY_BRANCH,
      },
      maxBuffer: 1024 * 1024 * 20,
    },
    (error, stdout, stderr) => {
      if (stdout) console.log(stdout.trim());
      if (stderr) console.error(stderr.trim());
      if (error) {
        console.error(`[deploy] Failed: ${error.message}`);
      } else {
        console.log("[deploy] Finished successfully");
      }
      deploying = false;
    },
  );

  child.stdout?.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr?.on("data", (chunk) => process.stderr.write(chunk));
}

const server = http.createServer((req, res) => {
  if (req.method === "GET" && req.url === "/deploy-health") {
    return send(res, 200, { ok: true, service: "feedbot-deploy-webhook" });
  }

  if (req.method !== "POST" || req.url !== "/deploy") {
    return send(res, 404, { error: "not_found" });
  }

  const chunks = [];
  req.on("data", (chunk) => chunks.push(chunk));
  req.on("end", () => {
    const rawBody = Buffer.concat(chunks);
    const signature = req.headers["x-hub-signature-256"];

    if (!verifySignature(rawBody, signature)) {
      return send(res, 401, { error: "invalid_signature" });
    }

    let payload;
    try {
      payload = JSON.parse(rawBody.toString("utf8"));
    } catch {
      return send(res, 400, { error: "invalid_json" });
    }

    if (payload.ref !== `refs/heads/${DEPLOY_BRANCH}`) {
      return send(res, 202, { ok: true, ignored: true, ref: payload.ref });
    }

    if (deploying) {
      return send(res, 202, { ok: true, queued: false, reason: "deploy_in_progress" });
    }

    runDeploy();
    return send(res, 202, { ok: true, deploying: true });
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[deploy] Webhook listening on 127.0.0.1:${PORT}`);
});
