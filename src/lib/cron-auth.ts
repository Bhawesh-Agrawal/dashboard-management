import { OAuth2Client } from "google-auth-library";
import crypto from "crypto";

const authClient = new OAuth2Client();

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Validates incoming cron requests.
 * Fails closed: if neither static token nor OIDC config is set, all requests are rejected.
 *
 * Accepts EITHER:
 * 1. Static bearer token in `Authorization: Bearer <token>` matched against
 *    `CRON_BEARER_TOKEN` (or `CRON_SECRET`) using timing-safe comparison.
 * 2. Google Cloud Scheduler OIDC ID token verified via google-auth-library,
 *    matching `CRON_OIDC_AUDIENCE` and `CRON_OIDC_SERVICE_ACCOUNT_EMAIL`.
 *
 * Never accepts query parameters (?secret= is completely rejected).
 */
export async function verifyCronRequest(request: Request): Promise<boolean> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return false;
  }

  // Option A: Static Bearer Token (constant-time comparison)
  const expectedBearer = process.env.CRON_BEARER_TOKEN || process.env.CRON_SECRET;
  if (expectedBearer && safeCompare(token, expectedBearer)) {
    return true;
  }

  // Option B: Google Cloud Scheduler OIDC Token
  const expectedAudience = process.env.CRON_OIDC_AUDIENCE;
  const expectedServiceAccount = process.env.CRON_OIDC_SERVICE_ACCOUNT_EMAIL;

  if (expectedAudience) {
    try {
      const ticket = await authClient.verifyIdToken({
        idToken: token,
        audience: expectedAudience,
      });
      const payload = ticket.getPayload();
      if (!payload) {
        return false;
      }

      if (expectedServiceAccount) {
        if (payload.email !== expectedServiceAccount || !payload.email_verified) {
          return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  // Fail closed if neither mechanism is configured or matched
  return false;
}
