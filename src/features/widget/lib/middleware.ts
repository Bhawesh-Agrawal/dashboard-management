import { NextResponse } from "next/server";
import { verifyWidgetToken } from "./auth";

export async function requireWidgetAuth(
  request: Request
): Promise<{ ok: boolean; response?: NextResponse }> {
  const authHeader = request.headers.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Missing or invalid authorization header" },
        { status: 401 }
      ),
    };
  }

  const token = authHeader.slice(7);
  const result = await verifyWidgetToken(token);

  if (!result.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: result.error || "Invalid token" },
        { status: 401 }
      ),
    };
  }

  return { ok: true };
}
