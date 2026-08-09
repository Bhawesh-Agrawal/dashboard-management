"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { getCurrentUserId } from "@/lib/auth";

export type DashboardLayout = {
  widgetOrder: string[];
  hiddenWidgets: string[];
  accentColor: string | null;
  themeMode: string;
};

export async function getDashboardLayout(): Promise<DashboardLayout> {
  const userId = await getCurrentUserId();
  const pref = await prisma.userDashboardPreference.findUnique({
    where: { userId },
  });

  if (!pref) {
    return {
      widgetOrder: [],
      hiddenWidgets: [],
      accentColor: null,
      themeMode: "light",
    };
  }

  return {
    widgetOrder: (pref.widgetOrder as string[]) || [],
    hiddenWidgets: pref.hiddenWidgets,
    accentColor: pref.accentColor,
    themeMode: pref.themeMode,
  };
}

export async function saveDashboardLayout(
  widgetOrder: string[],
  hiddenWidgets: string[]
) {
  const userId = await getCurrentUserId();
  await prisma.userDashboardPreference.upsert({
    where: { userId },
    create: {
      userId,
      widgetOrder,
      hiddenWidgets,
    },
    update: {
      widgetOrder,
      hiddenWidgets,
    },
  });
  revalidatePath("/today");
}

export async function saveThemePreference(
  accentColor: string | null,
  themeMode: string
) {
  const userId = await getCurrentUserId();
  await prisma.userDashboardPreference.upsert({
    where: { userId },
    create: {
      userId,
      accentColor,
      themeMode,
    },
    update: {
      accentColor,
      themeMode,
    },
  });
  revalidatePath("/settings");
  revalidatePath("/today");
}
