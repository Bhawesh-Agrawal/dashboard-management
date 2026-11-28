import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { createTask, updateTask } from "@/features/tasks/lib/actions";
import { createCaptureNote } from "@/features/notes/lib/capture-actions";
import { createCalendarEventAction } from "@/features/calendar/lib/event-actions";
import type { AssistantProposal } from "../tools/types";

export async function confirmProposal(input: {
  messageId: string;
  proposalId: string;
  userId?: string;
}): Promise<
  | { ok: true; proposal: AssistantProposal; alreadyConfirmed?: boolean }
  | { ok: false; status: number; error: string }
> {
  const userId = input.userId ?? (await getCurrentUserId());
  const msg = await prisma.aiMessage.findFirst({
    where: { id: input.messageId, userId },
    select: { id: true, proposals: true },
  });

  if (!msg || !Array.isArray(msg.proposals)) {
    return { ok: false, status: 404, error: "Proposal not found" };
  }

  const list = msg.proposals as unknown as AssistantProposal[];
  const idx = list.findIndex((p) => p.id === input.proposalId);
  if (idx === -1) {
    return { ok: false, status: 404, error: "Proposal not found" };
  }

  const target = list[idx];
  if (target.status === "confirmed") {
    return { ok: true, proposal: target, alreadyConfirmed: true };
  }
  if (target.status === "dismissed") {
    return { ok: false, status: 409, error: "Proposal was already dismissed" };
  }

  const expiresMs = Date.parse(target.expiresAt);
  if (target.status === "expired" || (!Number.isNaN(expiresMs) && Date.now() > expiresMs)) {
    const expiredProposal: AssistantProposal = { ...target, status: "expired" };
    const nextList = list.map((p, i) => (i === idx ? expiredProposal : p));
    await prisma.aiMessage.update({
      where: { id: msg.id },
      data: { proposals: nextList as unknown as Prisma.InputJsonValue },
    });
    return { ok: false, status: 410, error: "Proposal has expired" };
  }

  let resultRef: AssistantProposal["resultRef"] = null;
  const payload = target.payload;

  if (target.kind === "create_task") {
    const task = await createTask({
      title: String(payload.title ?? "Untitled task"),
      dueDate: typeof payload.dueDate === "string" ? payload.dueDate : undefined,
      priority: typeof payload.priority === "number" ? payload.priority : 2,
      notes: typeof payload.notes === "string" ? payload.notes : undefined,
      courseId: typeof payload.courseId === "string" ? payload.courseId : undefined,
      projectId: typeof payload.projectId === "string" ? payload.projectId : undefined,
    });
    resultRef = { id: task.id, href: "/tasks", label: `View task: ${task.title}` };
  } else if (target.kind === "update_task") {
    const taskId = String(payload.taskId ?? "");
    const action = String(payload.action ?? "complete");
    await updateTask(
      taskId,
      action === "complete"
        ? { status: "done" }
        : { dueDate: typeof payload.dueDate === "string" ? payload.dueDate : null }
    );
    resultRef = { id: taskId, href: "/tasks", label: "View updated task" };
  } else if (target.kind === "create_event") {
    const event = await createCalendarEventAction({
      title: String(payload.title ?? "Event"),
      date: String(payload.date ?? new Date().toISOString().slice(0, 10)),
      startTime: typeof payload.startTime === "string" ? payload.startTime : undefined,
      endTime: typeof payload.endTime === "string" ? payload.endTime : undefined,
      type: typeof payload.type === "string" ? payload.type : undefined,
      location: typeof payload.location === "string" ? payload.location : undefined,
    });
    resultRef = { id: event.id, href: "/calendar", label: `View event: ${event.title}` };
  } else if (target.kind === "save_note") {
    const noteRes = await createCaptureNote({
      kind: (payload.kind as "note" | "link" | "quote" | "checklist") ?? "note",
      title: typeof payload.title === "string" ? payload.title : null,
      content: String(payload.content ?? ""),
      sourceLink: typeof payload.sourceLink === "string" ? payload.sourceLink : null,
      tags: Array.isArray(payload.tags) ? (payload.tags as string[]) : [],
    });
    if (!noteRes.ok) {
      return { ok: false, status: 400, error: noteRes.error };
    }
    resultRef = {
      id: noteRes.data.id,
      href: `/notes/${noteRes.data.id}`,
      label: "Open saved note",
    };
  }

  const confirmedProposal: AssistantProposal = {
    ...target,
    status: "confirmed",
    resultRef,
  };
  const nextList = list.map((p, i) => (i === idx ? confirmedProposal : p));
  await prisma.aiMessage.update({
    where: { id: msg.id },
    data: { proposals: nextList as unknown as Prisma.InputJsonValue },
  });

  return { ok: true, proposal: confirmedProposal };
}

export async function dismissProposal(input: {
  messageId: string;
  proposalId: string;
  userId?: string;
}): Promise<
  | { ok: true; proposal: AssistantProposal }
  | { ok: false; status: number; error: string }
> {
  const userId = input.userId ?? (await getCurrentUserId());
  const msg = await prisma.aiMessage.findFirst({
    where: { id: input.messageId, userId },
    select: { id: true, proposals: true },
  });

  if (!msg || !Array.isArray(msg.proposals)) {
    return { ok: false, status: 404, error: "Proposal not found" };
  }

  const list = msg.proposals as unknown as AssistantProposal[];
  const idx = list.findIndex((p) => p.id === input.proposalId);
  if (idx === -1) {
    return { ok: false, status: 404, error: "Proposal not found" };
  }

  const target = list[idx];
  if (target.status === "confirmed") {
    return { ok: false, status: 409, error: "Cannot dismiss an already confirmed proposal" };
  }

  const dismissedProposal: AssistantProposal = { ...target, status: "dismissed" };
  const nextList = list.map((p, i) => (i === idx ? dismissedProposal : p));
  await prisma.aiMessage.update({
    where: { id: msg.id },
    data: { proposals: nextList as unknown as Prisma.InputJsonValue },
  });

  return { ok: true, proposal: dismissedProposal };
}
