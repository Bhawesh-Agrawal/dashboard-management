import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ownerWhere } from "@/lib/owner-scoping";
import { formatDateOnly, getTodayInTimezone } from "@/lib/timezone";
import { getUserTimezone } from "@/lib/timezone-server";
import { tokenizeSearchQuery, type AssistantTool } from "./types";

const listTasksSchema = z.object({
  status: z.enum(["open", "done", "all"]).optional(),
  dueFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dueTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  course: z.string().optional(),
  project: z.string().optional(),
  text: z.string().optional(),
  limit: z.number().int().min(1).max(30).optional(),
});

export const listTasksTool: AssistantTool<z.infer<typeof listTasksSchema>> = {
  name: "list_tasks",
  description:
    "List tasks filtered by status (open, done, all), due date range (YYYY-MM-DD), course name/code, project name, or search text.",
  inputSchema: listTasksSchema,
  parameters: {
    type: "object",
    properties: {
      status: { type: "string", enum: ["open", "done", "all"] },
      dueFrom: { type: "string" },
      dueTo: { type: "string" },
      course: { type: "string" },
      project: { type: "string" },
      text: { type: "string" },
      limit: { type: "number" },
    },
  },
  async execute(userId, input) {
    const andFilters: Prisma.TaskWhereInput[] = [ownerWhere(userId)];

    if (input.status && input.status !== "all") {
      andFilters.push({ status: input.status });
    } else if (!input.status) {
      andFilters.push({ status: "open" });
    }

    if (input.dueFrom || input.dueTo) {
      andFilters.push({
        dueDate: {
          ...(input.dueFrom ? { gte: new Date(`${input.dueFrom}T00:00:00.000Z`) } : {}),
          ...(input.dueTo ? { lte: new Date(`${input.dueTo}T23:59:59.999Z`) } : {}),
        },
      });
    }

    if (input.course?.trim()) {
      const q = input.course.trim();
      andFilters.push({
        course: {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { code: { contains: q, mode: "insensitive" } },
          ],
        },
      });
    }

    if (input.project?.trim()) {
      andFilters.push({
        project: { name: { contains: input.project.trim(), mode: "insensitive" } },
      });
    }

    if (input.text?.trim()) {
      const q = input.text.trim();
      andFilters.push({
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { notes: { contains: q, mode: "insensitive" } },
        ],
      });
    }

    const tasks = await prisma.task.findMany({
      where: { AND: andFilters },
      orderBy: [{ dueDate: "asc" }, { priority: "asc" }],
      take: input.limit ?? 20,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        course: { select: { name: true, code: true } },
        project: { select: { name: true } },
      },
    });

    return {
      data: {
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate ? formatDateOnly(t.dueDate) : null,
          course: t.course ? t.course.code || t.course.name : null,
          project: t.project?.name ?? null,
        })),
      },
      sources: tasks.slice(0, 6).map((t) => ({
        type: "task" as const,
        id: t.id,
        title: t.title,
        href: "/tasks",
      })),
    };
  },
};

const deadlinesSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const listDeadlinesTool: AssistantTool<z.infer<typeof deadlinesSchema>> = {
  name: "list_deadlines",
  description: "List upcoming task due dates and course assessments in a date range (YYYY-MM-DD).",
  inputSchema: deadlinesSchema,
  parameters: {
    type: "object",
    required: ["from", "to"],
    properties: {
      from: { type: "string" },
      to: { type: "string" },
    },
  },
  async execute(userId, input) {
    const start = new Date(`${input.from}T00:00:00.000Z`);
    const end = new Date(`${input.to}T23:59:59.999Z`);

    const [tasks, assessments] = await Promise.all([
      prisma.task.findMany({
        where: {
          ...ownerWhere(userId),
          status: "open",
          dueDate: { gte: start, lte: end },
        },
        select: { id: true, title: true, dueDate: true, priority: true },
        orderBy: { dueDate: "asc" },
        take: 15,
      }),
      prisma.assessment.findMany({
        where: {
          course: { semester: ownerWhere(userId) },
          obtainedMarks: null,
          date: { gte: start, lte: end },
        },
        select: {
          id: true,
          componentType: true,
          date: true,
          maxMarks: true,
          course: { select: { id: true, name: true, code: true } },
        },
        orderBy: { date: "asc" },
        take: 15,
      }),
    ]);

    return {
      data: {
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          dueDate: t.dueDate ? formatDateOnly(t.dueDate) : null,
          priority: t.priority,
        })),
        assessments: assessments.map((a) => ({
          id: a.id,
          title: `${a.course.code || a.course.name} ${a.componentType}`,
          type: a.componentType,
          course: a.course.code || a.course.name,
          dueDate: a.date ? formatDateOnly(a.date) : null,
          maxMarks: a.maxMarks,
        })),
      },
      sources: [
        ...tasks.slice(0, 4).map((t) => ({
          type: "task" as const,
          id: t.id,
          title: t.title,
          href: "/tasks",
        })),
        ...assessments.slice(0, 4).map((a) => ({
          type: "course" as const,
          id: a.course.id,
          title: `${a.course.code || a.course.name}: ${a.componentType}`,
          href: `/courses/${a.course.id}`,
        })),
      ],
    };
  },
};

const searchNotesSchema = z.object({
  query: z.string().min(1),
  kind: z.enum(["note", "link", "quote", "meeting", "checklist"]).optional(),
  tag: z.string().optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

export const searchNotesTool: AssistantTool<z.infer<typeof searchNotesSchema>> = {
  name: "search_notes",
  description:
    "Search the user's notes and captures (links, quotes, meeting minutes, steps) using tokenized keywords over title, content, URL, and tags.",
  inputSchema: searchNotesSchema,
  parameters: {
    type: "object",
    required: ["query"],
    properties: {
      query: { type: "string" },
      kind: { type: "string", enum: ["note", "link", "quote", "meeting", "checklist"] },
      tag: { type: "string" },
      limit: { type: "number" },
    },
  },
  async execute(userId, input) {
    const tokens = tokenizeSearchQuery(input.query);
    const andConditions: Prisma.NoteWhereInput[] = [
      ownerWhere(userId),
      { isDocumentLibraryEntry: false },
      { archivedAt: null },
    ];

    if (input.kind) {
      andConditions.push({ kind: input.kind });
    }
    if (input.tag?.trim()) {
      const cleaned = input.tag.trim().replace(/^#/, "");
      andConditions.push({ tags: { hasSome: [cleaned, cleaned.toLowerCase()] } });
    }

    if (tokens.length > 0) {
      andConditions.push({
        OR: tokens.flatMap((token) => [
          { title: { contains: token, mode: "insensitive" as const } },
          { content: { contains: token, mode: "insensitive" as const } },
          { sourceLink: { contains: token, mode: "insensitive" as const } },
          { originalUrl: { contains: token, mode: "insensitive" as const } },
          { tags: { has: token } },
        ]),
      });
    }

    const candidates = await prisma.note.findMany({
      where: { AND: andConditions },
      orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
      take: 40,
      select: {
        id: true,
        kind: true,
        title: true,
        content: true,
        sourceLink: true,
        tags: true,
        createdAt: true,
      },
    });

    const scored = candidates
      .map((n) => {
        const hay = `${n.title ?? ""} ${n.content} ${n.sourceLink ?? ""} ${n.tags.join(" ")}`.toLowerCase();
        const hits = tokens.reduce((acc, t) => acc + (hay.includes(t) ? 1 : 0), 0);
        return { note: n, hits };
      })
      .sort((a, b) => b.hits - a.hits)
      .slice(0, input.limit ?? 8);

    const items = scored.map(({ note: n }) => ({
      id: n.id,
      kind: n.kind,
      title: n.title || n.content.split(/\r?\n/)[0]?.slice(0, 80) || "Untitled",
      snippet: n.content.replace(/\s+/g, " ").slice(0, 140),
      url: n.sourceLink,
      tags: n.tags.slice(0, 5),
      createdAt: formatDateOnly(n.createdAt),
    }));

    return {
      data: { notes: items },
      sources: items.map((n) => ({
        type: "note" as const,
        id: n.id,
        title: n.title,
        href: `/notes/${n.id}`,
      })),
    };
  },
};

const getNoteSchema = z.object({ id: z.string().min(1) });

export const getNoteTool: AssistantTool<z.infer<typeof getNoteSchema>> = {
  name: "get_note",
  description: "Fetch a single note by id (up to 4000 chars), including meeting structure and link metadata.",
  inputSchema: getNoteSchema,
  parameters: {
    type: "object",
    required: ["id"],
    properties: { id: { type: "string" } },
  },
  async execute(userId, input) {
    const note = await prisma.note.findFirst({
      where: { id: input.id, ...ownerWhere(userId) },
      select: {
        id: true,
        kind: true,
        title: true,
        content: true,
        sourceLink: true,
        tags: true,
        meta: true,
        createdAt: true,
      },
    });
    if (!note) {
      return { data: { error: "Note not found" } };
    }

    const cappedContent =
      note.content.length > 4000
        ? `${note.content.slice(0, 3980)}… [truncated]`
        : note.content;

    return {
      data: {
        id: note.id,
        kind: note.kind,
        title: note.title,
        content: cappedContent,
        sourceLink: note.sourceLink,
        tags: note.tags,
        meta: note.meta,
        createdAt: formatDateOnly(note.createdAt),
      },
      sources: [
        {
          type: "note",
          id: note.id,
          title: note.title || cappedContent.split(/\r?\n/)[0]?.slice(0, 60) || "Note",
          href: `/notes/${note.id}`,
        },
      ],
    };
  },
};

export const listProjectsTool: AssistantTool<Record<string, never>> = {
  name: "list_projects",
  description: "List the user's projects with status and progress.",
  inputSchema: z.object({}),
  parameters: { type: "object", properties: {} },
  async execute(userId) {
    const projects = await prisma.project.findMany({
      where: { domain: ownerWhere(userId) },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        id: true,
        name: true,
        status: true,
        _count: { select: { tasks: true, milestones: true } },
      },
    });

    return {
      data: {
        projects: projects.map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          taskCount: p._count.tasks,
          milestoneCount: p._count.milestones,
        })),
      },
      sources: projects.slice(0, 5).map((p) => ({
        type: "project" as const,
        id: p.id,
        title: p.name,
        href: `/projects/${p.id}`,
      })),
    };
  },
};

const getProjectSchema = z.object({ id: z.string().min(1) });

export const getProjectTool: AssistantTool<z.infer<typeof getProjectSchema>> = {
  name: "get_project",
  description: "Get a project's details, milestones, and open tasks.",
  inputSchema: getProjectSchema,
  parameters: {
    type: "object",
    required: ["id"],
    properties: { id: { type: "string" } },
  },
  async execute(userId, input) {
    const project = await prisma.project.findFirst({
      where: { id: input.id, domain: ownerWhere(userId) },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        milestones: { select: { name: true, weight: true, isDone: true }, take: 10 },
        tasks: {
          where: { status: "open" },
          select: { id: true, title: true, status: true, dueDate: true },
          take: 10,
        },
      },
    });
    if (!project) return { data: { error: "Project not found" } };

    return {
      data: {
        id: project.id,
        name: project.name,
        description: project.description?.slice(0, 400) ?? null,
        status: project.status,
        milestones: project.milestones.map((m) => ({
          name: m.name,
          weight: m.weight,
          isDone: m.isDone,
        })),
        openTasks: project.tasks.map((t) => ({
          id: t.id,
          title: t.title,
          dueDate: t.dueDate ? formatDateOnly(t.dueDate) : null,
        })),
      },
      sources: [{ type: "project", id: project.id, title: project.name, href: `/projects/${project.id}` }],
    };
  },
};

const briefSchema = z.object({
  kind: z.enum(["morning", "midday", "evening"]).optional(),
});

export const getLatestBriefTool: AssistantTool<z.infer<typeof briefSchema>> = {
  name: "get_latest_brief",
  description: "Get the latest daily brief summary (morning, midday, or evening).",
  inputSchema: briefSchema,
  parameters: {
    type: "object",
    properties: { kind: { type: "string", enum: ["morning", "midday", "evening"] } },
  },
  async execute(userId, input) {
    const brief = await prisma.dailyBrief.findFirst({
      where: {
        userId,
        ...(input.kind ? { kind: input.kind } : {}),
      },
      orderBy: { generatedAt: "desc" },
      select: { id: true, kind: true, forDate: true, payload: true },
    });
    if (!brief) return { data: { brief: null } };

    const payloadObj =
      brief.payload && typeof brief.payload === "object"
        ? (brief.payload as { summary?: string; headline?: { text?: string } })
        : {};

    return {
      data: {
        id: brief.id,
        kind: brief.kind,
        forDate: formatDateOnly(brief.forDate),
        headline: payloadObj.headline?.text ?? null,
        summary: payloadObj.summary ?? null,
      },
      sources: [
        {
          type: "brief",
          id: brief.id,
          title: `${brief.kind} brief (${formatDateOnly(brief.forDate)})`,
          href: "/brief",
        },
      ],
    };
  },
};

export const getDsaSummaryTool: AssistantTool<Record<string, never>> = {
  name: "get_dsa_summary",
  description:
    "Read-only DSA tracker summary: due/overdue revisions, programme day, topic progress, last-7-day attempts, and weak topics.",
  inputSchema: z.object({}),
  parameters: { type: "object", properties: {} },
  async execute(userId) {
    const tz = await getUserTimezone(userId);
    const today = getTodayInTimezone(tz);
    const todayEnd = new Date(`${today}T23:59:59.999Z`);
    const todayStart = new Date(`${today}T00:00:00.000Z`);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [settings, dueRevisions, overdueRevisions, attemptsLast7Days, topics] = await Promise.all([
      prisma.dsaSettings.findUnique({
        where: { userId },
        select: { programmeStartDate: true, programmeLengthDays: true },
      }),
      prisma.dsaProblem.count({
        where: { userId, nextRevisionDate: { gte: todayStart, lte: todayEnd } },
      }),
      prisma.dsaProblem.count({
        where: { userId, nextRevisionDate: { lt: todayStart } },
      }),
      prisma.dsaAttempt.count({
        where: { userId, attemptedAt: { gte: sevenDaysAgo } },
      }),
      prisma.dsaTopic.findMany({
        where: { userId },
        select: {
          name: true,
          _count: { select: { problems: true } },
          problems: { select: { lastClassification: true }, take: 50 },
        },
        take: 15,
      }),
    ]);

    const programmeDay = settings
      ? Math.max(
          1,
          Math.floor(
            (Date.now() - settings.programmeStartDate.getTime()) / (24 * 60 * 60 * 1000)
          ) + 1
        )
      : null;

    const topicProgress = topics.map((t) => {
      const solved = t.problems.filter(
        (p) =>
          p.lastClassification === "independent" ||
          p.lastClassification === "effortful"
      ).length;
      return { name: t.name, total: t._count.problems, solved };
    });

    const weakTopics = topicProgress
      .filter((t) => t.total > 0 && t.solved / t.total < 0.5)
      .slice(0, 5)
      .map((t) => t.name);

    return {
      data: {
        programmeDay,
        dueRevisions,
        overdueRevisions,
        attemptsLast7Days,
        weakTopics,
        topicProgress: topicProgress.slice(0, 8),
      },
      sources: [{ type: "dsa", id: "dsa", title: "DSA Tracker", href: "/dsa" }],
    };
  },
};
