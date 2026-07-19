import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

type Pm2App = {
  name: string;
  pid: number;
  pm2_env: {
    status: string;
    pm_uptime: number;
    pm_exec_path?: string;
    pm_cwd?: string;
    watch?: boolean;
  };
};

const temporaryDirectories: string[] = [];
const expectedSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const previousSha = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const describeDeliveryHarness = process.env.DELIVERY_HARNESS === "1" ? describe : describe.skip;

function temporaryDirectory(prefix: string) {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function writeCommand(directory: string, name: string, body: string) {
  const commandPath = join(directory, name);
  writeFileSync(commandPath, `#!/usr/bin/env bash\nset -eu\n${body}\n`, { mode: 0o700 });
  chmodSync(commandPath, 0o700);
}

function runProcess(command: string, args: string[], options: {
  cwd: string;
  env: NodeJS.ProcessEnv;
}) {
  return new Promise<{ status: number | null; stderr: string; stdout: string }>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", rejectPromise);
    child.once("close", (status) => resolvePromise({ status, stderr, stdout }));
  });
}

function expectedPm2Apps(appDir: string): Pm2App[] {
  const startedAt = Date.now() - 60_000;
  return [
    {
      name: "feedbot-cuts",
      pid: 101,
      pm2_env: {
        status: "online",
        pm_uptime: startedAt,
        pm_exec_path: join(appDir, "worker/index.js"),
        pm_cwd: appDir,
        watch: false,
      },
    },
    {
      name: "feedbot-media",
      pid: 102,
      pm2_env: {
        status: "online",
        pm_uptime: startedAt,
        pm_exec_path: join(appDir, "worker/index.js"),
        pm_cwd: appDir,
        watch: false,
      },
    },
    {
      name: "feedbot-webhook",
      pid: 103,
      pm2_env: {
        status: "online",
        pm_uptime: startedAt,
        pm_exec_path: join(appDir, "webhook-deploy.cjs"),
        pm_cwd: appDir,
        watch: false,
      },
    },
  ];
}

async function runHealth(mutate: (apps: Pm2App[]) => Pm2App[] = (apps) => apps) {
  const root = temporaryDirectory("feedbot-health-test-");
  const appDir = join(root, "app");
  const stateDir = join(root, "state");
  const binDir = join(root, "bin");
  const fixturePath = join(root, "pm2.json");
  mkdirSync(appDir);
  mkdirSync(binDir);
  writeFileSync(fixturePath, JSON.stringify(mutate(expectedPm2Apps(appDir))));

  writeCommand(binDir, "git", `printf '%s\\n' "$FAKE_GIT_SHA"`);
  writeCommand(binDir, "curl", "exit 0");
  writeCommand(binDir, "nginx", '[ "${1:-}" = "-t" ]');
  writeCommand(binDir, "pm2", '[ "${1:-}" = "jlist" ]\n/bin/cat "$FAKE_PM2_JSON"');

  return runProcess("bash", [resolve(process.cwd(), "scripts/health-check-vps.sh"), expectedSha], {
    cwd: appDir,
    env: {
      ...process.env,
      APP_DIR: appDir,
      DEPLOY_STATE_DIR: stateDir,
      FAKE_GIT_SHA: expectedSha,
      FAKE_PM2_JSON: fixturePath,
      HEALTH_INTERVAL_SECONDS: "0",
      HEALTH_RETRIES: "1",
      PM2_MIN_UPTIME_MS: "1000",
      PATH: `${binDir}:${dirname(process.execPath)}:/usr/local/bin:/usr/bin:/bin`,
    },
  });
}

async function runDeploy(options: {
  checkoutFailure?: boolean;
  currentSha?: string;
  dirty?: boolean;
  healthMode?: "always_fail" | "success" | "target_fail";
  targetSha?: string;
}) {
  const root = temporaryDirectory("feedbot-deploy-test-");
  const appDir = join(root, "app");
  const binDir = join(root, "bin");
  const stateDir = join(root, "state");
  const commandLog = join(root, "commands.log");
  const currentShaFile = join(root, "current-sha");
  const healthSource = join(root, "health.sh");
  const targetSha = options.targetSha || expectedSha;
  mkdirSync(appDir);
  mkdirSync(binDir);
  writeFileSync(commandLog, "");
  writeFileSync(currentShaFile, `${options.currentSha || previousSha}\n`);

  writeCommand(binDir, "git", [
    'printf \'git:%s\\n\' "$*" >> "$FAKE_COMMAND_LOG"',
    'case "${1:-}" in',
    '  diff) [ "$FAKE_GIT_DIRTY" != "1" ] ;;',
    '  rev-parse) /bin/cat "$FAKE_CURRENT_SHA_FILE" ;;',
    '  checkout)',
    '    [ "$FAKE_CHECKOUT_FAILURE" != "1" ] || exit 1',
    '    printf \'%s\\n\' "${3:-}" > "$FAKE_CURRENT_SHA_FILE"',
    '    ;;',
    '  fetch|cat-file|merge-base) exit 0 ;;',
    '  *) exit 0 ;;',
    'esac',
  ].join("\n"));
  writeCommand(binDir, "npm", 'printf \'npm:%s\\n\' "$*" >> "$FAKE_COMMAND_LOG"');
  writeCommand(binDir, "node", 'printf \'node:%s\\n\' "$*" >> "$FAKE_COMMAND_LOG"');
  writeCommand(binDir, "pm2", 'printf \'pm2:%s\\n\' "$*" >> "$FAKE_COMMAND_LOG"');
  writeCommand(binDir, "nginx", 'printf \'nginx:%s\\n\' "$*" >> "$FAKE_COMMAND_LOG"');
  writeFileSync(healthSource, `#!/usr/bin/env bash
set -eu
printf 'health:%s\\n' "$1" >> "$FAKE_COMMAND_LOG"
case "$FAKE_HEALTH_MODE" in
  always_fail) exit 1 ;;
  target_fail) [ "$1" != "$FAKE_TARGET_SHA" ] ;;
  *) exit 0 ;;
esac
`, { mode: 0o700 });
  chmodSync(healthSource, 0o700);

  const result = await runProcess("bash", [resolve(process.cwd(), "scripts/deploy-vps.sh"), targetSha], {
    cwd: appDir,
    env: {
      ...process.env,
      APP_DIR: appDir,
      DEPLOY_HEALTH_SCRIPT_SOURCE: healthSource,
      DEPLOY_STATE_DIR: stateDir,
      FAKE_COMMAND_LOG: commandLog,
      FAKE_CHECKOUT_FAILURE: options.checkoutFailure ? "1" : "0",
      FAKE_CURRENT_SHA_FILE: currentShaFile,
      FAKE_GIT_DIRTY: options.dirty ? "1" : "0",
      FAKE_HEALTH_MODE: options.healthMode || "success",
      FAKE_TARGET_SHA: targetSha,
      PATH: `${binDir}:/usr/local/bin:/usr/bin:/bin`,
    },
  });

  return {
    ...result,
    commandLog: readFileSync(commandLog, "utf8"),
    stateExists: existsSync(stateDir),
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describeDeliveryHarness("Entrega Segura 1A.2 - health PM2 hermetico", () => {
  it("aceita exatamente os tres processos esperados", async () => {
    const result = await runHealth();
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  }, 30_000);

  it.each([
    ["processo ausente", (apps: Pm2App[]) => apps.slice(0, 2)],
    ["processo duplicado", (apps: Pm2App[]) => [apps[0]!, apps[0]!, apps[2]!]],
    ["processo extra", (apps: Pm2App[]) => [...apps, { ...apps[0], name: "unexpected" }]],
    ["processo offline", (apps: Pm2App[]) => apps.map((app, index) => index === 0
      ? { ...app, pm2_env: { ...app.pm2_env, status: "stopped" } }
      : app)],
    ["PID invalido", (apps: Pm2App[]) => apps.map((app, index) => index === 0
      ? { ...app, pid: 0 }
      : app)],
    ["uptime invalido", (apps: Pm2App[]) => apps.map((app, index) => index === 0
      ? { ...app, pm2_env: { ...app.pm2_env, pm_uptime: Date.now() + 60_000 } }
      : app)],
    ["script ausente", (apps: Pm2App[]) => {
      delete apps[0]!.pm2_env.pm_exec_path;
      return apps;
    }],
    ["script divergente", (apps: Pm2App[]) => apps.map((app, index) => index === 0
      ? { ...app, pm2_env: { ...app.pm2_env, pm_exec_path: "/tmp/wrong-worker.js" } }
      : app)],
    ["cwd ausente", (apps: Pm2App[]) => {
      delete apps[0]!.pm2_env.pm_cwd;
      return apps;
    }],
    ["cwd divergente", (apps: Pm2App[]) => apps.map((app, index) => index === 0
      ? { ...app, pm2_env: { ...app.pm2_env, pm_cwd: "/tmp/wrong-cwd" } }
      : app)],
    ["watch ausente", (apps: Pm2App[]) => {
      delete apps[0]!.pm2_env.watch;
      return apps;
    }],
    ["watch ativo", (apps: Pm2App[]) => apps.map((app, index) => index === 0
      ? { ...app, pm2_env: { ...app.pm2_env, watch: true } }
      : app)],
  ])("rejeita %s", async (_label, mutate) => {
    const result = await runHealth(mutate);
    expect(result.status, `${result.stdout}\n${result.stderr}`).not.toBe(0);
  }, 30_000);
});

describeDeliveryHarness("Entrega Segura 1A.2 - contrato do deploy", () => {
  it("falha fechado sem esconder alteracoes e sem recarregar o Nginx", () => {
    const deploy = readFileSync(resolve(process.cwd(), "scripts/deploy-vps.sh"), "utf8");
    const health = readFileSync(resolve(process.cwd(), "scripts/health-check-vps.sh"), "utf8");

    expect(deploy).toContain("assert_clean_tracked_worktree");
    expect(deploy).toContain("SAME_SHA_HEALTHY");
    expect(deploy).not.toMatch(/git\s+stash/);
    expect(deploy).not.toMatch(/git\s+pull/);
    expect(deploy).not.toMatch(/systemctl\s+reload\s+nginx/);
    expect(health).toContain("apps.length !== expectedNames.length");
    expect(health).toContain("PM2 process must appear exactly once");
    expect(health).toContain("PM2 process has invalid PID");
    expect(health).toContain("PM2 process below minimum uptime");
  });

  it("interrompe worktree rastreada suja antes da primeira mutacao", async () => {
    const result = await runDeploy({ dirty: true });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(20);
    expect(result.stdout).toContain("DEPLOY_RESULT=FAILED_PREFLIGHT");
    expect(result.stateExists).toBe(false);
    expect(result.commandLog).not.toMatch(/git:fetch|git:checkout|npm:|pm2:|health:/);
  }, 30_000);

  it("usa health-only quando o target ja e o HEAD", async () => {
    const result = await runDeploy({ currentSha: expectedSha, targetSha: expectedSha });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.stdout).toContain("DEPLOY_RESULT=SAME_SHA_HEALTHY");
    expect(result.commandLog).toContain(`health:${expectedSha}`);
    expect(result.commandLog).not.toMatch(/git:checkout|npm:|pm2:/);
  }, 30_000);

  it("faz checkout e ativa exatamente o SHA aprovado", async () => {
    const result = await runDeploy({ targetSha: expectedSha });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    expect(result.commandLog).toContain(`git:checkout --detach ${expectedSha}`);
    expect(result.commandLog).toContain("npm:ci");
    expect(result.commandLog).toContain("pm2:startOrReload ecosystem.config.cjs --update-env");
    expect(result.commandLog).not.toContain("systemctl:");
  }, 30_000);

  it("trata falha antes do checkout como preflight sem rollback ou restart", async () => {
    const result = await runDeploy({ checkoutFailure: true, targetSha: expectedSha });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(20);
    expect(result.stdout).toContain("DEPLOY_RESULT=FAILED_PREFLIGHT");
    expect(result.stdout).toContain("target_checkout_not_completed");
    expect(result.commandLog).toContain(`git:checkout --detach ${expectedSha}`);
    expect(result.commandLog).not.toContain(`git:checkout --detach ${previousSha}`);
    expect(result.commandLog).not.toMatch(/npm:|pm2:|health:/);
  }, 30_000);

  it.each([
    ["rollback saudavel", "target_fail", 10, "DEPLOY_RESULT=ROLLED_BACK"],
    ["rollback malsucedido", "always_fail", 21, "DEPLOY_RESULT=ROLLBACK_FAILED"],
  ] as const)("mapeia %s para o resultado explicito", async (_label, healthMode, exitCode, marker) => {
    const result = await runDeploy({ healthMode, targetSha: expectedSha });

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(exitCode);
    expect(result.stdout).toContain(marker);
    expect(result.commandLog).toContain(`git:checkout --detach ${expectedSha}`);
    expect(result.commandLog).toContain(`git:checkout --detach ${previousSha}`);
  }, 20_000);
});
