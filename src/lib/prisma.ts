import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { validateDatabaseTarget } from "../../scripts/guard";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: pg.Pool | undefined;
};

function createPrismaClient() {
  // Validate database host guardrails on startup
  validateDatabaseTarget({ isAppStartup: true });

  // Use pg.Pool instead of a bare connectionString to avoid
  // non-detachable ArrayBuffer issues on Node.js 26+.
  // The Pool manages TCP socket buffer lifecycles properly.
  const pool = globalForPrisma.pgPool ?? new pg.Pool({
    connectionString: process.env.DATABASE_URL!,
    max: 5,
    idleTimeoutMillis: 30_000,
    ssl: { rejectUnauthorized: false },
  });

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.pgPool = pool;
  }

  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

// Prevent multiple Prisma Client instances in dev (hot-reload leak),
// while invalidating stale cached instances if `prisma generate` added new models.
const cachedPrisma = globalForPrisma.prisma;
const hasCurrentModels = cachedPrisma != null && "dsaSettings" in cachedPrisma;

export const prisma = hasCurrentModels ? cachedPrisma : createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
