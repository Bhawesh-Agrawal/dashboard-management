# PWA Installation & Offline Verification

## Installing on Phone (Android / iOS)

1. Open the deployed HTTPS URL in Chrome (Android) or Safari (iOS) and sign in.
2. **Android (Chrome):** Tap the browser menu -> **Install app** (or **Add to Home screen**). Chrome uses `manifest.json` (`id: "/"`, `scope: "/"`, `start_url: "/today"`) and the dedicated `any` and `maskable` 192x192 / 512x512 icons.
3. **iOS (Safari):** Tap the Share button -> **Add to Home Screen**.

## Testing the Service Worker Locally

By default, `ServiceWorkerRegistration` unregisters service workers outside production so local dev stays fresh. To test `/sw.js` locally:

```bash
NEXT_PUBLIC_ENABLE_SW=true npm run build && NEXT_PUBLIC_ENABLE_SW=true npm run start
```

`/sw.js` is served with `Cache-Control: no-cache, no-store, must-revalidate` (configured in `next.config.ts`) so browser SW updates apply immediately on deploy.

## Offline Verification Checklist

1. Load `/today` and `/brief` while online so the app shell and IndexedDB (Dexie) seed cache are populated.
2. Enable Airplane Mode (or DevTools -> Network -> **Offline**).
3. Reload `/today`: the app shell loads from the service worker cache and Dexie data renders.
4. Navigate to an uncached server-only route (e.g. `/dsa`): `/offline.html` is served cleanly.
5. Disable Airplane Mode and verify pending offline attendance/task mutations sync back to the server.
