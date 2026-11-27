"use client";

import { useEffect, useSyncExternalStore } from "react";

const activeIds = new Set<string>();
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

export function setFullscreenFlowActive(id: string, active: boolean) {
  const had = activeIds.has(id);
  if (active && !had) {
    activeIds.add(id);
    notify();
  } else if (!active && had) {
    activeIds.delete(id);
    notify();
  }
}

export function useHideMobileNav(id: string, active: boolean) {
  useEffect(() => {
    setFullscreenFlowActive(id, active);
    return () => setFullscreenFlowActive(id, false);
  }, [id, active]);
}

export function useIsFullscreenFlowActive(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => activeIds.size > 0,
    () => false
  );
}
