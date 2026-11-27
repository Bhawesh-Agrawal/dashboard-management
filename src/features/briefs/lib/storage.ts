import type { DailyBriefKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/clock";
import { parseDateOnly } from "@/lib/timezone";

export async function saveDailyBrief(input: {
  userId: string;
  kind: DailyBriefKind;
  forDate: string; // YYYY-MM-DD
  payload: Prisma.InputJsonValue;
  generatedAt?: Date;
}) {
  const forDateObj = parseDateOnly(input.forDate);
  const generatedAt = input.generatedAt ?? getNow();

  return prisma.dailyBrief.upsert({
    where: {
      userId_kind_forDate: {
        userId: input.userId,
        kind: input.kind,
        forDate: forDateObj,
      },
    },
    create: {
      userId: input.userId,
      kind: input.kind,
      forDate: forDateObj,
      generatedAt,
      payload: input.payload,
    },
    update: {
      generatedAt,
      payload: input.payload,
    },
  });
}

export async function getLatestDailyBriefs(userId: string) {
  const [morning, midday, evening] = await Promise.all([
    prisma.dailyBrief.findFirst({
      where: { userId, kind: "morning" },
      orderBy: [{ forDate: "desc" }, { generatedAt: "desc" }],
    }),
    prisma.dailyBrief.findFirst({
      where: { userId, kind: "midday" },
      orderBy: [{ forDate: "desc" }, { generatedAt: "desc" }],
    }),
    prisma.dailyBrief.findFirst({
      where: { userId, kind: "evening" },
      orderBy: [{ forDate: "desc" }, { generatedAt: "desc" }],
    }),
  ]);

  return { morning, midday, evening };
}

export async function getDailyBriefByDate(
  userId: string,
  kind: DailyBriefKind,
  forDate: string
) {
  return prisma.dailyBrief.findUnique({
    where: {
      userId_kind_forDate: {
        userId,
        kind,
        forDate: parseDateOnly(forDate),
      },
    },
  });
}
