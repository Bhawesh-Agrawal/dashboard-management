"use server";

import {
  generateWidgetToken,
  revokeWidgetToken,
  getActiveWidgetTokenInfo,
} from "./auth";
import { revalidatePath } from "next/cache";

export async function generateWidgetTokenAction(): Promise<{
  token: string | null;
  error?: string;
}> {
  try {
    const { token } = await generateWidgetToken();
    revalidatePath("/settings");
    return { token };
  } catch (error) {
    return {
      token: null,
      error: error instanceof Error ? error.message : "Failed to generate token",
    };
  }
}

export async function revokeWidgetTokenAction(): Promise<{
  success: boolean;
}> {
  const result = await revokeWidgetToken();
  revalidatePath("/settings");
  return result;
}

export async function getWidgetTokenStatus(): Promise<{
  exists: boolean;
  lastUsedAt: Date | null;
}> {
  return getActiveWidgetTokenInfo();
}
