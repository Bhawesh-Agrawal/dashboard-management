import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { ownerWhere } from "@/lib/owner-scoping";
import { getUserTimezone } from "@/lib/timezone-server";
import { getTodayInTimezone, getTimeInTimezone } from "@/lib/timezone";
import { getCurrentSemester } from "@/features/semesters/lib/current";
import { getRegisteredTools } from "../tools/registry";
import { runAssistantAgent, type AgentStateSnapshot, type RunAgentResult } from "./agent";
import {
  appendAiMessage,
  checkAssistantQuota,
  createConversation,
  getConversationWithMessages,
} from "./persistence";

export async function buildStateSnapshot(
  userId: string,
  focusNoteId?: string | null
): Promise<AgentStateSnapshot> {
  const tz = await getUserTimezone(userId);
  const today = getTodayInTimezone(tz);
  const nowHm = getTimeInTimezone(tz);
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: tz,
  }).format(new Date());

  const semester = await getCurrentSemester(userId);
  const courses = semester
    ? await prisma.course.findMany({
        where: { semesterId: semester.id, semester: ownerWhere(userId) },
        select: { name: true, code: true },
        orderBy: { name: "asc" },
        take: 15,
      })
    : [];

  return {
    nowIso: `${today} ${nowHm}`,
    weekday,
    timezone: tz,
    semesterName: semester?.name ?? null,
    courseNames: courses.map((c) => (c.code ? `${c.code} ${c.name}` : c.name)),
    focusNoteId: focusNoteId ?? null,
  };
}

export async function askAssistantOnce(input: {
  message: string;
  conversationId?: string;
  focusNoteId?: string;
  userId?: string;
}): Promise<
  | { ok: true; conversationId: string; messageId: string; result: RunAgentResult }
  | { ok: false; error: string }
> {
  const userId = input.userId ?? (await getCurrentUserId());
  const quota = await checkAssistantQuota(userId);
  if (!quota.allowed) {
    return { ok: false, error: quota.message };
  }

  let conversationId = input.conversationId;
  let history: Array<{ role: "user" | "assistant"; content: string }> = [];

  if (conversationId) {
    const conv = await getConversationWithMessages(conversationId, userId);
    if (!conv) {
      return { ok: false, error: "Conversation not found" };
    }
    history = conv.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
  } else {
    const created = await createConversation(userId, input.message);
    conversationId = created.id;
  }

  await appendAiMessage({
    conversationId,
    userId,
    role: "user",
    content: input.message,
  });

  const snapshot = await buildStateSnapshot(userId, input.focusNoteId);
  const tools = getRegisteredTools({ dsaEnabled: quota.prefs.assistantDsaAccess });

  const result = await runAssistantAgent({
    userId,
    userMessage: input.message,
    history,
    snapshot,
    tools,
    stream: false,
  });

  const savedAssistant = await appendAiMessage({
    conversationId,
    userId,
    role: "assistant",
    content: result.answer,
    toolCalls: result.toolsUsed,
    sources: result.sources,
    proposals: result.proposals,
    usage: result.usage,
  });

  return {
    ok: true,
    conversationId,
    messageId: savedAssistant.id,
    result,
  };
}
