"use client";

import { useEffect } from "react";

/**
 * Ensures focused form fields on mobile viewports scroll above the soft keyboard.
 */
export function KeyboardFocusHelper() {
  useEffect(() => {
    function onFocusIn(e: FocusEvent) {
      if (typeof window === "undefined" || window.innerWidth >= 1024) return;
      const target = e.target;
      if (
        !(
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement
        )
      ) {
        return;
      }
      setTimeout(() => {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 150);
    }

    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, []);

  return null;
}
