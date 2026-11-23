import { cache } from "react";
import { createClient } from "@/features/auth/lib/supabase-server";

export class UnauthorizedError extends Error {
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Resolves the authenticated user ID for the current request.
 * Cached per request via React cache() — safe for concurrent requests.
 * Throws UnauthorizedError if no authenticated session exists.
 */
export const getCurrentUserId = cache(async (): Promise<string> => {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.id) {
    throw new UnauthorizedError("Authentication required");
  }

  return user.id;
});
