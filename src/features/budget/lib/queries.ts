import { prisma } from "@/lib/prisma";
import { cache } from "react";

/**
 * Get budget entries for a given month/year.
 */
export const getBudgetEntries = cache(async (month: number, year: number) => {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0); // last day of month

  return prisma.budgetEntry.findMany({
    where: {
      date: { gte: start, lte: end },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
});

/**
 * Get budget summary: total income, total expense, balance, and category breakdown.
 */
export const getBudgetSummary = cache(async (month: number, year: number) => {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);

  const entries = await prisma.budgetEntry.findMany({
    where: { date: { gte: start, lte: end } },
  });

  const totalIncome = entries
    .filter((e) => e.type === "income")
    .reduce((sum, e) => sum + Number(e.amount), 0);

  const totalExpense = entries
    .filter((e) => e.type === "expense")
    .reduce((sum, e) => sum + Number(e.amount), 0);

  // Group expenses by category
  const categoryBreakdown = entries
    .filter((e) => e.type === "expense")
    .reduce((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + Number(e.amount);
      return acc;
    }, {} as Record<string, number>);

  // Sort categories by amount descending
  const topCategories = Object.entries(categoryBreakdown)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  return {
    totalIncome,
    totalExpense,
    balance: totalIncome - totalExpense,
    topCategories,
    entryCount: entries.length,
  };
});
