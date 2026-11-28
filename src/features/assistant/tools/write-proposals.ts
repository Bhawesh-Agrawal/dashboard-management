import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ownerWhere } from "@/lib/owner-scoping";
import type { AssistantProposal, AssistantTool } from "./types";

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;

function makeProposal(
  kind: AssistantProposal["kind"],
  summary: string,
  payload: Record<string, unknown>
): AssistantProposal {
  return {
    id: crypto.randomUUID(),
    kind,
    summary,
    payload,
    status: "pending",
    expiresAt: new Date(Date.now() + FIFTEEN_MINUTES_MS).toISOString(),
    resultRef: null,
  };
}

const createTaskProposalSchema = z.object({
  title: z.string().trim().min(1).max(200),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  notes: z.string().max(1000).optional(),
  courseId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
});

export const proposeCreateTaskTool: AssistantTool<z.infer<typeof createTaskProposalSchema>> = {
  name: "propose_create_task",
  description:
    "Propose creating a new Task for the user to confirm. Does NOT execute immediately.",
  inputSchema: createTaskProposalSchema,
  parameters: {
    type: "object",
    required: ["title"],
    properties: {
      title: { type: "string" },
      dueDate: { type: "string", description: "YYYY-MM-DD" },
      priority: { type: "number", enum: [1, 2, 3] },
      notes: { type: "string" },
      courseId: { type: "string" },
      projectId: { type: "string" },
    },
  },
  async execute(_userId, input) {
    const proposal = makeProposal(
      "create_task",
      `Create task: "${input.title}"${input.dueDate ? ` (due ${input.dueDate})` : ""}`,
      input
    );
    return {
      data: {
        proposed: true,
        proposalId: proposal.id,
        summary: proposal.summary,
        note: "Proposal created. Ask the owner to confirm in the UI.",
      },
      proposals: [proposal],
    };
  },
};

const updateTaskProposalSchema = z.object({
  taskId: z.string().min(1),
  action: z.enum(["complete", "reschedule"]),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const proposeUpdateTaskTool: AssistantTool<z.infer<typeof updateTaskProposalSchema>> = {
  name: "propose_update_task",
  description:
    "Propose completing or rescheduling an existing Task for the user to confirm.",
  inputSchema: updateTaskProposalSchema,
  parameters: {
    type: "object",
    required: ["taskId", "action"],
    properties: {
      taskId: { type: "string" },
      action: { type: "string", enum: ["complete", "reschedule"] },
      dueDate: { type: "string", description: "Required when action is reschedule (YYYY-MM-DD)" },
    },
  },
  async execute(userId, input) {
    const task = await prisma.task.findFirst({
      where: { id: input.taskId, ...ownerWhere(userId) },
      select: { id: true, title: true },
    });
    if (!task) {
      return { data: { error: "Task not found" } };
    }
    const summary =
      input.action === "complete"
        ? `Mark task "${task.title}" as completed`
        : `Reschedule "${task.title}" to ${input.dueDate ?? "new date"}`;
    const proposal = makeProposal("update_task", summary, {
      taskId: task.id,
      action: input.action,
      dueDate: input.dueDate,
    });
    return {
      data: { proposed: true, proposalId: proposal.id, summary },
      proposals: [proposal],
    };
  },
};

const createEventProposalSchema = z.object({
  title: z.string().trim().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  type: z.enum(["exam", "event", "birthday", "holiday", "other"]).optional(),
  location: z.string().max(200).optional(),
});

export const proposeCreateEventTool: AssistantTool<z.infer<typeof createEventProposalSchema>> = {
  name: "propose_create_event",
  description: "Propose adding a calendar event for the user to confirm.",
  inputSchema: createEventProposalSchema,
  parameters: {
    type: "object",
    required: ["title", "date"],
    properties: {
      title: { type: "string" },
      date: { type: "string", description: "YYYY-MM-DD" },
      startTime: { type: "string", description: "HH:MM" },
      endTime: { type: "string", description: "HH:MM" },
      type: { type: "string", enum: ["exam", "event", "birthday", "holiday", "other"] },
      location: { type: "string" },
    },
  },
  async execute(_userId, input) {
    const proposal = makeProposal(
      "create_event",
      `Add event "${input.title}" on ${input.date}${input.startTime ? ` at ${input.startTime}` : ""}`,
      input
    );
    return {
      data: { proposed: true, proposalId: proposal.id, summary: proposal.summary },
      proposals: [proposal],
    };
  },
};

const saveNoteProposalSchema = z.object({
  kind: z.enum(["note", "link", "quote", "checklist"]).default("note"),
  title: z.string().max(200).optional(),
  content: z.string().trim().min(1).max(4000),
  sourceLink: z.string().url().optional(),
  tags: z.array(z.string()).max(10).optional(),
});

export const proposeSaveNoteTool: AssistantTool<z.infer<typeof saveNoteProposalSchema>> = {
  name: "propose_save_note",
  description: "Propose saving a note, link, quote, or checklist to the Notes inbox.",
  inputSchema: saveNoteProposalSchema,
  parameters: {
    type: "object",
    required: ["content"],
    properties: {
      kind: { type: "string", enum: ["note", "link", "quote", "checklist"] },
      title: { type: "string" },
      content: { type: "string" },
      sourceLink: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
    },
  },
  async execute(_userId, input) {
    const label = input.title || input.content.slice(0, 60);
    const proposal = makeProposal("save_note", `Save ${input.kind}: "${label}"`, input);
    return {
      data: { proposed: true, proposalId: proposal.id, summary: proposal.summary },
      proposals: [proposal],
    };
  },
};
