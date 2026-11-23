/**
 * Ownership scoping helper.
 *
 * Controls whether queries strictly filter by owner (userId) or allow the interim
 * fallback (userId is null) for backwards compatibility with legacy unowned rows.
 *
 * Controlled by the environment variable:
 *   STRICT_OWNER_SCOPING="true" (default: false)
 *
 * Once existing production records have been backfilled via scripts/backfill-semester-user.ts,
 * set STRICT_OWNER_SCOPING="true" in Cloud Run / production env to enforce strict isolation.
 */

export function isStrictOwnerScoping(): boolean {
  return process.env.STRICT_OWNER_SCOPING === "true";
}

export type OwnerWhereClause =
  | { userId: string }
  | { OR: [{ userId: string }, { userId: null }] };

/**
 * Returns a Prisma where clause for user ownership.
 *
 * @param userId The authenticated user ID.
 * @returns `{ userId }` when STRICT_OWNER_SCOPING="true", otherwise `{ OR: [{ userId }, { userId: null }] }`
 */
export function ownerWhere(userId: string): OwnerWhereClause {
  if (isStrictOwnerScoping()) {
    return { userId };
  }
  return {
    OR: [{ userId }, { userId: null }],
  };
}
