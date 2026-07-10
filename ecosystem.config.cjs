const path = require("node:path");

const cwd = __dirname;
const shared = {
  cwd,
  interpreter: "node",
  autorestart: true,
  min_uptime: "10s",
  max_restarts: 10,
  restart_delay: 3000,
  time: true,
  kill_timeout: 10000,
};

module.exports = {
  apps: [
    {
      ...shared,
      name: "feedbot-cuts",
      script: path.join(cwd, "worker", "index.js"),
      max_memory_restart: "1500M",
      env: { WORKER_ID: "vps-cuts", WORKER_QUEUES: "cuts" },
    },
    {
      ...shared,
      name: "feedbot-media",
      script: path.join(cwd, "worker", "index.js"),
      max_memory_restart: "900M",
      env: { WORKER_ID: "vps-media", WORKER_QUEUES: "media" },
    },
    {
      ...shared,
      name: "feedbot-webhook",
      script: path.join(cwd, "webhook-deploy.cjs"),
      max_memory_restart: "300M",
    },
  ],
};
