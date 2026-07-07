import { prisma } from "@/lib/prisma";
import { cache } from "react";

/**
 * Get all quotes, most recent first.
 */
export const getQuotes = cache(async () => {
  return prisma.quote.findMany({
    orderBy: { createdAt: "desc" },
  });
});

/**
 * Get all resources, most recent first.
 */
export const getResources = cache(async () => {
  return prisma.resource.findMany({
    orderBy: { createdAt: "desc" },
  });
});

/**
 * Get all library data (quotes + resources combined).
 */
export const getLibraryData = cache(async () => {
  const [quotes, resources] = await Promise.all([
    getQuotes(),
    getResources(),
  ]);
  return { quotes, resources };
});
