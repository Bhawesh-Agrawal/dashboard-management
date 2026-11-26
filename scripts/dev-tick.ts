import fs from "node:fs";
import path from "node:path";

function loadEnvLocal(): void {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const rawLine of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIdx = line.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = line.slice(0, eqIdx).trim();
    let val = line.slice(eqIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
}

function parseArgs(argv: string[]): { asOf?: string; only?: string } {
  let asOf: string | undefined;
  let only: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--asOf" && argv[i + 1]) {
      asOf = argv[++i];
    } else if (arg.startsWith("--asOf=")) {
      asOf = arg.slice("--asOf=".length);
    } else if (arg === "--only" && argv[i + 1]) {
      only = argv[++i];
    } else if (arg.startsWith("--only=")) {
      only = arg.slice("--only=".length);
    }
  }
  return { asOf, only };
}

async function main() {
  if (process.env.NODE_ENV === "production") {
    console.error("[dev-tick] Refusing to run when NODE_ENV=production.");
    process.exit(1);
  }

  loadEnvLocal();

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    console.error("[dev-tick] CRON_SECRET is required in environment / .env.local.");
    process.exit(1);
  }

  const { asOf, only } = parseArgs(process.argv.slice(2));
  const intervalMs = 5 * 60 * 1000;
  let consecutiveFailures = 0;

  async function runTick(): Promise<void> {
    const url = new URL(`${appUrl}/api/notifications/trigger`);
    if (asOf) url.searchParams.set("asOf", asOf);
    if (only) url.searchParams.set("only", only);

    const stamp = new Date().toISOString();
    try {
      const res = await fetch(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${cronSecret}`,
        },
      });

      if (!res.ok) {
        consecutiveFailures += 1;
        console.error(
          `[dev-tick] ${stamp} HTTP ${res.status} (failures=${consecutiveFailures}/3)`
        );
      } else {
        const body = (await res.json()) as {
          ok?: boolean;
          result?: {
            sent?: number;
            skippedDedup?: number;
            skippedDisabled?: number;
            skippedQuietHours?: number;
            skippedNoSubscription?: number;
            failed?: number;
          };
        };
        const r = body.result ?? {};
        const skipped =
          (r.skippedDedup ?? 0) +
          (r.skippedDisabled ?? 0) +
          (r.skippedQuietHours ?? 0) +
          (r.skippedNoSubscription ?? 0);
        const errors = r.failed ?? 0;
        consecutiveFailures = 0;
        console.log(
          `[dev-tick] ${stamp} sent=${r.sent ?? 0} skipped=${skipped} errors=${errors}`
        );
      }
    } catch (err) {
      consecutiveFailures += 1;
      console.error(
        `[dev-tick] ${stamp} error=${err instanceof Error ? err.message : String(err)} (failures=${consecutiveFailures}/3)`
      );
    }

    if (consecutiveFailures >= 3) {
      console.error("[dev-tick] Stopping after 3 consecutive failures.");
      process.exit(1);
    }
  }

  await runTick();
  const timer = setInterval(() => {
    void runTick();
  }, intervalMs);

  process.on("SIGINT", () => {
    clearInterval(timer);
    process.exit(0);
  });
}

void main();
