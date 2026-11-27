# PWA & Web Share Target Guide

## Installing the App

- **Android (Chrome):** Open CodexDash in Chrome and tap **Install** in the browser menu or the one-time install banner.
- **iPhone / iPad (Safari):** Tap the Share button and choose **Add to Home Screen**.

## Sharing Links from Other Apps (Web Share Target)

### Android (Chrome Installed PWA)

`public/manifest.json` registers a W3C Web App Manifest `share_target`:

```json
"share_target": {
  "action": "/capture/share",
  "method": "GET",
  "enctype": "application/x-www-form-urlencoded",
  "params": {
    "title": "title",
    "text": "text",
    "url": "url"
  }
}
```

Once CodexDash is installed from Chrome on Android, sharing a YouTube video, Spotify playlist, or article from any app shows **CodexDash** in the Android share sheet:
- Android apps frequently put the URL inside `text` instead of `url`; `/capture/share` scans `url`, `text`, and `title` to extract the first `http(s)` URL and strips safe tracking query parameters (`utm_*`, `fbclid`, `gclid`, `si` on YouTube/Spotify).
- If your session expired, `/login?returnUrl=...` preserves the full `/capture/share?...` query string after signing in.
- Enable **Auto-save shared items immediately** on `/capture/share` if you want one-tap instant saves with an Undo toast.

### iOS / iPadOS (Safari)

iOS PWAs do not support the Web Share Target API (`share_target`). On iPhone/iPad:
1. Copy the link or text in YouTube, Spotify, or Safari.
2. Open CodexDash -> tap **+** (FAB) or **Capture** on `/notes`.
3. Tap **Paste** (or paste into the text box) — CodexDash automatically detects the URL and switches to **Link**.
