"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { ownerWhere } from "@/lib/owner-scoping";
import { revalidatePath } from "next/cache";

export async function createDomain(data: { name: string; color?: string }) {
  const userId = await getCurrentUserId();
  const domain = await prisma.domain.create({ data: { ...data, userId } });
  revalidatePath("/projects");
  return domain;
}

export async function updateDomain(
  id: string,
  data: { name?: string; color?: string }
) {
  const userId = await getCurrentUserId();
  const existing = await prisma.domain.findFirst({
    where: { id, ...ownerWhere(userId) },
    select: { id: true },
  });
  if (!existing) throw new Error("Domain not found");

  const domain = await prisma.domain.update({ where: { id }, data });
  revalidatePath("/projects");
  return domain;
}

export async function deleteDomain(id: string) {
  const userId = await getCurrentUserId();
  const existing = await prisma.domain.findFirst({
    where: { id, ...ownerWhere(userId) },
    select: { id: true },
  });
  if (!existing) throw new Error("Domain not found");

  await prisma.domain.delete({ where: { id } });
  revalidatePath("/projects");
}
