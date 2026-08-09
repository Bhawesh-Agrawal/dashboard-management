"use client";

import { useEffect } from "react";

export function AccentSetter({ accentColor }: { accentColor: string | null }) {
  useEffect(() => {
    if (accentColor) {
      document.documentElement.setAttribute("data-accent", accentColor);
    } else {
      document.documentElement.removeAttribute("data-accent");
    }
  }, [accentColor]);

  return null;
}
