import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, UnauthorizedError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { memCache } from "@/lib/mem-cache";

type SyncTable = "tasks" | "courses" | "notes" | "routines" | "events";
type SyncAction = "upsert" | "delete";

interface WriteRequest {
  table: SyncTable;
  action: SyncAction;
  data: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    const body: WriteRequest = await request.json();
    const { table, action, data } = body;

    if (!table || !action || !data) {
      return NextResponse.json(
        { error: "Missing required fields: table, action, data" },
        { status: 400 }
      );
    }

    let result: { updatedAt?: string };

    if (action === "delete") {
      await handleDelete(table, data.id as string, userId);
      result = { updatedAt: new Date().toISOString() };
    } else {
      result = await handleUpsert(table, data, userId);
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[Sync Write] Failed:", error);
    return NextResponse.json(
      { error: "Write failed" },
      { status: 500 }
    );
  }
}

async function handleUpsert(
  table: SyncTable,
  data: Record<string, unknown>,
  userId: string
): Promise<{ updatedAt: string }> {
  const now = new Date();

  switch (table) {
    case "tasks": {
      const { id, courseName: _courseName, courseColor: _courseColor, projectName: _projectName, projectColor: _projectColor, dirty: _dirty, _deleted: _deletedAt, ...taskData } = data;
      // Compute domainId from projectId
      let domainId = taskData.domainId as string | null ?? null;
      if (taskData.projectId) {
        const project = await prisma.project.findUnique({
          where: { id: taskData.projectId as string },
          select: { domainId: true },
        });
        domainId = project?.domainId ?? null;
      }

      const completedAtUpdate =
        taskData.status === "done"
          ? { completedAt: now }
          : taskData.status === "open"
            ? { completedAt: null }
            : {};

      const task = await prisma.task.upsert({
        where: { id: id as string },
        create: {
          id: id as string,
          userId,
          title: taskData.title as string,
          notes: taskData.notes as string | undefined,
          dueDate: taskData.dueDate ? new Date(taskData.dueDate as string) : null,
          priority: (taskData.priority as number) ?? 2,
          status: (taskData.status as "open" | "done") ?? "open",
          courseId: (taskData.courseId as string) || null,
          projectId: (taskData.projectId as string) || null,
          domainId,
          starred: (taskData.starred as boolean) ?? false,
          energyRequirement: taskData.energyRequirement as string | undefined,
          estimatedDuration: taskData.estimatedDuration as number | undefined,
          optimalTimeOfDay: taskData.optimalTimeOfDay as string | undefined,
          sortPriority: taskData.sortPriority as number | undefined,
          ...completedAtUpdate,
        },
        update: {
          title: taskData.title as string,
          notes: taskData.notes as string | undefined,
          dueDate: taskData.dueDate ? new Date(taskData.dueDate as string) : undefined,
          priority: taskData.priority as number | undefined,
          status: taskData.status as "open" | "done" | undefined,
          courseId: (taskData.courseId as string) ?? undefined,
          projectId: (taskData.projectId as string) ?? undefined,
          domainId,
          starred: taskData.starred as boolean | undefined,
          energyRequirement: taskData.energyRequirement as string | undefined,
          estimatedDuration: taskData.estimatedDuration as number | undefined,
          optimalTimeOfDay: taskData.optimalTimeOfDay as string | undefined,
          sortPriority: taskData.sortPriority as number | undefined,
          ...completedAtUpdate,
        },
      });

      memCache.invalidatePrefix("ai-insights:");
      return { updatedAt: task.updatedAt.toISOString() };
    }

    case "courses": {
      const { id, dirty: _dirtyC, _deleted: _deletedC, ...courseData } = data;
      const course = await prisma.course.upsert({
        where: { id: id as string },
        create: {
          id: id as string,
          semesterId: courseData.semesterId as string,
          name: courseData.name as string,
          code: courseData.code as string | undefined,
          credits: courseData.credits as number,
          instructor: courseData.instructor as string | undefined,
          color: courseData.color as string | undefined,
          targetGrade: courseData.targetGrade as string | undefined,
          attendanceMode: (courseData.attendanceMode as "auto" | "manual") ?? "auto",
          manualPresent: courseData.manualPresent as number | undefined,
          manualTotalClasses: courseData.manualTotalClasses as number | undefined,
        },
        update: {
          name: courseData.name as string,
          code: courseData.code as string | undefined,
          credits: courseData.credits as number | undefined,
          instructor: courseData.instructor as string | undefined,
          color: courseData.color as string | undefined,
          targetGrade: courseData.targetGrade as string | undefined,
          attendanceMode: courseData.attendanceMode as "auto" | "manual" | undefined,
          manualPresent: courseData.manualPresent as number | undefined,
          manualTotalClasses: courseData.manualTotalClasses as number | undefined,
        },
      });

      return { updatedAt: course.updatedAt.toISOString() };
    }

    case "notes": {
      const { id, courseName: _cn, courseColor: _cc, folderName: _fn, folderType: _ft, folderColor: _fc, dirty: _dirtyN, _deleted: _deletedN, ...noteData } = data;
      const note = await prisma.note.upsert({
        where: { id: id as string },
        create: {
          id: id as string,
          userId,
          title: noteData.title as string | undefined,
          content: noteData.content as string,
          sourceType: (noteData.sourceType as "typed" | "ocr_photo" | "voice") ?? "typed",
          sourceLink: noteData.sourceLink as string | undefined,
          tags: (noteData.tags as string[]) ?? [],
          courseId: (noteData.courseId as string) || null,
          taskId: (noteData.taskId as string) || null,
          projectId: (noteData.projectId as string) || null,
          isDocumentLibraryEntry: (noteData.isDocumentLibraryEntry as boolean) ?? false,
          folderId: (noteData.folderId as string) || null,
          documentType: noteData.documentType as any,
          s3Key: noteData.s3Key as string | undefined,
          s3Url: noteData.s3Url as string | undefined,
          fileSize: noteData.fileSize as number | undefined,
          fileName: noteData.fileName as string | undefined,
          mimeType: noteData.mimeType as string | undefined,
          pageCount: noteData.pageCount as number | undefined,
          thumbnailUrl: noteData.thumbnailUrl as string | undefined,
          originalUrl: noteData.originalUrl as string | undefined,
          embedHtml: noteData.embedHtml as string | undefined,
          extractedText: noteData.extractedText as string | undefined,
          isPinned: (noteData.isPinned as boolean) ?? false,
          isFavorite: (noteData.isFavorite as boolean) ?? false,
        },
        update: {
          title: noteData.title as string | undefined,
          content: noteData.content as string | undefined,
          sourceType: noteData.sourceType as any,
          sourceLink: noteData.sourceLink as string | undefined,
          tags: noteData.tags as string[] | undefined,
          courseId: (noteData.courseId as string) ?? undefined,
          taskId: (noteData.taskId as string) ?? undefined,
          projectId: (noteData.projectId as string) ?? undefined,
          isDocumentLibraryEntry: noteData.isDocumentLibraryEntry as boolean | undefined,
          folderId: (noteData.folderId as string) ?? undefined,
          documentType: noteData.documentType as any,
          s3Key: noteData.s3Key as string | undefined,
          s3Url: noteData.s3Url as string | undefined,
          fileSize: noteData.fileSize as number | undefined,
          fileName: noteData.fileName as string | undefined,
          mimeType: noteData.mimeType as string | undefined,
          pageCount: noteData.pageCount as number | undefined,
          thumbnailUrl: noteData.thumbnailUrl as string | undefined,
          originalUrl: noteData.originalUrl as string | undefined,
          embedHtml: noteData.embedHtml as string | undefined,
          extractedText: noteData.extractedText as string | undefined,
          isPinned: noteData.isPinned as boolean | undefined,
          isFavorite: noteData.isFavorite as boolean | undefined,
        },
      });

      return { updatedAt: note.updatedAt.toISOString() };
    }

    case "routines": {
      const { id, dirty: _dirtyR, _deleted: _deletedR, ...routineData } = data;
      const routine = await prisma.routine.upsert({
        where: { id: id as string },
        create: {
          id: id as string,
          userId,
          name: routineData.name as string,
          timeOfDay: (routineData.timeOfDay as any) ?? "morning",
          specificTime: routineData.specificTime as string | undefined,
          streakGoal: routineData.streakGoal as number | undefined,
          activeDays: (routineData.activeDays as any[]) ?? [],
          energyImpact: (routineData.energyImpact as any) ?? "neutral",
          category: routineData.category as string | undefined,
          flowTrigger: routineData.flowTrigger as string | undefined,
          identityId: routineData.identityId as string | undefined,
        },
        update: {
          name: routineData.name as string,
          timeOfDay: routineData.timeOfDay as any,
          specificTime: routineData.specificTime as string | undefined,
          streakGoal: routineData.streakGoal as number | undefined,
          activeDays: routineData.activeDays as any,
          energyImpact: routineData.energyImpact as any,
          category: routineData.category as string | undefined,
          flowTrigger: routineData.flowTrigger as string | undefined,
          identityId: routineData.identityId as string | undefined,
        },
      });

      return { updatedAt: routine.updatedAt.toISOString() };
    }

    case "events": {
      const { id, dirty: _dirtyE, _deleted: _deletedE, ...eventData } = data;
      const event = await prisma.event.upsert({
        where: { id: id as string },
        create: {
          id: id as string,
          userId,
          title: eventData.title as string,
          dateTime: new Date(eventData.dateTime as string),
          location: eventData.location as string | undefined,
          notes: eventData.notes as string | undefined,
          eventType: (eventData.eventType as "general" | "birthday" | "class" | "assessment") ?? "general",
        },
        update: {
          title: eventData.title as string,
          dateTime: new Date(eventData.dateTime as string),
          location: eventData.location as string | undefined,
          notes: eventData.notes as string | undefined,
          eventType: eventData.eventType as any,
        },
      });

      return { updatedAt: event.createdAt.toISOString() };
    }

    default:
      throw new Error(`Unknown table: ${table}`);
  }
}

async function handleDelete(
  table: SyncTable,
  id: string,
  userId: string
): Promise<void> {
  switch (table) {
    case "tasks":
      await prisma.task.delete({
        where: { id, OR: [{ userId }, { userId: null }] },
      });
      memCache.invalidatePrefix("ai-insights:");
      break;
    case "courses":
      await prisma.course.delete({ where: { id } });
      break;
    case "notes":
      // Delete associated S3 files first
      const note = await prisma.note.findUnique({
        where: { id },
        select: { s3Key: true, noteAttachments: { select: { s3Key: true } } },
      });
      if (note?.s3Key) {
        try {
          const { deleteFile } = await import("@/lib/s3/actions");
          await deleteFile(note.s3Key);
        } catch {}
      }
      for (const att of note?.noteAttachments ?? []) {
        if (att.s3Key) {
          try {
            const { deleteFile } = await import("@/lib/s3/actions");
            await deleteFile(att.s3Key);
          } catch {}
        }
      }
      await prisma.noteAnnotation.deleteMany({ where: { noteId: id } });
      await prisma.noteAttachment.deleteMany({ where: { noteId: id } });
      await prisma.note.delete({ where: { id } });
      break;
    case "routines":
      await prisma.routine.delete({ where: { id } });
      break;
    case "events":
      await prisma.event.delete({ where: { id } });
      break;
    default:
      throw new Error(`Unknown table: ${table}`);
  }
}
