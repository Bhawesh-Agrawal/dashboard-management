import { NextResponse } from "next/server";
import { requireWidgetAuth } from "@/features/widget/lib/middleware";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireWidgetAuth(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;

  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  const newStatus = task.status === "done" ? "open" : "done";
  await prisma.task.update({
    where: { id },
    data: {
      status: newStatus,
      completedAt: newStatus === "done" ? new Date() : null,
    },
  });

  revalidatePath("/tasks");
  revalidatePath("/today");
  if (task.courseId) revalidatePath(`/courses/${task.courseId}`);

  return NextResponse.json({ id, done: newStatus === "done" });
}
