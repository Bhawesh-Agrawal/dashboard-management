"use client";

import { useState, useEffect } from "react";
import { getIdentityProgress, type IdentityProgress } from "../lib/actions";
import { IdentityCard } from "./IdentityCard";

export function IdentityGrid({ userId }: { userId: string }) {
  const [progress, setProgress] = useState<IdentityProgress[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchProgress() {
      try {
        const data = await getIdentityProgress(userId);
        if (!cancelled) {
          setProgress(data);
        }
      } catch {
        if (!cancelled) {
          setProgress([]);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchProgress();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="h-32 bg-muted/40 rounded-xl animate-pulse" />
        <div className="h-32 bg-muted/40 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (progress.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground mb-1">No identities yet</p>
        <p className="text-xs text-muted-foreground/70">
          Define who you&apos;re becoming. Your routines will reinforce that identity.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {progress.map((p) => (
        <IdentityCard key={p.identity.id} progress={p} />
      ))}
    </div>
  );
}
