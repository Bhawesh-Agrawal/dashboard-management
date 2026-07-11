import { createClient } from "@/features/auth/lib/supabase-server";
import { memCache, TTL } from "@/lib/mem-cache";

export const DEFAULT_USER_ID = "default-user";

export async function getCurrentUserId(): Promise<string> {
  return memCache.get("auth:userId", TTL.AUTH, async () => {
    try {
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      return user?.id || DEFAULT_USER_ID;
    } catch {
      return DEFAULT_USER_ID;
    }
  });
}
