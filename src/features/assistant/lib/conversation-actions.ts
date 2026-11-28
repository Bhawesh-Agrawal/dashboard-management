"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";
import {
  deleteAllConversations,
  deleteConversation,
  getAiPreferences,
  getConversationWithMessages,
  getTodayAiUsage,
  listConversations,
  updateAiPreferences,
} from "./persistence";
import { checkAIAvailability } from "@/lib/ai/openrouter";

export async function listConversationsAction() {
  const userId = await getCurrentUserId();
  return listConversations(userId);
}

export async function loadConversationAction(conversationId: string) {
  const userId = await getCurrentUserId();
  return getConversationWithMessages(conversationId, userId);
}

export async function deleteConversationAction(conversationId: string) {
  const userId = await getCurrentUserId();
  const res = await deleteConversation(conversationId, userId);
  revalidatePath("/ask");
  return res;
}

export async function deleteAllConversationsAction() {
  const userId = await getCurrentUserId();
  const res = await deleteAllConversations(userId);
  revalidatePath("/ask");
  revalidatePath("/settings");
  return res;
}

export async function getAiSettingsAction() {
  const userId = await getCurrentUserId();
  const [prefs, usage] = await Promise.all([
    getAiPreferences(userId),
    getTodayAiUsage(userId),
  ]);
  return { prefs, usage };
}

export async function updateAiSettingsAction(input: {
  assistantEnabled?: boolean;
  assistantDsaAccess?: boolean;
  aiDailyTokenCap?: number;
}) {
  const updated = await updateAiPreferences(input);
  revalidatePath("/settings");
  revalidatePath("/ask");
  return updated;
}

export async function testAiConnectionAction() {
  await getCurrentUserId();
  return checkAIAvailability();
}
