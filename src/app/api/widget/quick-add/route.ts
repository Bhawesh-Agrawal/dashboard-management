import { NextResponse } from "next/server";
import { requireWidgetAuth } from "@/features/widget/lib/middleware";
import { parseQuickCapture, getActiveCourses } from "@/features/notes/lib/nlp-parsing";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function POST(request: Request) {
  const auth = await requireWidgetAuth(request);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => null);
  if (!body?.text || typeof body.text !== "string" || body.text.trim().length === 0) {
    return NextResponse.json(
      { error: "Missing or invalid 'text' field" },
      { status: 400 }
    );
  }

  const courses = await getActiveCourses();
  const parsed = await parseQuickCapture(body.text.trim(), courses);

  if (parsed.type === "task") {
    const task = await prisma.task.create({
      data: {
        title: parsed.title || body.text.trim(),
        notes: parsed.content,
        dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
        courseId: parsed.courseId || null,
      },
    });

    revalidatePath("/tasks");
    revalidatePath("/today");

    return NextResponse.json({
      id: task.id,
      title: task.title,
      type: "task" as const,
    });
  } else {
    const note = await prisma.note.create({
      data: {
        content: parsed.content,
        tags: parsed.tags,
        courseId: parsed.courseId || null,
      },
    });

    revalidatePath("/notes");

    return NextResponse.json({
      id: note.id,
      title: parsed.title || "Quick Note",
      type: "note" as const,
    });
  }
}
