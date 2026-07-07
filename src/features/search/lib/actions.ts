"use server";

import { globalSearch } from "@/features/search/lib/queries";
import type { SearchResult } from "@/features/search/lib/queries";

/**
 * Search across all entities.
 * This is a server action that can be called from client components.
 */
export async function searchAction(query: string): Promise<SearchResult[]> {
  return globalSearch(query);
}
