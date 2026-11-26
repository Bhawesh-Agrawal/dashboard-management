import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const PRODUCTION_REQUIRED = new Set<string>([
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_EMAIL",
  "CRON_BEARER_TOKEN",
  "CRON_OIDC_AUDIENCE",
  "CRON_OIDC_SERVICE_ACCOUNT_EMAIL",
]);

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walkFiles(full, out);
    } else if (/\.(ts|tsx|js|mjs|cjs)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function collectEnvVarsFromSrc(srcDir: string): string[] {
  const vars = new Set<string>();
  const regex = /\bprocess\.env\.([A-Z][A-Z0-9_]*)\b/g;

  for (const file of walkFiles(srcDir)) {
    const content = fs.readFileSync(file, "utf8");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      vars.add(match[1]);
    }
  }

  return Array.from(vars).sort();
}

function loadEnvLocal(envPath: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  if (!fs.existsSync(envPath)) return parsed;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim();
    if (val) parsed[key] = "SET";
  }
  return parsed;
}

function getGcpConfiguredKeys(): Set<string> | null {
  try {
    const secretsOut = execSync(
      'gcloud secrets list --format="value(name)"',
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
    const keys = new Set(
      secretsOut
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
    );

    try {
      const envOut = execSync(
        'gcloud run services describe dashboard-management --region=asia-south1 --format="value(spec.template.spec.containers[0].env[].name)"',
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
      );
      for (const line of envOut.split(/\r?\n/)) {
        for (const token of line.split(/[,\s;]+/)) {
          const k = token.trim();
          if (k) keys.add(k);
        }
      }
    } catch {
      // Cloud Run service may not exist yet before first deploy
    }

    return keys;
  } catch {
    return null;
  }
}

function main() {
  const rootDir = process.cwd();
  const srcDir = path.join(rootDir, "src");
  const envLocal = loadEnvLocal(path.join(rootDir, ".env.local"));
  const useGcp = process.argv.includes("--gcp");
  const gcpKeys = useGcp ? getGcpConfiguredKeys() : null;

  const envVars = collectEnvVarsFromSrc(srcDir);

  if (useGcp && gcpKeys === null) {
    console.error("Failed to query GCP Secret Manager / Cloud Run (check gcloud auth/project).");
    process.exitCode = 1;
  }

  let missingRequired = 0;

  for (const name of envVars) {
    const isRequired = PRODUCTION_REQUIRED.has(name);
    const isSetLocally = Boolean(process.env[name]) || Boolean(envLocal[name]);
    const localStatus = isSetLocally ? "SET" : "UNSET";

    if (useGcp && gcpKeys) {
      const gcpStatus = gcpKeys.has(name) ? "SET" : "UNSET";
      console.log(
        `${name.padEnd(38)} req=${isRequired ? "yes" : "no "}  local=${localStatus.padEnd(5)}  gcp=${gcpStatus}`
      );
      if (isRequired && gcpStatus === "UNSET") missingRequired++;
    } else {
      console.log(
        `${name.padEnd(38)} req=${isRequired ? "yes" : "no "}  ${localStatus}`
      );
      if (isRequired && !isSetLocally) missingRequired++;
    }
  }

  if (missingRequired > 0) {
    console.error(`\nMissing ${missingRequired} production-required environment variable(s).`);
    process.exitCode = 1;
  }
}

main();
