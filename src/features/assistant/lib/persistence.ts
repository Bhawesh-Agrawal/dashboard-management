import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { getUserTimezone } from "@/lib/timezone-server";
import { getTodayInTimezone } from "@/lib/timezone";
import type { TokenUsage } from "@/lib/ai/openrouter";
import type { AssistantProposal, AssistantSource } from "../tools/types";

export const DEFAULT_DAILY_TOKEN_CAP = 200_000;
export const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
export const RATE_LIMIT_MAX_REQUESTS = 20;
export const MAX_CONVERSATIONS_PER_USER = 50;

export function buildConversationTitle(firstMessage: string): string {
  const cleaned = firstMessage.replace(/\s+/g, " ").trim();
  if (!cleaned) return "New conversation";
  return cleaned.length <= 60 ? cleaned : `${cleaned.slice(0, 57)}...`;
}

export async function getAiPreferences(userId?: string) {
  const effectiveUserId = userId ?? (await getCurrentUserId());
  const pref = await prisma.userDashboardPreference.findUnique({
    where: { userId: effectiveUserId },
    select: {
      assistantEnabled: true,
      assistantDsaAccess: true,
      aiDailyTokenCap: true,
    },
  });
  return {
    assistantEnabled: pref?.assistantEnabled ?? true,
    assistantDsaAccess: pref?.assistantDsaAccess ?? false,
    aiDailyTokenCap: pref?.aiDailyTokenCap ?? DEFAULT_DAILY_TOKEN_CAP,
  };
}

export async function updateAiPreferences(input: {
  assistantEnabled?: boolean;
  assistantDsaAccess?: boolean;
  aiDailyTokenCap?: number;
}) {
  const userId = await getCurrentUserId();
  const cap =
    input.aiDailyTokenCap !== undefined
      ? Math.min(Math.max(1000, Math.round(input.aiDailyTokenCap)), 2_000_000)
      : undefined;

  return prisma.userDashboardPreference.upsert({
    where: { userId },
    update: {
      ...(input.assistantEnabled !== undefined
        ? { assistantEnabled: input.assistantEnabled }
        : {}),
      ...(input.assistantDsaAccess !== undefined
        ? { assistantDsaAccess: input.assistantDsaAccess }
        : {}),
      ...(cap !== undefined ? { aiDailyTokenCap: cap } : {}),
    },
    create: {
      userId,
      assistantEnabled: input.assistantEnabled ?? true,
      assistantDsaAccess: input.assistantDsaAccess ?? false,
      aiDailyTokenCap: cap ?? DEFAULT_DAILY_TOKEN_CAP,
    },
    select: {
      assistantEnabled: true,
      assistantDsaAccess: true,
      aiDailyTokenCap: true,
    },
  });
}

export async function listConversations(userId?: string) {
  const effectiveUserId = userId ?? (await getCurrentUserId());
  return prisma.aiConversation.findMany({
    where: { userId: effectiveUserId },
    orderBy: { updatedAt: "desc" },
    take: MAX_CONVERSATIONS_PER_USER,
    select: {
      id: true,
      title: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getConversationWithMessages(
  conversationId: string,
  userId?: string
) {
  const effectiveUserId = userId ?? (await getCurrentUserId());
  const conv = await prisma.aiConversation.findFirst({
    where: { id: conversationId, userId: effectiveUserId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
  return conv;
}

export async function createConversation(userId: string, firstMessage: string) {
  return prisma.aiConversation.create({
    data: {
      userId,
      title: buildConversationTitle(firstMessage),
    },
    select: { id: true, title: true, createdAt: true, updatedAt: true },
  });
}

export async function appendAiMessage(input: {
  conversationId: string;
  userId: string;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls?: unknown;
  sources?: AssistantSource[];
  proposals?: AssistantProposal[];
  usage?: TokenUsage;
}) {
  const msg = await prisma.aiMessage.create({
    data: {
      conversationId: input.conversationId,
      userId: input.userId,
      role: input.role,
      content: input.content,
      ...(input.toolCalls !== undefined
        ? { toolCalls: input.toolCalls as Prisma.InputJsonValue }
        : {}),
      ...(input.sources !== undefined
        ? { sources: input.sources as unknown as Prisma.InputJsonValue }
        : {}),
      ...(input.proposals !== undefined
        ? { proposals: input.proposals as unknown as Prisma.InputJsonValue }
        : {}),
      ...(input.usage !== undefined
        ? { usage: input.usage as unknown as Prisma.InputJsonValue }
        : {}),
    },
  });

  await prisma.aiConversation.update({
    where: { id: input.conversationId },
    data: { updatedAt: new Date() },
  });

  return msg;
}

export async function deleteConversation(conversationId: string, userId?: string) {
  const effectiveUserId = userId ?? (await getCurrentUserId());
  const existing = await prisma.aiConversation.findFirst({
    where: { id: conversationId, userId: effectiveUserId },
    select: { id: true },
  });
  if (!existing) return { ok: false as const, error: "Conversation not found" };
  await prisma.aiConversation.delete({ where: { id: conversationId } });
  return { ok: true as const };
}

export async function deleteAllConversations(userId?: string) {
  const effectiveUserId = userId ?? (await getCurrentUserId());
  const res = await prisma.aiConversation.deleteMany({
    where: { userId: effectiveUserId },
  });
  return { ok: true as const, deleted: res.count };
}

export async function purgeOldConversationsForUser(
  userId: string,
  keepLatest: number = MAX_CONVERSATIONS_PER_USER
): Promise<number> {
  const stale = await prisma.aiConversation.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    skip: keepLatest,
    select: { id: true },
  });
  if (stale.length === 0) return 0;
  const res = await prisma.aiConversation.deleteMany({
    where: { id: { in: stale.map((s) => s.id) }, userId },
  });
  return res.count;
}

export async function purgeOldConversationsAllUsers(): Promise<number> {
  const users = await prisma.aiConversation.findMany({
    distinct: ["userId"],
    select: { userId: true },
  });
  let deleted = 0;
  for (const u of users) {
    deleted += await purgeOldConversationsForUser(u.userId);
  }
  return deleted;
}

export async function getTodayAiUsage(userId: string): Promise<{
  requestsToday: number;
  tokensToday: number;
  requestsLast10Min: number;
}> {
  const tz = await getUserTimezone(userId);
  const today = getTodayInTimezone(tz);
  const todayStart = new Date(`${today}T00:00:00.000Z`);
  const tenMinAgo = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);

  const [todayMessages, requestsLast10Min] = await Promise.all([
    prisma.aiMessage.findMany({
      where: {
        userId,
        createdAt: { gte: todayStart },
        role: { in: ["user", "assistant"] },
      },
      select: { role: true, usage: true },
    }),
    prisma.aiMessage.count({
      where: {
        userId,
        role: "user",
        createdAt: { gte: tenMinAgo },
      },
    }),
  ]);

  let requestsToday = 0;
  let tokensToday = 0;
  for (const m of todayMessages) {
    if (m.role === "user") requestsToday++;
    if (m.usage && typeof m.usage === "object") {
      const total = Number((m.usage as { totalTokens?: number }).totalTokens) || 0;
      tokensToday += total;
    }
  }

  return { requestsToday, tokensToday, requestsLast10Min };
}

export async function checkAssistantQuota(userId: string): Promise<
  | {
      allowed: true;
      prefs: Awaited<ReturnType<typeof getAiPreferences>>;
      usage: Awaited<ReturnType<typeof getTodayAiUsage>>;
    }
  | {
      allowed: false;
      reason: "disabled" | "rate_limited" | "budget_exceeded";
      message: string;
    }
> {
  const [prefs, usage] = await Promise.all([
    getAiPreferences(userId),
    getTodayAiUsage(userId),
  ]);

  if (!prefs.assistantEnabled) {
    return {
      allowed: false,
      reason: "disabled",
      message: "The AI assistant is currently disabled in Settings.",
    };
  }

  if (usage.requestsLast10Min >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      reason: "rate_limited",
      message: `Rate limit reached (${RATE_LIMIT_MAX_REQUESTS} requests per 10 minutes). Please wait a bit.`,
    };
  }

  if (usage.tokensToday >= prefs.aiDailyTokenCap) {
    return {
      allowed: false,
      reason: "budget_exceeded",
      message: `Daily AI token cap (${prefs.aiDailyTokenCap.toLocaleString()}) reached for today.`,
    };
  }

  return { allowed: true, prefs, usage };
}
