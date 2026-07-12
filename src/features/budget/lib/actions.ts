"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

export async function createBudgetEntry(data: {
  type: "income" | "expense";
  amount: number;
  category: string;
  date: string; // ISO date string
  notes?: string;
}) {
  const entry = await prisma.budgetEntry.create({
    data: {
      ...data,
      date: new Date(data.date),
    },
  });
  revalidatePath("/budget");
  return { ...entry, amount: Number(entry.amount) };
}

export async function updateBudgetEntry(
  id: string,
  data: {
    type?: "income" | "expense";
    amount?: number;
    category?: string;
    date?: string;
    notes?: string;
  }
) {
  const entry = await prisma.budgetEntry.update({
    where: { id },
    data: {
      ...data,
      date: data.date ? new Date(data.date) : undefined,
    },
  });
  revalidatePath("/budget");
  return { ...entry, amount: Number(entry.amount) };
}

export async function deleteBudgetEntry(id: string) {
  await prisma.budgetEntry.delete({ where: { id } });
  revalidatePath("/budget");
}
