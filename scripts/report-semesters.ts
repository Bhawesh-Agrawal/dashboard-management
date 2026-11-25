import fs from "node:fs";
import path from "node:path";
import { enforceProductionGuard } from "./guard";

function loadEnvLocal(): void {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eqIndex = line.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

async function main() {
  loadEnvLocal();
  enforceProductionGuard("scripts/report-semesters.ts");

  const [{ prisma }, { semesterStatus }, { DEFAULT_TIMEZONE, formatDateOnly, getTodayInTimezone }] =
    await Promise.all([
      import("../src/lib/prisma"),
      import("../src/features/semesters/lib/status"),
      import("../src/lib/timezone"),
    ]);

  try {
    const todayDateOnly = getTodayInTimezone(DEFAULT_TIMEZONE);
    const semesters = await prisma.semester.findMany({
      orderBy: [{ startDate: "asc" }],
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        isActive: true,
        userId: true,
        _count: {
          select: { courses: true },
        },
      },
    });

    console.log(`Today (${DEFAULT_TIMEZONE}): ${todayDateOnly}`);
    console.log(`Total semesters: ${semesters.length}`);
    console.log("");

    if (semesters.length === 0) {
      console.log("No semesters found.");
      return;
    }

    for (const sem of semesters) {
      const start = formatDateOnly(sem.startDate);
      const end = formatDateOnly(sem.endDate);
      const derivedStatus = semesterStatus(sem, todayDateOnly);
      console.log(
        [
          `name="${sem.name}"`,
          `start=${start}`,
          `end=${end}`,
          `isActive=${sem.isActive}`,
          `status=${derivedStatus}`,
          `courses=${sem._count.courses}`,
          `userId=${sem.userId ?? "null"}`,
        ].join(" | ")
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("Failed to report semesters:", err);
  process.exit(1);
});
