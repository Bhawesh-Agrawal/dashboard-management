"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_STORAGE_KEY = "codexdash_install_hint_dismissed_v1";

/**
 * One-time dismissible PWA install hint shown on mobile browsers when
 * `beforeinstallprompt` fires and the app is not already running standalone.
 */
export function InstallAppHint() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (isStandalone) return;

    try {
      if (window.localStorage.getItem(DISMISS_STORAGE_KEY) === "1") {
        return;
      }
    } catch {
      // Ignore storage access failures.
    }

    setDismissed(false);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  if (dismissed || !promptEvent) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    setPromptEvent(null);
    try {
      window.localStorage.setItem(DISMISS_STORAGE_KEY, "1");
    } catch {
      // Ignore storage failures.
    }
  };

  const handleInstall = async () => {
    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") {
        handleDismiss();
      } else {
        setPromptEvent(null);
      }
    } catch {
      setPromptEvent(null);
    }
  };

  return (
    <div
      role="region"
      aria-label="Install app"
      className="mx-4 mt-2 flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-foreground shadow-sm md:hidden"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Download className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        <span className="truncate font-medium">Install CodexDash for offline access</span>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={handleInstall}
          className="min-h-[44px] rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          Install
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss install hint"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
