import { fileURLToPath } from "node:url";

export type DeployEnv = "local" | "staging" | "production";

/**
 * Extracts and prints the host and database name from DATABASE_URL or DIRECT_URL,
 * completely stripping any username and password credentials.
 */
export function getDatabaseHost(): string {
  const dbUrl = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!dbUrl) {
    return "<DATABASE_URL not set>";
  }
  try {
    const parsed = new URL(dbUrl);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    // Fallback: mask credentials if URL parsing fails
    return dbUrl.replace(/\/\/[^@]+@/, "//***:***@");
  }
}

/**
 * Extracts only the hostname from a database connection string.
 */
export function parseDatabaseHostname(dbUrl: string | undefined): string | null {
  if (!dbUrl) return null;
  try {
    const parsed = new URL(dbUrl);
    return parsed.hostname;
  } catch {
    const match = dbUrl.match(/@([^:/]+)/);
    return match ? match[1] : null;
  }
}

/**
 * Checks if a database hostname matches the configured production database host.
 */
export function isProdDbHost(host: string, prodDbHost: string): boolean {
  const normalizedProd = prodDbHost.trim().toLowerCase();
  const normalizedHost = host.trim().toLowerCase();
  return (
    normalizedHost === normalizedProd ||
    normalizedHost.split(":")[0] === normalizedProd.split(":")[0]
  );
}

/**
 * Checks if a host is local (localhost, loopback, or matches DEV_DB_HOST).
 */
export function isLocalDbHost(host: string, devDbHost?: string): boolean {
  const normalized = host.toLowerCase().trim();
  // Handle IPv6 (e.g., "::1" or "[::1]:5432") vs IPv4/hostname with port
  const stripped = normalized.replace(/^\[/, "").replace(/\](:\d+)?$/, "");
  const h = stripped.includes(":") && !stripped.includes("::") ? stripped.split(":")[0] : stripped;

  if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "host.docker.internal") {
    return true;
  }
  if (devDbHost) {
    const d = devDbHost.toLowerCase().trim().replace(/^\[/, "").replace(/\](:\d+)?$/, "");
    const devClean = d.includes(":") && !d.includes("::") ? d.split(":")[0] : d;
    if (h === devClean) {
      return true;
    }
  }
  return false;
}

/**
 * Validates the target database host against environment guardrails:
 * 1. If host matches PROD_DB_HOST and DEPLOY_ENV !== "production", refuses to run.
 * 2. If DEPLOY_ENV === "local" and host is not local or DEV_DB_HOST, requires confirmation.
 */
export function validateDatabaseTarget(options?: { isAppStartup?: boolean }): {
  deployEnv: DeployEnv | undefined;
  host: string | null;
} {
  const deployEnv = process.env.DEPLOY_ENV as DeployEnv | undefined;
  const prodDbHost = process.env.PROD_DB_HOST;
  const devDbHost = process.env.DEV_DB_HOST;

  const dbUrl = process.env.DATABASE_URL || process.env.DIRECT_URL;
  const host = parseDatabaseHostname(dbUrl);

  // 1. Refuse execution if connected to production DB outside production environment
  if (prodDbHost && host && isProdDbHost(host, prodDbHost)) {
    if (deployEnv !== "production") {
      const errorMsg =
        `⛔ [DATABASE GUARD ERROR] Connected to production database host "${host}" ` +
        `while DEPLOY_ENV is "${deployEnv || "<unset>"}" (expected "production"). ` +
        `Refusing to run to protect production data!`;
      if (options?.isAppStartup) {
        throw new Error(errorMsg);
      } else {
        console.error(`\n${errorMsg}\n`);
        process.exit(1);
      }
    }
  }

  // 2. If DEPLOY_ENV is local, verify host is local or matches DEV_DB_HOST; require confirmation otherwise
  if (deployEnv === "local" && host && !isLocalDbHost(host, devDbHost)) {
    const hasConfirmation =
      (typeof process !== "undefined" && process.argv && process.argv.includes("--confirm-remote-db")) ||
      process.env.CONFIRM_REMOTE_DB === "true";

    if (!hasConfirmation) {
      const errorMsg =
        `⚠️ [DATABASE GUARD ERROR] DEPLOY_ENV is "local", but database host is a remote host ("${host}") ` +
        `and does not match DEV_DB_HOST ("${devDbHost || "<unset>"}"). ` +
        `To proceed against this remote database, pass --confirm-remote-db or set CONFIRM_REMOTE_DB=true.`;
      if (options?.isAppStartup) {
        throw new Error(errorMsg);
      } else {
        console.error(`\n${errorMsg}\n`);
        process.exit(1);
      }
    } else {
      console.warn(
        `\n⚠️ [DATABASE GUARD WARNING] Running with DEPLOY_ENV="local" against remote host "${host}" (confirmed).\n`
      );
    }
  }

  return { deployEnv, host };
}

/**
 * Enforces production safety checks for scripts that mutate data or perform migrations.
 * - Requires DEPLOY_ENV to be 'local', 'staging', or 'production'.
 * - If DEPLOY_ENV === 'production', requires '--i-know-this-is-production' CLI argument.
 * - Validates target database host against PROD_DB_HOST and DEV_DB_HOST.
 * - Prints the target DB host (without credentials).
 */
export function enforceProductionGuard(scriptName?: string): DeployEnv {
  const deployEnv = process.env.DEPLOY_ENV as DeployEnv | undefined;
  const validEnvs: DeployEnv[] = ["local", "staging", "production"];

  if (!deployEnv || !validEnvs.includes(deployEnv)) {
    console.error(
      `\n❌ [PRODUCTION GUARD ERROR] DEPLOY_ENV must be explicitly set to 'local', 'staging', or 'production'.\n` +
      `   Current value: ${deployEnv ? `"${deployEnv}"` : "<unset>"}\n` +
      `   Example: DEPLOY_ENV=local npx tsx ${scriptName || "script.ts"}\n`
    );
    process.exit(1);
  }

  // Run database target host checks
  validateDatabaseTarget({ isAppStartup: false });

  const targetDb = getDatabaseHost();
  console.log(`\n🔒 [PRODUCTION GUARD]`);
  console.log(`   Environment: ${deployEnv}`);
  console.log(`   Target DB:   ${targetDb}`);

  if (deployEnv === "production") {
    const hasConfirmationFlag = process.argv.includes("--i-know-this-is-production");
    if (!hasConfirmationFlag) {
      console.error(
        `\n⛔ [PRODUCTION GUARD ABORT] DEPLOY_ENV is set to "production", but the safety flag is missing!\n` +
        `   To execute writes/deletions/migrations against production, you must explicitly append:\n` +
        `   --i-know-this-is-production\n` +
        `   Aborting execution immediately.\n`
      );
      process.exit(1);
    }
    console.log(`   Safety flag '--i-know-this-is-production' verified. Proceeding with caution...\n`);
  } else {
    console.log(`   Non-production execution approved.\n`);
  }

  return deployEnv;
}

// Allow standalone execution as a pre-command guard (e.g., in CI or before prisma migrate)
const isMain = typeof process !== "undefined" && process.argv[1] && (
  process.argv[1].endsWith("/guard.ts") ||
  process.argv[1].endsWith("/guard.js") ||
  process.argv[1] === fileURLToPath(import.meta.url)
);

if (isMain) {
  enforceProductionGuard("scripts/guard.ts");
}
