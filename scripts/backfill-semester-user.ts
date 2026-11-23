import { PrismaClient } from "@prisma/client";
import { enforceProductionGuard } from "./guard";

const prisma = new PrismaClient();

async function main() {
  enforceProductionGuard("scripts/backfill-semester-user.ts");

  const args = process.argv.slice(2);
  const execute = args.includes("--execute");
  const userId = args.find((arg) => !arg.startsWith("--"));

  if (!userId) {
    console.error("Usage: npx tsx scripts/backfill-semester-user.ts <USER_ID> [--execute]");
    console.error("Example: npx tsx scripts/backfill-semester-user.ts 123e4567-e89b-12d3-a456-426614174000");
    console.error("By default, the script runs in DRY-RUN mode. Pass --execute to apply changes.");
    process.exit(1);
  }

  console.log(`Target Supabase User ID: ${userId}`);
  console.log(`Mode: ${execute ? "EXECUTE (live database writes)" : "DRY RUN (read-only preview)"}`);

  const nullSemesters = await prisma.semester.findMany({
    where: { userId: null },
    select: { id: true, name: true, startDate: true, endDate: true },
  });

  console.log(`\nFound ${nullSemesters.length} semester(s) with NULL userId:`);
  for (const sem of nullSemesters) {
    console.log(` - [${sem.id}] "${sem.name}" (${sem.startDate.toISOString().slice(0, 10)} to ${sem.endDate.toISOString().slice(0, 10)})`);
  }

  if (nullSemesters.length === 0) {
    console.log("\nAll semesters already have a userId assigned. Nothing to backfill.");
    return;
  }

  if (!execute) {
    console.log(`\n[DRY RUN] Would update ${nullSemesters.length} semester(s) to userId: "${userId}".`);
    console.log("To apply this update, run with --execute:");
    console.log(`  npx tsx scripts/backfill-semester-user.ts ${userId} --execute\n`);
  } else {
    const result = await prisma.semester.updateMany({
      where: { userId: null },
      data: { userId },
    });
    console.log(`\n[EXECUTE SUCCESS] Successfully updated ${result.count} semester(s) to userId: "${userId}".\n`);
  }
}

main()
  .catch((err) => {
    console.error("Error during backfill:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
