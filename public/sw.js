/**
 * Service Worker for Web Push notifications and offline support.
 *
 * Handles:
 * - Push subscription management
 * - Receiving push events and displaying notifications
 * - Notification click handling (open relevant page)
 * - Offline caching for app shell and read-only data
 */

const CACHE_NAME = "academic-command-center-v1";
const APP_SHELL_CACHE = "app-shell-v1";
const DATA_CACHE = "data-cache-v1";

// App shell files to cache (JS/CSS bundles, fonts)
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
];

// Install event — cache app shell robustly
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then(async (cache) => {
      console.log("Caching app shell");
      for (const file of APP_SHELL_FILES) {
        try {
          await cache.add(file);
        } catch (error) {
          console.warn(`Failed to cache ${file}:`, error);
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
          if (cacheName !== APP_SHELL_CACHE && cacheName !== DATA_CACHE) {
            console.log("Deleting old cache:", cacheName);
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

  // Skip HMR and RSC streaming requests — cloning them detaches the
  // underlying ArrayBuffer and crashes the dev server's HMR stream.
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

  // API requests — network-first with cache fallback
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Clone the response before caching
          const responseClone = response.clone();
          caches.open(DATA_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
          return response;
        })
        .catch(() => {
          return caches.match(request);
        })
    );
    return;
  }

  // Static assets — cache-first with network fallback
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/static/") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".woff2")
  ) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(request).then((response) => {
          const responseClone = response.clone();
          caches.open(APP_SHELL_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
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
          const responseClone = response.clone();
          caches.open(APP_SHELL_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
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
        const responseClone = response.clone();
        caches.open(DATA_CACHE).then((cache) => {
          cache.put(request, responseClone);
        });
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

    const title = data.title || "Academic Command Center";
    const options = {
      body: data.body || "You have a new notification",
      icon: data.icon || "/icon-192x192.png",
      badge: data.badge || "/icon-72x72.png",
      tag: data.tag || "default",
      data: data.data || {},
      actions: data.actions || [],
      requireInteraction: data.requireInteraction || false,
      renotify: false, // Don't re-alert for same tag — dedup handled by scheduler
      vibrate: [200, 100, 200], // Vibration pattern for mobile devices
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (error) {
    console.error("Failed to parse push data:", error);
  }
});

// Notification click event — open the relevant page
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const data = event.notification.data || {};

  // Track notification open for weekly stats (fire-and-forget)
  const tag = event.notification.tag;
  if (tag && tag !== "default") {
    // Best-effort: try to get userId from the push payload
    // The push payload includes userId in data; we stored it on notification show
    const userId = data.userId || null;
    if (userId) {
      fetch("/api/notifications/mark-opened", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-user-id": userId },
        body: JSON.stringify({ tag }),
      }).catch(() => {}); // non-critical
    }
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
          status: status
        })
      })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(() => {
        self.registration.showNotification("Attendance Marked", {
          body: `Marked as ${status} for ${data.date}`,
          tag: `attendance-confirm-${data.courseId}-${data.date}`,
          icon: "/icon-192x192.png",
        });
      })
      .catch((err) => {
        console.error("Failed to mark attendance from push:", err);
        // Fallback: open the app so user can mark manually
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
      // Check if there's already a window open
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }

      // Open a new window if none exists
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
