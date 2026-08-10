import { createClient } from "@/features/auth/lib/supabase-browser";
import { syncManager } from "./sync-manager";

type RealtimeTable = "tasks" | "courses" | "notes" | "routines" | "events";

// ─── Supabase Realtime subscription manager ────────────────
// Subscribes to Postgres changes on relevant tables and routes
// them to the sync manager for local Dexie upserts.

let channel: ReturnType<ReturnType<typeof createClient>["channel"]> | null = null;

export function subscribeToRealtime(): () => void {
  if (channel) return () => {};

  const supabase = createClient();

  const tables: RealtimeTable[] = ["tasks", "courses", "notes", "routines", "events"];

  channel = supabase
    .channel("db-sync")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "tasks" },
      (payload) => syncManager.handleRealtimeEvent("tasks", "INSERT", payload.new as Record<string, unknown>)
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "tasks" },
      (payload) => syncManager.handleRealtimeEvent("tasks", "UPDATE", payload.new as Record<string, unknown>)
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "tasks" },
      (payload) => syncManager.handleRealtimeEvent("tasks", "DELETE", payload.old as Record<string, unknown>)
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "courses" },
      (payload) => syncManager.handleRealtimeEvent("courses", "INSERT", payload.new as Record<string, unknown>)
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "courses" },
      (payload) => syncManager.handleRealtimeEvent("courses", "UPDATE", payload.new as Record<string, unknown>)
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "courses" },
      (payload) => syncManager.handleRealtimeEvent("courses", "DELETE", payload.old as Record<string, unknown>)
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "notes" },
      (payload) => syncManager.handleRealtimeEvent("notes", "INSERT", payload.new as Record<string, unknown>)
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "notes" },
      (payload) => syncManager.handleRealtimeEvent("notes", "UPDATE", payload.new as Record<string, unknown>)
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "notes" },
      (payload) => syncManager.handleRealtimeEvent("notes", "DELETE", payload.old as Record<string, unknown>)
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "routines" },
      (payload) => syncManager.handleRealtimeEvent("routines", "INSERT", payload.new as Record<string, unknown>)
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "routines" },
      (payload) => syncManager.handleRealtimeEvent("routines", "UPDATE", payload.new as Record<string, unknown>)
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "routines" },
      (payload) => syncManager.handleRealtimeEvent("routines", "DELETE", payload.old as Record<string, unknown>)
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "events" },
      (payload) => syncManager.handleRealtimeEvent("events", "INSERT", payload.new as Record<string, unknown>)
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "events" },
      (payload) => syncManager.handleRealtimeEvent("events", "UPDATE", payload.new as Record<string, unknown>)
    )
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "events" },
      (payload) => syncManager.handleRealtimeEvent("events", "DELETE", payload.old as Record<string, unknown>)
    )
    .subscribe();

  return () => {
    if (channel) {
      supabase.removeChannel(channel);
      channel = null;
    }
  };
}
