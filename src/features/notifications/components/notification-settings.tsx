"use client";

import { useState, useEffect, useTransition } from "react";
import {
  requestPushSubscription,
  unsubscribePush,
  getPushStatus,
} from "@/features/notifications/lib/push-client";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function NotificationSettings() {
  const [status, setStatus] = useState<{
    supported: boolean;
    subscribed: boolean;
    permission: NotificationPermission;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    getPushStatus().then(setStatus);
  }, []);

  async function handleToggle() {
    if (status?.subscribed) {
      startTransition(async () => {
        await unsubscribePush();
        const newStatus = await getPushStatus();
        setStatus(newStatus);
        toast.success("Push notifications disabled.");
      });
    } else {
      // Must be called synchronously outside transition for iOS Safari
      try {
        const res = await requestPushSubscription();
        if (!res.success) {
          toast.error("Permission denied or service worker unavailable. Check your browser settings.");
          return;
        }
        
        startTransition(async () => {
          const newStatus = await getPushStatus();
          setStatus(newStatus);
          toast.success("Successfully enabled push notifications!");
        });
      } catch (err) {
        console.error(err);
        toast.error("Failed to enable push notifications.");
      }
    }
  }

  if (!status) {
    return null;
  }

  if (!status.supported) {
    return (
      <div className="flex items-center gap-3 p-4 rounded-md bg-muted">
        <BellOff className="h-5 w-5 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">Push Notifications</p>
          <p className="text-xs text-muted-foreground">
            Push notifications are not supported in this browser
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between p-4 rounded-md border border-input">
      <div className="flex items-center gap-3">
        {status.subscribed ? (
          <Bell className="h-5 w-5 text-primary" />
        ) : (
          <BellOff className="h-5 w-5 text-muted-foreground" />
        )}
        <div>
          <p className="text-sm font-medium">Push Notifications</p>
          <p className="text-xs text-muted-foreground">
            {status.subscribed
              ? "You will receive push notifications"
              : "Enable push notifications for reminders and alerts"}
          </p>
        </div>
      </div>

      <button
        onClick={handleToggle}
        disabled={pending}
        className="h-9 px-4 rounded-md border border-input text-sm hover:bg-muted transition-colors disabled:opacity-50 inline-flex items-center gap-2"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : status.subscribed ? (
          "Disable"
        ) : (
          "Enable"
        )}
      </button>
    </div>
  );
}
