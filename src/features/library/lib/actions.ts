"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// ─── Quotes ────────────────────────────────────────────────

export async function createQuote(data: {
  text: string;
  source?: string;
  tags?: string[];
}) {
  const quote = await prisma.quote.create({ data });
  revalidatePath("/library");
  return quote;
}

export async function updateQuote(
  id: string,
  data: { text?: string; source?: string; tags?: string[] }
) {
  const quote = await prisma.quote.update({ where: { id }, data });
  revalidatePath("/library");
  return quote;
}

export async function deleteQuote(id: string) {
  await prisma.quote.delete({ where: { id } });
  revalidatePath("/library");
}

// ─── Resources ─────────────────────────────────────────────

export async function createResource(data: {
  title: string;
  url?: string;
  notes?: string;
  tags?: string[];
}) {
  const resource = await prisma.resource.create({ data });
  revalidatePath("/library");
  return resource;
}

export async function updateResource(
  id: string,
  data: { title?: string; url?: string; notes?: string; tags?: string[] }
) {
  const resource = await prisma.resource.update({ where: { id }, data });
  revalidatePath("/library");
  return resource;
}

export async function deleteResource(id: string) {
  await prisma.resource.delete({ where: { id } });
  revalidatePath("/library");
}
