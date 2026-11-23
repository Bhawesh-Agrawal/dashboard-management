import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForTokens, storeTokens } from "@/features/calendar/lib/google-calendar";
import { createClient } from "@/features/auth/lib/supabase-server";

/**
 * Google Calendar OAuth callback handler.
 * Exchanges the authorization code for tokens and stores them.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    console.error("Google OAuth error:", error);
    return NextResponse.redirect(
      new URL("/settings?error=google_calendar_auth_failed", request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL("/settings?error=no_code", request.url)
    );
  }

  try {
    // Get the current user's ID from Supabase auth
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user?.id) {
      return NextResponse.redirect(
        new URL("/settings?error=unauthorized", request.url)
      );
    }
    const userId = user.id;

    const { accessToken, refreshToken, expiresIn } =
      await exchangeCodeForTokens(code);

    await storeTokens(accessToken, refreshToken, expiresIn, userId);

    return NextResponse.redirect(
      new URL("/settings?success=google_calendar_connected", request.url)
    );
  } catch (error) {
    console.error("Failed to exchange Google OAuth code:", error);
    return NextResponse.redirect(
      new URL("/settings?error=token_exchange_failed", request.url)
    );
  }
}
