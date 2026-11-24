import { prisma } from "@/lib/prisma";
import type { GraphNode, GraphEdge, GraphResult, GraphNodeType } from "@/types";
import { getCurrentUserId } from "@/lib/auth";

/**
 * Knowledge Graph traversal function.
 *
 * Given a starting entity (Course, Task, Note, etc.), traverses its Prisma relations
 * up to N hops and returns a normalized { nodes, edges } shape.
 *
 * This is computed on-demand from existing foreign keys — no new database table,
 * no sync logic. The graph is always fresh because it reads from the real relations.
 */

type TraverseOptions = {
  /** Starting entity type */
  sourceType: GraphNodeType;
  /** Starting entity ID */
  sourceId: string;
  /** Max hops to traverse (default: 2) */
  maxHops?: number;
  /** Optional filter: only include these entity types in results */
  nodeTypes?: GraphNodeType[];
};

/**
 * Traverse the knowledge graph from a starting entity.
 * Returns connected nodes up to maxHops away.
 */
export async function traverseGraph(options: TraverseOptions): Promise<GraphResult> {
  const { sourceType, sourceId, maxHops = 2, nodeTypes } = options;
  const userId = await getCurrentUserId();

  const visited = new Set<string>();
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  async function hop(
    entityType: GraphNodeType,
    entityId: string,
    currentHop: number
  ): Promise<void> {
    const nodeKey = `${entityType}:${entityId}`;
    if (visited.has(nodeKey)) return;
    if (currentHop > maxHops) return;

    visited.add(nodeKey);

    // Fetch the entity
    const entity = await fetchEntity(entityType, entityId, userId);
    if (!entity) return;

    // Add node if it passes the filter
    if (!nodeTypes || nodeTypes.includes(entityType)) {
      nodes.push({ id: entityId, type: entityType, data: entity });
    }

    // Get connected entities for this node type
    const connections = await getConnections(entityType, entityId, userId);

    for (const conn of connections) {
      const targetKey = `${conn.type}:${conn.id}`;
      if (!visited.has(targetKey)) {
        edges.push({
          source: entityId,
          target: conn.id,
          relation: conn.relation,
        });
        // Recurse to next hop
        await hop(conn.type, conn.id, currentHop + 1);
      }
    }
  }

  await hop(sourceType, sourceId, 0);

  return { nodes, edges };
}

/**
 * Fetch a single entity by type and ID.
 */
async function fetchEntity(
  type: GraphNodeType,
  id: string,
  userId: string
): Promise<Record<string, unknown> | null> {
  switch (type) {
    case "semester":
      return prisma.semester.findUnique({ where: { id } });
    case "course":
      return prisma.course.findUnique({ where: { id } });
    case "task":
      return prisma.task.findUnique({ where: { id, OR: [{ userId }, { userId: null }] } });
    case "note":
      return prisma.note.findUnique({ where: { id } });
    case "assessment":
      return prisma.assessment.findUnique({ where: { id } });
    case "routine":
      return prisma.routine.findUnique({ where: { id } });
    case "event":
      return prisma.event.findUnique({ where: { id } });
    case "quote":
      return prisma.quote.findUnique({ where: { id } });
    case "classSchedule":
      return prisma.classSchedule.findUnique({ where: { id } });
    case "attendanceRecord":
      return prisma.attendanceRecord.findUnique({ where: { id } });
    case "domain":
      return prisma.domain.findUnique({ where: { id } });
    case "project":
      return prisma.project.findUnique({ where: { id } });
    case "milestone":
      return prisma.milestone.findUnique({ where: { id } });
    case "resource":
      return prisma.resource.findUnique({ where: { id } });
    default:
      return null;
  }
}

type Connection = {
  id: string;
  type: GraphNodeType;
  relation: string;
};

/**
 * Get all connected entities for a given entity.
 * Returns outbound connections only (outgoing edges).
 */
async function getConnections(
  type: GraphNodeType,
  id: string,
  userId: string
): Promise<Connection[]> {
  switch (type) {
    case "semester":
      return getSemesterConnections(id);
    case "course":
      return getCourseConnections(id, userId);
    case "task":
      return getTaskConnections(id);
    case "note":
      return getNoteConnections(id);
    case "assessment":
      return getAssessmentConnections(id);
    case "routine":
      return [];
    case "event":
      return [];
    case "quote":
      return [];
    case "classSchedule":
      return getClassScheduleConnections(id);
    case "attendanceRecord":
      return getAttendanceRecordConnections(id);
    case "domain":
      return getDomainConnections(id);
    case "project":
      return getProjectConnections(id, userId);
    case "milestone":
      return getMilestoneConnections(id);
    case "resource":
      return [];
    default:
      return [];
  }
}

async function getSemesterConnections(semesterId: string): Promise<Connection[]> {
  const courses = await prisma.course.findMany({
    where: { semesterId },
    select: { id: true },
  });

  return courses.map((c) => ({
    id: c.id,
    type: "course" as GraphNodeType,
    relation: "has_course",
  }));
}

async function getCourseConnections(courseId: string, userId: string): Promise<Connection[]> {
  const [tasks, notes, assessments, schedules, attendanceRecords] = await Promise.all([
    prisma.task.findMany({ where: { courseId, OR: [{ userId }, { userId: null }] }, select: { id: true } }),
    prisma.note.findMany({ where: { courseId }, select: { id: true } }),
    prisma.assessment.findMany({ where: { courseId }, select: { id: true } }),
    prisma.classSchedule.findMany({ where: { courseId }, select: { id: true } }),
    prisma.attendanceRecord.findMany({ where: { courseId }, select: { id: true } }),
  ]);

  // Also get the parent semester
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { semesterId: true },
  });

  const connections: Connection[] = [];

  if (course) {
    connections.push({
      id: course.semesterId,
      type: "semester",
      relation: "belongs_to",
    });
  }

  for (const t of tasks) {
    connections.push({ id: t.id, type: "task", relation: "has_task" });
  }
  for (const n of notes) {
    connections.push({ id: n.id, type: "note", relation: "has_note" });
  }
  for (const a of assessments) {
    connections.push({ id: a.id, type: "assessment", relation: "has_assessment" });
  }
  for (const s of schedules) {
    connections.push({ id: s.id, type: "classSchedule", relation: "has_schedule" });
  }
  for (const ar of attendanceRecords) {
    connections.push({ id: ar.id, type: "attendanceRecord", relation: "has_attendance" });
  }

  return connections;
}

async function getTaskConnections(taskId: string): Promise<Connection[]> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { courseId: true, projectId: true },
  });

  const connections: Connection[] = [];

  if (task?.courseId) {
    connections.push({ id: task.courseId, type: "course", relation: "belongs_to" });
  }
  if (task?.projectId) {
    connections.push({ id: task.projectId, type: "project", relation: "belongs_to" });
  }

  return connections;
}

async function getNoteConnections(noteId: string): Promise<Connection[]> {
  const note = await prisma.note.findUnique({
    where: { id: noteId },
    select: { courseId: true },
  });

  if (note?.courseId) {
    return [
      { id: note.courseId, type: "course", relation: "belongs_to" },
    ];
  }
  return [];
}

async function getAssessmentConnections(assessmentId: string): Promise<Connection[]> {
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { courseId: true },
  });

  if (assessment?.courseId) {
    return [
      { id: assessment.courseId, type: "course", relation: "belongs_to" },
    ];
  }
  return [];
}

async function getClassScheduleConnections(scheduleId: string): Promise<Connection[]> {
  const schedule = await prisma.classSchedule.findUnique({
    where: { id: scheduleId },
    select: { courseId: true },
  });

  if (schedule?.courseId) {
    return [
      { id: schedule.courseId, type: "course", relation: "belongs_to" },
    ];
  }
  return [];
}

async function getAttendanceRecordConnections(recordId: string): Promise<Connection[]> {
  const record = await prisma.attendanceRecord.findUnique({
    where: { id: recordId },
    select: { courseId: true },
  });

  if (record?.courseId) {
    return [
      { id: record.courseId, type: "course", relation: "belongs_to" },
    ];
  }
  return [];
}

async function getDomainConnections(domainId: string): Promise<Connection[]> {
  const projects = await prisma.project.findMany({
    where: { domainId },
    select: { id: true },
  });

  return projects.map((p) => ({
    id: p.id,
    type: "project" as GraphNodeType,
    relation: "has_project",
  }));
}

async function getProjectConnections(projectId: string, userId: string): Promise<Connection[]> {
  const [project, milestones, tasks] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: { domainId: true },
    }),
    prisma.milestone.findMany({ where: { projectId }, select: { id: true } }),
    prisma.task.findMany({ where: { projectId, OR: [{ userId }, { userId: null }] }, select: { id: true } }),
  ]);

  const connections: Connection[] = [];

  if (project?.domainId) {
    connections.push({
      id: project.domainId,
      type: "domain",
      relation: "belongs_to",
    });
  }

  for (const m of milestones) {
    connections.push({ id: m.id, type: "milestone", relation: "has_milestone" });
  }
  for (const t of tasks) {
    connections.push({ id: t.id, type: "task", relation: "has_task" });
  }

  return connections;
}

async function getMilestoneConnections(milestoneId: string): Promise<Connection[]> {
  const milestone = await prisma.milestone.findUnique({
    where: { id: milestoneId },
    select: { projectId: true },
  });

  if (milestone?.projectId) {
    return [
      { id: milestone.projectId, type: "project", relation: "belongs_to" },
    ];
  }
  return [];
}

/**
 * Get the full graph context for a course — used by the Ask feature
 * to assemble context for AI queries about a specific course.
 */
export async function getCourseGraphContext(courseId: string): Promise<GraphResult> {
  return traverseGraph({
    sourceType: "course",
    sourceId: courseId,
    maxHops: 1, // Course → its direct children only
  });
}

/**
 * Search for entities by name/title/content and return their graph context.
 * Used by the Ask feature to find relevant entities and their connections.
 *
 * Now includes global context: all open tasks, today's routines, and active semester courses
 * regardless of query match, so the AI has a complete picture.
 */
export async function searchEntitiesForContext(
  query: string
): Promise<GraphResult> {
  const results: GraphResult = { nodes: [], edges: [] };
  const userId = await getCurrentUserId();

  // Search courses by name or code
  const courses = await prisma.course.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { code: { contains: query, mode: "insensitive" } },
      ],
    },
    take: 3,
  });

  for (const course of courses) {
    const ctx = await getCourseGraphContext(course.id);
    mergeGraphResults(results, ctx);
  }

  // Search tasks by title (include unlinked tasks)
  const tasks = await prisma.task.findMany({
    where: {
      AND: [
        { OR: [{ userId }, { userId: null }] },
        {
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { notes: { contains: query, mode: "insensitive" } },
          ],
        },
      ],
    },
    take: 5,
  });

  for (const task of tasks) {
    const ctx = await traverseGraph({
      sourceType: "task",
      sourceId: task.id,
      maxHops: 1,
    });
    mergeGraphResults(results, ctx);
  }

  // Search notes by content
  const notes = await prisma.note.findMany({
    where: { content: { contains: query, mode: "insensitive" } },
    take: 5,
  });

  for (const note of notes) {
    const ctx = await traverseGraph({
      sourceType: "note",
      sourceId: note.id,
      maxHops: 1,
    });
    mergeGraphResults(results, ctx);
  }

  // Search routines by name
  const routines = await prisma.routine.findMany({
    where: { name: { contains: query, mode: "insensitive" } },
    take: 3,
  });

  for (const routine of routines) {
    if (!results.nodes.some((n) => n.id === routine.id && n.type === "routine")) {
      results.nodes.push({ id: routine.id, type: "routine", data: routine });
    }
  }

  // Search quotes by text
  const quotes = await prisma.quote.findMany({
    where: {
      OR: [
        { text: { contains: query, mode: "insensitive" } },
        { source: { contains: query, mode: "insensitive" } },
      ],
    },
    take: 3,
  });

  for (const quote of quotes) {
    if (!results.nodes.some((n) => n.id === quote.id && n.type === "quote")) {
      results.nodes.push({ id: quote.id, type: "quote", data: quote });
    }
  }

  // Search projects by name
  const projects = await prisma.project.findMany({
    where: { name: { contains: query, mode: "insensitive" } },
    take: 3,
  });

  for (const project of projects) {
    const ctx = await traverseGraph({
      sourceType: "project",
      sourceId: project.id,
      maxHops: 1,
    });
    mergeGraphResults(results, ctx);
  }

  // Search resources by title or notes
  const resources = await prisma.resource.findMany({
    where: {
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { notes: { contains: query, mode: "insensitive" } },
      ],
    },
    take: 3,
  });

  for (const resource of resources) {
    if (!results.nodes.some((n) => n.id === resource.id && n.type === "resource")) {
      results.nodes.push({ id: resource.id, type: "resource", data: resource });
    }
  }

  // Add global context: all open tasks (if not already included)
  const openTasks = await prisma.task.findMany({
    where: { status: "open", OR: [{ userId }, { userId: null }] },
    take: 10,
    orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
  });

  for (const task of openTasks) {
    if (!results.nodes.some((n) => n.id === task.id && n.type === "task")) {
      results.nodes.push({ id: task.id, type: "task", data: task });
      // Add edge to course if linked
      if (task.courseId) {
        const edgeKey = `${task.id}:${task.courseId}:belongs_to`;
        if (!results.edges.some((e) => `${e.source}:${e.target}:${e.relation}` === edgeKey)) {
          results.edges.push({
            source: task.id,
            target: task.courseId,
            relation: "belongs_to",
          });
        }
      }
    }
  }

  // Add global context: today's routines with streaks
  const dayOfWeek = getDayOfWeekEnum(new Date().getDay());
  const todayRoutines = await prisma.routine.findMany({
    where: {
      activeDays: { has: dayOfWeek as "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN" },
    },
    take: 10,
  });

  for (const routine of todayRoutines) {
    if (!results.nodes.some((n) => n.id === routine.id && n.type === "routine")) {
      results.nodes.push({ id: routine.id, type: "routine", data: routine });
    }
  }

  return results;
}

/**
 * Get the day of week enum value from a JavaScript day number.
 */
function getDayOfWeekEnum(day: number): string {
  const map = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return map[day];
}

/**
 * Merge two graph results, deduplicating nodes and edges.
 */
function mergeGraphResults(target: GraphResult, source: GraphResult): void {
  const nodeIds = new Set(target.nodes.map((n) => n.id));
  for (const node of source.nodes) {
    if (!nodeIds.has(node.id)) {
      target.nodes.push(node);
      nodeIds.add(node.id);
    }
  }

  const edgeKeys = new Set(
    target.edges.map((e) => `${e.source}:${e.target}:${e.relation}`)
  );
  for (const edge of source.edges) {
    const key = `${edge.source}:${edge.target}:${edge.relation}`;
    if (!edgeKeys.has(key)) {
      target.edges.push(edge);
      edgeKeys.add(key);
    }
  }
}

/**
 * Format a graph result into a readable context string for AI consumption.
 * This is used by the Ask feature to build the context prompt.
 */
export function formatGraphContext(graph: GraphResult): string {
  const lines: string[] = [];

  // Group nodes by type
  const byType = new Map<GraphNodeType, GraphNode[]>();
  for (const node of graph.nodes) {
    const existing = byType.get(node.type) || [];
    existing.push(node);
    byType.set(node.type, existing);
  }

  // Format each group
  const typeLabels: Record<GraphNodeType, string> = {
    semester: "Semesters",
    course: "Courses",
    task: "Tasks",
    note: "Notes",
    assessment: "Assessments",
    routine: "Routines",
    event: "Events",
    quote: "Quotes",
    classSchedule: "Class Schedules",
    attendanceRecord: "Attendance Records",
    domain: "Domains",
    project: "Projects",
    milestone: "Milestones",
    resource: "Resources",
  };

  for (const [type, nodes] of byType) {
    lines.push(`## ${typeLabels[type] || type}`);
    for (const node of nodes) {
      const summary = summarizeNode(node);
      lines.push(`- ${summary}`);
    }
    lines.push("");
  }

  // Format edges
  if (graph.edges.length > 0) {
    lines.push("## Relationships");
    for (const edge of graph.edges) {
      const sourceNode = graph.nodes.find((n) => n.id === edge.source);
      const targetNode = graph.nodes.find((n) => n.id === edge.target);
      if (sourceNode && targetNode) {
        lines.push(
          `- ${summarizeNode(sourceNode)} —[${edge.relation}]→ ${summarizeNode(targetNode)}`
        );
      }
    }
  }

  return lines.join("\n");
}

/**
 * Create a short summary string for a node.
 */
function summarizeNode(node: GraphNode): string {
  const d = node.data;
  switch (node.type) {
    case "course":
      return `${d.name}${d.code ? ` (${d.code})` : ""}`;
    case "task":
      return `Task: ${d.title}${d.dueDate ? ` (due ${new Date(d.dueDate).toLocaleDateString()})` : ""}`;
    case "note":
      return `Note: ${(d.content as string)?.slice(0, 80) || "empty"}...`;
    case "assessment":
      return `${d.componentType.replace("_", "/")}: ${d.obtainedMarks ?? "?"}/${d.maxMarks}`;
    case "semester":
      return d.name;
    case "routine":
      return `Routine: ${d.name}`;
    case "event":
      return `Event: ${d.title}`;
    case "quote":
      return `Quote: "${(d.text as string)?.slice(0, 60)}..."`;
    case "classSchedule":
      return `Class: ${d.dayOfWeek} ${d.startTime}-${d.endTime}`;
    case "attendanceRecord":
      return `Attendance: ${d.date} (${d.status})`;
    case "domain":
      return `Domain: ${d.name}`;
    case "project":
      return `Project: ${d.name}`;
    case "milestone":
      return `Milestone: ${d.name}${d.isDone ? " (done)" : ""}`;
    case "resource":
      return `Resource: ${d.title}`;
    default:
      return `${node.type}:${node.id}`;
  }
}
