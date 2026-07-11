import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: pg.Pool | undefined;
};

function createPrismaClient() {
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

// Prevent multiple Prisma Client instances in dev (hot-reload leak).
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
