import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

const MAX_TEXT_FILE_BYTES = 1024 * 1024;

const directRules = [
  {
    id: "private-key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  },
  {
    id: "github-token",
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g,
  },
  {
    id: "aws-access-key",
    pattern: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g,
  },
  {
    id: "google-api-key",
    pattern: /\bAIza[A-Za-z0-9_-]{30,}\b/g,
  },
  {
    id: "stripe-secret-key",
    pattern: /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b/g,
  },
  {
    id: "openai-secret-key",
    pattern: /\bsk-(?:proj-)?[A-Za-z0-9_-]{30,}\b/g,
  },
];

const sensitiveAssignment = /^\s*(?:export\s+)?(SUPABASE_SERVICE_ROLE_KEY|STRIPE_SECRET_KEY|PAYMENTS_LIVE_WEBHOOK_SECRET|PAYMENTS_SANDBOX_WEBHOOK_SECRET|META_APP_SECRET|INSTAGRAM_APP_SECRET|META_CONVERSIONS_ACCESS_TOKEN|OPENAI_API_KEY|GEMINI_API_KEY|GROQ_API_KEY|XAI_API_KEY|LOVABLE_API_KEY|RESEND_API_KEY|GITHUB_WEBHOOK_SECRET|INTERNAL_CRON_SECRET|AUTH_EMAIL_HOOK_SECRET|DATABASE_URL|DB_PASSWORD)\s*=\s*(.*?)\s*$/;

function looksLikePlaceholder(value) {
  const normalized = value
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .toLowerCase();

  if (!normalized) return true;
  if (normalized.startsWith("${") || normalized.startsWith("<")) return true;
  if (normalized.startsWith("process.env") || normalized.startsWith("deno.env")) return true;

  return [
    "example",
    "placeholder",
    "replace",
    "changeme",
    "your_",
    "your-",
    "seu_",
    "sua_",
    "seu-",
    "sua-",
    "token-publico",
    "chave_",
  ].some((marker) => normalized.includes(marker));
}

export function scanText(file, text) {
  const findings = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((line, index) => {
    for (const rule of directRules) {
      rule.pattern.lastIndex = 0;
      if (rule.pattern.test(line)) {
        findings.push({ file, line: index + 1, rule: rule.id });
      }
    }

    const assignment = line.match(sensitiveAssignment);
    if (assignment && !looksLikePlaceholder(assignment[2])) {
      findings.push({
        file,
        line: index + 1,
        rule: `sensitive-assignment:${assignment[1]}`,
      });
    }
  });

  return findings;
}

export function formatFinding(finding) {
  return `${finding.file}:${finding.line} [${finding.rule}]`;
}

export function scanRepository(root = process.cwd()) {
  const output = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8" },
  );
  const files = output.split("\0").filter(Boolean);
  const findings = [];
  let scannedFiles = 0;

  for (const file of files) {
    const absolutePath = resolve(root, file);
    let stat;
    try {
      stat = statSync(absolutePath);
    } catch {
      continue;
    }
    if (!stat.isFile() || stat.size > MAX_TEXT_FILE_BYTES) continue;

    const content = readFileSync(absolutePath);
    if (content.includes(0)) continue;

    scannedFiles += 1;
    findings.push(...scanText(file, content.toString("utf8")));
  }

  return { findings, scannedFiles };
}
