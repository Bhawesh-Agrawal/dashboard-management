import { NextResponse } from "next/server";
import { getCurrentUserId, UnauthorizedError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const userId = await getCurrentUserId();

    // Fire all queries in parallel for speed
    const [tasks, courses, notes, routines, events, routineCompletions, attendance, classSchedules, assessments] = await Promise.all([
      // Tasks with denormalized course/project names
      prisma.task.findMany({
        where: {
          OR: [{ userId }, { userId: null }],
        },
        orderBy: [
          { sortPriority: { sort: "asc", nulls: "last" } },
          { priority: "asc" },
          { dueDate: "asc" },
        ],
        include: {
          course: { select: { id: true, name: true, color: true } },
          project: { select: { id: true, name: true, color: true } },
        },
      }),

      // All courses
      prisma.course.findMany({
        orderBy: { name: "asc" },
      }),

      // Notes with denormalized course/folder names
      prisma.note.findMany({
        where: {
          OR: [{ userId }, { userId: null }],
        },
        orderBy: { createdAt: "desc" },
        include: {
          course: { select: { id: true, name: true, color: true } },
          folder: { select: { id: true, name: true, type: true, color: true } },
        },
      }),

      // Routines (raw, without streak - streak is computed client-side)
      prisma.routine.findMany({
        orderBy: [{ timeOfDay: "asc" }, { name: "asc" }],
      }),

      // Events (last 90 days + next 90 days)
      prisma.event.findMany({
        where: {
          dateTime: {
            gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
            lte: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          },
        },
        orderBy: { dateTime: "asc" },
      }),

      // Routine completions (last 30 days for streak computation)
      prisma.routineCompletion.findMany({
        where: {
          date: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
        orderBy: { date: "desc" },
      }),

      // Attendance records (last 90 days)
      prisma.attendanceRecord.findMany({
        where: {
          date: {
            gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
          },
        },
        orderBy: { date: "desc" },
      }),

      // Class schedules with course data
      prisma.classSchedule.findMany({
        include: {
          course: { select: { id: true, name: true, code: true, color: true } },
        },
      }),

      // Assessments with course data (next 90 days)
      prisma.assessment.findMany({
        where: {
          date: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            lte: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          },
        },
        include: {
          course: { select: { id: true, name: true, color: true } },
        },
        orderBy: { date: "asc" },
      }),
    ]);

    // Transform tasks to include denormalized data
    const transformedTasks = tasks.map((t) => ({
      id: t.id,
      userId: t.userId,
      title: t.title,
      notes: t.notes,
      dueDate: t.dueDate?.toISOString() ?? null,
      priority: t.priority,
      status: t.status,
      courseId: t.courseId,
      projectId: t.projectId,
      domainId: t.domainId,
      starred: t.starred,
      completedAt: t.completedAt?.toISOString() ?? null,
      energyRequirement: t.energyRequirement,
      estimatedDuration: t.estimatedDuration,
      optimalTimeOfDay: t.optimalTimeOfDay,
      sortPriority: t.sortPriority,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      courseName: t.course?.name ?? null,
      courseColor: t.course?.color ?? null,
      projectName: t.project?.name ?? null,
      projectColor: t.project?.color ?? null,
    }));

    // Transform notes to include denormalized data
    const transformedNotes = notes.map((n) => ({
      id: n.id,
      userId: n.userId,
      title: n.title,
      content: n.content,
      sourceType: n.sourceType,
      sourceLink: n.sourceLink,
      tags: n.tags,
      courseId: n.courseId,
      taskId: n.taskId,
      projectId: n.projectId,
      isDocumentLibraryEntry: n.isDocumentLibraryEntry,
      folderId: n.folderId,
      documentType: n.documentType,
      s3Key: n.s3Key,
      s3Url: n.s3Url,
      fileSize: n.fileSize,
      fileName: n.fileName,
      mimeType: n.mimeType,
      pageCount: n.pageCount,
      thumbnailUrl: n.thumbnailUrl,
      originalUrl: n.originalUrl,
      embedHtml: n.embedHtml,
      extractedText: n.extractedText,
      lastViewedAt: n.lastViewedAt?.toISOString() ?? null,
      viewCount: n.viewCount,
      isPinned: n.isPinned,
      isFavorite: n.isFavorite,
      lastReviewedAt: n.lastReviewedAt?.toISOString() ?? null,
      reviewCount: n.reviewCount,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
      courseName: n.course?.name ?? null,
      courseColor: n.course?.color ?? null,
      folderName: n.folder?.name ?? null,
      folderType: n.folder?.type ?? null,
      folderColor: n.folder?.color ?? null,
    }));

    // Transform courses
    const transformedCourses = courses.map((c) => ({
      id: c.id,
      semesterId: c.semesterId,
      name: c.name,
      code: c.code,
      credits: c.credits,
      instructor: c.instructor,
      color: c.color,
      targetGrade: c.targetGrade,
      attendanceMode: c.attendanceMode,
      manualPresent: c.manualPresent,
      manualTotalClasses: c.manualTotalClasses,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));

    // Transform routines
    const transformedRoutines = routines.map((r) => ({
      id: r.id,
      userId: r.userId,
      name: r.name,
      timeOfDay: r.timeOfDay,
      specificTime: r.specificTime,
      streakGoal: r.streakGoal,
      activeDays: r.activeDays,
      energyImpact: r.energyImpact,
      category: r.category,
      flowTrigger: r.flowTrigger,
      identityId: r.identityId,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));

    // Transform events
    const transformedEvents = events.map((e) => ({
      id: e.id,
      userId: e.userId,
      title: e.title,
      dateTime: e.dateTime.toISOString(),
      location: e.location,
      notes: e.notes,
      eventType: e.eventType,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.createdAt.toISOString(), // Events don't have updatedAt, use createdAt
    }));

    // Transform routine completions
    const transformedCompletions = routineCompletions.map((rc) => ({
      id: rc.id,
      routineId: rc.routineId,
      date: rc.date.toISOString().split("T")[0], // YYYY-MM-DD
      completedAt: rc.completedAt.toISOString(),
    }));

    // Transform attendance records
    const transformedAttendance = attendance.map((a) => ({
      id: a.id,
      courseId: a.courseId,
      date: a.date.toISOString().split("T")[0], // YYYY-MM-DD
      status: a.status,
    }));

    // Transform class schedules
    const transformedClassSchedules = classSchedules.map((cs) => ({
      id: cs.id,
      courseId: cs.courseId,
      dayOfWeek: cs.dayOfWeek,
      startTime: cs.startTime,
      endTime: cs.endTime,
      location: cs.location,
      effectiveStartDate: cs.effectiveStartDate?.toISOString() ?? null,
      effectiveEndDate: cs.effectiveEndDate?.toISOString() ?? null,
      courseName: cs.course.name,
      courseCode: cs.course.code,
      courseColor: cs.course.color,
    }));

    // Transform assessments
    const transformedAssessments = assessments.map((a) => ({
      id: a.id,
      courseId: a.courseId,
      componentType: a.componentType,
      date: a.date?.toISOString() ?? null,
      maxMarks: a.maxMarks,
      obtainedMarks: a.obtainedMarks,
      courseName: a.course.name,
      courseColor: a.course.color,
    }));

    return NextResponse.json({
      tasks: transformedTasks,
      courses: transformedCourses,
      notes: transformedNotes,
      routines: transformedRoutines,
      events: transformedEvents,
      routineCompletions: transformedCompletions,
      attendance: transformedAttendance,
      classSchedules: transformedClassSchedules,
      assessments: transformedAssessments,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[Sync Seed] Failed:", error);
    return NextResponse.json(
      { error: "Failed to fetch seed data" },
      { status: 500 }
    );
  }
}
