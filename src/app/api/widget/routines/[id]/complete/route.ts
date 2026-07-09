import { NextResponse } from "next/server";
import { requireWidgetAuth } from "@/features/widget/lib/middleware";
import { prisma } from "@/lib/prisma";

function normalizeDate(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireWidgetAuth(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const today = normalizeDate(new Date());

  const routine = await prisma.routine.findUnique({ where: { id } });
  if (!routine) {
    return NextResponse.json({ error: "Routine not found" }, { status: 404 });
  }

  await prisma.routineCompletion.upsert({
    where: {
      routineId_date: { routineId: id, date: today },
    },
    create: { routineId: id, date: today },
    update: { completedAt: new Date() },
  });

  return NextResponse.json({ id, done: true });
}
