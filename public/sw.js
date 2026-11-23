/**
 * Service Worker for Web Push notifications and offline support.
 *
 * Handles:
 * - Push subscription management
 * - Receiving push events and displaying notifications
 * - Notification click handling (open relevant page)
 * - Offline caching for app shell (JS/CSS bundles, not API responses)
 *
 * Local-first architecture: data is stored in IndexedDB (Dexie),
 * so API responses don't need to be cached in the service worker.
 */

const APP_SHELL_CACHE = "app-shell-v2";
const PINNED_DOCUMENTS_CACHE = "pinned-documents-v1";

// App shell files to cache (navigation routes)
const APP_SHELL_FILES = [
  "/",
  "/today",
  "/tasks",
  "/calendar",
  "/courses",
  "/notes",
  "/projects",
  "/budget",
  "/library",
  "/people",
  "/search",
  "/ask",
  "/settings",
  "/routines",
];

// Install event — cache app shell robustly
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then(async (cache) => {
      console.log("[SW] Caching app shell");
      for (const file of APP_SHELL_FILES) {
        try {
          await cache.add(file);
        } catch (error) {
          console.warn(`[SW] Failed to cache ${file}:`, error);
        }
      }
    })
  );
});

// Activate event — clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Delete old cache versions
          if (cacheName !== APP_SHELL_CACHE && cacheName !== PINNED_DOCUMENTS_CACHE) {
            console.log("[SW] Deleting old cache:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch event — serve from cache, fallback to network
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // Skip external requests
  if (url.origin !== location.origin) return;

  // Skip HMR and RSC streaming requests
  if (
    url.pathname.startsWith("/_next/webpack-hmr") ||
    url.pathname.startsWith("/_next/static/chunks/webpack") ||
    url.searchParams.has("_rsc") ||
    request.headers.get("accept") === "text/x-component" ||
    request.headers.get("RSC") === "1" ||
    request.headers.get("Next-Router-Prefetch") === "1"
  ) {
    return;
  }

  // Pinned offline documents
  if (url.pathname.startsWith("/offline-doc/")) {
    event.respondWith(
      caches.open(PINNED_DOCUMENTS_CACHE).then((cache) => {
        return cache.match(request).then((res) => {
          return res || fetch(request);
        });
      })
    );
    return;
  }

  // API requests — network only (data is in IndexedDB)
  // Don't cache API responses since we use local-first reads
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // Static assets (JS/CSS bundles, fonts) — cache-first with network fallback
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/static/") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".woff2") ||
    url.pathname.endsWith(".woff") ||
    url.pathname.endsWith(".ttf")
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((response) => {
          // Only cache successful responses
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(APP_SHELL_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // Navigation requests — network-first with cache fallback
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful navigation responses
          if (response.ok) {
            const responseClone = response.clone();
            caches.open(APP_SHELL_CACHE).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Return offline page if available
            return caches.match("/offline.html");
          });
        })
    );
    return;
  }

  // Other requests — network-first with cache fallback
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const responseClone = response.clone();
          caches.open(APP_SHELL_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request);
      })
  );
});

// Push event — display notification when push is received
self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();

    const title = data.title || "Academic Dashboard";
    const options = {
      body: data.body || "You have a new notification",
      // Don't set icon explicitly - let browser use app icon automatically
      // This prevents duplicate icons (browser shows app icon on left automatically)
      badge: "/icon-72x72.png",
      tag: data.tag || "default",
      data: data.data || {},
      actions: data.actions || [],
      requireInteraction: data.requireInteraction || false,
      renotify: false,
      vibrate: [200, 100, 200],
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (error) {
    console.error("[SW] Failed to parse push data:", error);
  }
});

// Notification click event — open the relevant page
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};

  // Track notification open for weekly stats (fire-and-forget)
  const tag = event.notification.tag;
  if (tag && tag !== "default") {
    const userId = data.userId || null;
    if (userId) {
      fetch("/api/notifications/mark-opened", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify({ tag }),
      }).catch(() => {});
    }
  }

  // Handle snooze action — suppress notifications until class starts
  if (event.action === "snooze") {
    event.waitUntil(
      fetch("/api/notifications/snooze", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag: tag }),
      })
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        })
        .then(() => {
          // Show confirmation
          self.registration.showNotification("Snoozed", {
            body: "Notifications snoozed until class starts",
            tag: `snooze-confirm-${tag}`,
            // Don't set icon - let browser use app icon
          });
        })
        .catch((err) => {
          console.error("[SW] Failed to snooze notification:", err);
        })
    );
    return;
  }

  // Handle interactive notification actions (e.g., mark attendance)
  if (event.action === "mark_present" || event.action === "mark_absent") {
    const status = event.action === "mark_present" ? "present" : "absent";
    event.waitUntil(
      fetch("/api/attendance/mark-from-push", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courseId: data.courseId,
          date: data.date,
          status: status,
        }),
      })
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        })
        .then(() => {
          // Mark the notification as snoozed to prevent re-triggering
          return fetch("/api/notifications/snooze", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tag: tag, duration: 300000 }), // 5 minutes
          });
        })
        .then(() => {
          self.registration.showNotification("Attendance Marked", {
            body: `Marked as ${status} for ${data.date}`,
            tag: `attendance-confirm-${data.courseId}-${data.date}`,
            // Don't set icon - let browser use app icon
          });
        })
        .catch((err) => {
          console.error("[SW] Failed to mark attendance from push:", err);
          const url = data.url || "/today";
          self.clients.matchAll({ type: "window" }).then((clients) => {
            for (const client of clients) {
              if (client.url.includes(self.location.origin) && "focus" in client) {
                client.navigate(url);
                return client.focus();
              }
            }
            if (self.clients.openWindow) {
              return self.clients.openWindow(url);
            }
          });
        })
    );
    return;
  }

  const url = data.url || "/today";

  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }

      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
