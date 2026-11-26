import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const { pathname } = request.nextUrl;

  // Bypasses / exclusions: health, cron, notification trigger, widget API, service worker, manifest, icons, offline
  if (
    pathname === "/api/health" ||
    pathname.startsWith("/api/cron") ||
    pathname === "/api/notifications/trigger" ||
    pathname.startsWith("/api/widget") ||
    pathname === "/sw.js" ||
    pathname.startsWith("/manifest") ||
    pathname.startsWith("/icons") ||
    pathname === "/offline.html" ||
    pathname === "/offline"
  ) {
    return supabaseResponse;
  }

  // Strip any client-supplied x-user-id header for spoofing protection
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("x-user-id");

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request: {
              headers: requestHeaders,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value)
          );
        },
      },
    }
  );

  // Refresh the session and validate the user.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Allow access to auth routes
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/auth")
  ) {
    // If already logged in, redirect away from login/signup to app
    if (user && (pathname === "/login" || pathname === "/signup")) {
      const url = request.nextUrl.clone();
      url.pathname = "/today";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  // Handle unauthenticated requests
  if (!user) {
    // API endpoints return 401 JSON instead of redirecting
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Propagate verified user ID header downstream so Server Actions and Route Handlers
  // avoid a redundant second round-trip to Supabase Auth.
  requestHeaders.set("x-user-id", user.id);

  const finalResponse = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // Preserve any cookies set by Supabase SSR
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    finalResponse.cookies.set(cookie.name, cookie.value, cookie);
  });

  return finalResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - static media (.svg, .png, .jpg, .jpeg, .gif, .webp, .ico)
     * - sw.js (service worker)
     * - manifest.json / manifest.webmanifest
     * - icons/*
     * - offline.html / offline
     * - /api/health
     * - /api/cron/*
     * - /api/notifications/trigger
     * - /api/widget/*
     */
    "/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|manifest|icons|offline|api/health|api/cron|api/notifications/trigger|api/widget|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
