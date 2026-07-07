"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createDomain(data: { name: string; color?: string }) {
  const domain = await prisma.domain.create({ data });
  revalidatePath("/projects");
  return domain;
}

export async function updateDomain(
  id: string,
  data: { name?: string; color?: string }
) {
  const domain = await prisma.domain.update({ where: { id }, data });
  revalidatePath("/projects");
  return domain;
}

export async function deleteDomain(id: string) {
  await prisma.domain.delete({ where: { id } });
  revalidatePath("/projects");
}
