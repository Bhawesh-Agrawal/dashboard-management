import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  storeAccountTokens,
} from "@/features/calendar/lib/google-calendar";
import { createClient } from "@/features/auth/lib/supabase-server";

/**
 * Resolve the public origin for redirects behind reverse proxies (e.g., Cloud Run)
 * where `request.url` reflects the container's `0.0.0.0` bind address.
 */
function getRedirectOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0].trim();
  const host = forwardedHost || request.headers.get("host")?.split(",")[0].trim();

  if (host && !host.startsWith("0.0.0.0")) {
    const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0].trim();
    const proto = forwardedProto || new URL(request.url).protocol.replace(/:$/, "");
    return `${proto}://${host}`;
  }

  if (process.env.GOOGLE_CALENDAR_REDIRECT_URI) {
    try {
      return new URL(process.env.GOOGLE_CALENDAR_REDIRECT_URI).origin;
    } catch {
      // Ignore malformed env var and fall back to request.url
    }
  }

  return new URL(request.url).origin;
}

function redirectToSettings(origin: string, query: string) {
  return NextResponse.redirect(new URL(`/settings?${query}`, origin));
}

/**
 * Google Calendar OAuth callback handler.
 * Exchanges the authorization code for tokens and stores them.
 */
export async function GET(request: NextRequest) {
  const origin = getRedirectOrigin(request);
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    console.error("Google OAuth error:", error);
    return redirectToSettings(origin, "error=google_calendar_auth_failed");
  }

  if (!code) {
    return redirectToSettings(origin, "error=no_code");
  }

  try {
    // Get the current user's ID from Supabase auth
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.id) {
      return redirectToSettings(origin, "error=unauthorized");
    }
    const userId = user.id;

    const { accessToken, refreshToken, expiresAt, googleAccountId, email } =
      await exchangeCodeForTokens(code);

    await storeAccountTokens({
      userId,
      googleAccountId,
      email,
      accessToken,
      refreshToken,
      expiresAt,
    });

    return redirectToSettings(origin, "success=google_calendar_connected");
  } catch (error) {
    console.error("Failed to exchange Google OAuth code:", error);
    return redirectToSettings(origin, "error=token_exchange_failed");
  }
}
