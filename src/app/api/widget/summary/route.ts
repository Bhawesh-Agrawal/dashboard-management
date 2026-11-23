import { NextResponse } from "next/server";
import { requireWidgetAuth } from "@/features/widget/lib/middleware";
import { prisma } from "@/lib/prisma";
import { computeActivityStreak } from "@/features/routines/lib/streaks";

type DayOfWeek = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

export async function GET(request: Request) {
  const auth = await requireWidgetAuth(request);
  if (!auth.ok) return auth.response;

  const today = new Date();
  const dayOfWeekMap: Record<number, DayOfWeek> = {
    0: "SUN", 1: "MON", 2: "TUE", 3: "WED",
    4: "THU", 5: "FRI", 6: "SAT",
  };
  const todayDayOfWeek = dayOfWeekMap[today.getDay()];

  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + 7);

  const userId = auth.userId ?? undefined;

  const [topTasks, routinesData, upcomingEvents, birthdayEvents, streakData] =
    await Promise.all([
      prisma.task.findMany({
        where: { starred: true, status: "open", ...(userId ? { OR: [{ userId }, { userId: null }] } : {}) },
        orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
        take: 3,
        include: {
          course: { select: { name: true, code: true } },
          project: { select: { name: true } },
        },
      }),

      (async () => {
        const routines = await prisma.routine.findMany({
          where: { activeDays: { has: todayDayOfWeek } },
          orderBy: [{ timeOfDay: "asc" }, { name: "asc" }],
          take: 5,
        });

        if (routines.length === 0) return [];

        const thirtyDaysAgo = new Date(today);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const completions = await prisma.routineCompletion.findMany({
          where: {
            routineId: { in: routines.map((r) => r.id) },
            date: { gte: thirtyDaysAgo },
          },
          select: { routineId: true, date: true },
        });

        const todayStr = today.toISOString().split("T")[0];
        const completedToday = new Set(
          completions
            .filter((c) => c.date.toISOString().split("T")[0] === todayStr)
            .map((c) => c.routineId)
        );

        return routines.map((r) => ({
          id: r.id,
          name: r.name,
          done: completedToday.has(r.id),
        }));
      })(),

      prisma.event.findMany({
        where: {
          dateTime: { gte: today, lte: windowEnd },
          eventType: { not: "birthday" },
        },
        orderBy: { dateTime: "asc" },
        take: 3,
        select: { title: true, dateTime: true, eventType: true },
      }),

      prisma.event.findMany({
        where: {
          dateTime: { gte: today, lte: windowEnd },
          eventType: "birthday",
        },
        orderBy: { dateTime: "asc" },
        take: 3,
        select: { title: true, dateTime: true, eventType: true },
      }),

      computeActivityStreak(180),
    ]);

  const allEvents = [
    ...upcomingEvents.map((e) => ({
      title: e.title,
      date: e.dateTime.toISOString().split("T")[0],
      type: "event" as const,
    })),
    ...birthdayEvents.map((e) => ({
      title: e.title,
      date: e.dateTime.toISOString().split("T")[0],
      type: "birthday" as const,
    })),
  ]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);

  const topTaskSlots = Array.from({ length: 3 }, (_, i) => {
    const t = topTasks[i];
    if (!t) return { id: null, title: null, done: false, badge: null };
    const badge = t.course?.code || t.project?.name || null;
    return {
      id: t.id,
      title: t.title,
      done: t.status === "done",
      badge,
    };
  });

  return NextResponse.json({
    topTasks: topTaskSlots,
    routines: routinesData,
    upcomingEvents: allEvents,
    streakCount: streakData.currentStreak,
  });
}
