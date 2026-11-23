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
 * Enforces production safety checks for scripts that mutate data or perform migrations.
 * - Requires DEPLOY_ENV to be 'local', 'staging', or 'production'.
 * - If DEPLOY_ENV === 'production', requires '--i-know-this-is-production' CLI argument.
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
