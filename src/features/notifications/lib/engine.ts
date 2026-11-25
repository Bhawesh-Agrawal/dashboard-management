import { prisma } from "@/lib/prisma";
import { getNow } from "@/lib/clock";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";
import type { NotificationPriority, NotificationType } from "./scheduler";
import { DEFAULT_ENABLED_TYPES, DEFAULT_PRIORITY } from "./scheduler";

export interface NotificationCandidate {
  userId: string;
  type: NotificationType;
  entityId: string;
  occurrenceDate: string; // YYYY-MM-DD in user's local timezone
  scheduledFor: Date;
  dedupKey: string; // `${type}:${entityId}:${occurrenceDate}[:${variant}]`
  title: string;
  body: string;
  url: string;
  actions?: { action: string; title: string }[];
  data?: Record<string, string | number | boolean | undefined>;
  requireInteraction?: boolean;
  /** If a candidate represents a digest, every covered item's dedupKey is also checked and recorded. */
  coveredItems?: Array<{ dedupKey: string; type: NotificationType }>;
}

export interface PushSubscriptionRecord {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  createdAt: Date;
}

export type PushSender = (
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string
) => Promise<unknown>;

export interface DispatchResult {
  sent: number;
  deliveredPushes: number;
  skippedDedup: number;
  skippedDisabled: number;
  skippedQuietHours: number;
  skippedNoSubscription: number;
  removedSubscriptions: number;
  failed: number;
}

export function buildDedupKey(
  type: NotificationType,
  entityId: string,
  occurrenceDate: string,
  variant?: string
): string {
  return variant
    ? `${type}:${entityId}:${occurrenceDate}:${variant}`
    : `${type}:${entityId}:${occurrenceDate}`;
}

export function isWithinQuietHours(
  localHour: number,
  localMinute: number,
  start: string | null | undefined,
  end: string | null | undefined
): boolean {
  if (!start || !end) return false;

  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);
  if (
    Number.isNaN(startH) ||
    Number.isNaN(startM) ||
    Number.isNaN(endH) ||
    Number.isNaN(endM)
  ) {
    return false;
  }

  const current = localHour * 60 + localMinute;
  const startMin = startH * 60 + startM;
  const endMin = endH * 60 + endM;

  if (startMin <= endMin) {
    return current >= startMin && current < endMin;
  }
  return current >= startMin || current < endMin;
}

export function getLocalHourMinute(
  now: Date,
  timezone: string | null | undefined
): { hour: number; minute: number } {
  const tz = timezone || DEFAULT_TIMEZONE;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const hourRaw = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
    const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    return { hour: hourRaw === 24 ? 0 : hourRaw, minute };
  } catch {
    return { hour: now.getHours(), minute: now.getMinutes() };
  }
}

async function createDefaultWebPushSender(): Promise<PushSender | null> {
  const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn("[NotificationEngine] VAPID keys not configured — skipping push delivery");
    return null;
  }

  const webPush = await import("web-push");
  const vapidEmail = process.env.VAPID_EMAIL || "mailto:admin@example.com";
  webPush.default.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);

  return async (subscription, payload) => {
    return webPush.default.sendNotification(subscription, payload);
  };
}

function getHttpStatusCode(error: unknown): number | null {
  if (error && typeof error === "object" && "statusCode" in error) {
    const code = (error as { statusCode?: unknown }).statusCode;
    return typeof code === "number" ? code : null;
  }
  return null;
}

/**
 * Single notification dispatcher:
 * 1. Dedup against SentNotification (userId + dedupKey, plus tag fallback)
 * 2. Per-type preference check
 * 3. Quiet-hours check (non-critical types)
 * 4. Fan-out to all active subscriptions for userId
 * 5. Dead subscription cleanup on 404/410
 * 6. Record SentNotification rows (including any digest-covered items)
 */
export async function dispatchNotifications(
  candidates: NotificationCandidate[],
  options?: {
    now?: Date;
    sendPush?: PushSender;
  }
): Promise<DispatchResult> {
  const result: DispatchResult = {
    sent: 0,
    deliveredPushes: 0,
    skippedDedup: 0,
    skippedDisabled: 0,
    skippedQuietHours: 0,
    skippedNoSubscription: 0,
    removedSubscriptions: 0,
    failed: 0,
  };

  if (candidates.length === 0) return result;

  const now = options?.now ?? getNow();
  let sender: PushSender | null | undefined = options?.sendPush;
  let senderInitialized = Boolean(sender);

  const prefsCache = new Map<
    string,
    Awaited<ReturnType<typeof prisma.notificationPreference.findMany>>
  >();
  const subsCache = new Map<string, PushSubscriptionRecord[]>();

  async function getUserPrefs(userId: string) {
    if (!prefsCache.has(userId)) {
      const rows = await prisma.notificationPreference
        .findMany({ where: { userId } })
        .catch(() => []);
      prefsCache.set(userId, rows);
    }
    return prefsCache.get(userId)!;
  }

  async function getUserSubs(userId: string) {
    if (!subsCache.has(userId)) {
      const rows = await prisma.pushSubscription.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
      });
      subsCache.set(userId, rows);
    }
    return subsCache.get(userId)!;
  }

  for (const candidate of candidates) {
    const keysToCheck = [
      candidate.dedupKey,
      ...(candidate.coveredItems?.map((c) => c.dedupKey) ?? []),
    ];

    // 1. Dedup check (checks dedupKey and legacy tag)
    const existingSent = await prisma.sentNotification.findFirst({
      where: {
        userId: candidate.userId,
        OR: [
          { dedupKey: { in: keysToCheck } },
          { tag: { in: keysToCheck } },
        ],
      },
    });

    if (existingSent) {
      result.skippedDedup += 1;
      continue;
    }

    // 2. Per-type preference check
    const prefs = await getUserPrefs(candidate.userId);
    const typePref = prefs.find((p) => p.type === candidate.type);
    const isEnabled = typePref
      ? typePref.enabled
      : DEFAULT_ENABLED_TYPES.includes(candidate.type);

    if (!isEnabled) {
      result.skippedDisabled += 1;
      continue;
    }

    // 3. Quiet-hours check
    const priority: NotificationPriority =
      (typePref?.priority as NotificationPriority) || DEFAULT_PRIORITY[candidate.type];
    if (priority !== "critical") {
      const tzPref = prefs.find((p) => p.timezone)?.timezone ?? DEFAULT_TIMEZONE;
      const quietStart =
        typePref?.quietHoursStart ??
        prefs.find((p) => p.quietHoursStart)?.quietHoursStart ??
        "22:00";
      const quietEnd =
        typePref?.quietHoursEnd ??
        prefs.find((p) => p.quietHoursEnd)?.quietHoursEnd ??
        "07:00";
      const { hour, minute } = getLocalHourMinute(now, tzPref);
      if (isWithinQuietHours(hour, minute, quietStart, quietEnd)) {
        result.skippedQuietHours += 1;
        continue;
      }
    }

    // 4. Fetch all active subscriptions for this user
    const subs = await getUserSubs(candidate.userId);
    if (subs.length === 0) {
      result.skippedNoSubscription += 1;
      continue;
    }

    if (!senderInitialized) {
      sender = await createDefaultWebPushSender();
      senderInitialized = true;
    }
    if (!sender) {
      result.failed += 1;
      continue;
    }

    const payloadJson = JSON.stringify({
      title: candidate.title,
      body: candidate.body,
      tag: candidate.dedupKey,
      data: {
        url: candidate.url,
        type: candidate.type,
        dedupKey: candidate.dedupKey,
        ...(candidate.data ?? {}),
      },
      actions: candidate.actions ?? [],
      requireInteraction: candidate.requireInteraction ?? true,
    });

    let deliveredForCandidate = 0;
    const deadEndpoints: string[] = [];

    for (const sub of subs) {
      try {
        await sender(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payloadJson
        );
        deliveredForCandidate += 1;
        result.deliveredPushes += 1;
      } catch (error) {
        const statusCode = getHttpStatusCode(error);
        if (statusCode === 404 || statusCode === 410) {
          deadEndpoints.push(sub.endpoint);
          await prisma.pushSubscription.deleteMany({
            where: { endpoint: sub.endpoint },
          });
          result.removedSubscriptions += 1;
        } else {
          result.failed += 1;
        }
        console.error(
          `[NotificationEngine] Push failed for ${candidate.dedupKey} (status=${statusCode ?? "unknown"}):`,
          error
        );
      }
    }

    if (deadEndpoints.length > 0) {
      subsCache.set(
        candidate.userId,
        subs.filter((s) => !deadEndpoints.includes(s.endpoint))
      );
    }

    // 5. Record SentNotification only if at least one subscription received the push
    if (deliveredForCandidate > 0) {
      result.sent += 1;
      const itemsToRecord = [
        { dedupKey: candidate.dedupKey, type: candidate.type },
        ...(candidate.coveredItems ?? []),
      ];

      for (const item of itemsToRecord) {
        await prisma.sentNotification.upsert({
          where: {
            userId_dedupKey: {
              userId: candidate.userId,
              dedupKey: item.dedupKey,
            },
          },
          create: {
            userId: candidate.userId,
            tag: item.dedupKey,
            dedupKey: item.dedupKey,
            type: item.type,
            sentAt: now,
          },
          update: {
            tag: item.dedupKey,
            sentAt: now,
          },
        });
      }
    }
  }

  console.info(
    `[NotificationEngine] dispatched=${result.sent} pushes=${result.deliveredPushes} skipped(dedup=${result.skippedDedup},disabled=${result.skippedDisabled},quiet=${result.skippedQuietHours},noSub=${result.skippedNoSubscription}) removedSubs=${result.removedSubscriptions} failed=${result.failed}`
  );

  return result;
}
