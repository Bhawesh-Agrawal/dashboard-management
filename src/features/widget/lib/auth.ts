import { prisma } from "@/lib/prisma";
import crypto from "crypto";

const ALGORITHM = "sha256";

function hashToken(token: string): string {
  return crypto.createHash(ALGORITHM).update(token).digest("hex");
}

export function generateRawToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function generateWidgetToken(userId?: string): Promise<{ token: string }> {
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);

  await prisma.widgetToken.updateMany({
    where: { revokedAt: null, ...(userId ? { userId } : {}) },
    data: { revokedAt: new Date() },
  });

  await prisma.widgetToken.create({
    data: { tokenHash, userId },
  });

  return { token: rawToken };
}

export async function verifyWidgetToken(
  token: string
): Promise<{ ok: boolean; error?: string; userId?: string | null }> {
  const tokenHash = hashToken(token);

  const record = await prisma.widgetToken.findFirst({
    where: { tokenHash },
  });

  if (!record) {
    return { ok: false, error: "Invalid token" };
  }

  if (record.revokedAt) {
    return { ok: false, error: "Token has been revoked" };
  }

  await prisma.widgetToken.update({
    where: { id: record.id },
    data: { lastUsedAt: new Date() },
  });

  return { ok: true, userId: record.userId };
}

export async function getActiveWidgetTokenInfo(): Promise<{
  exists: boolean;
  lastUsedAt: Date | null;
}> {
  const record = await prisma.widgetToken.findFirst({
    where: { revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { lastUsedAt: true },
  });

  return {
    exists: !!record,
    lastUsedAt: record?.lastUsedAt ?? null,
  };
}

export async function revokeWidgetToken(): Promise<{ success: boolean }> {
  const result = await prisma.widgetToken.updateMany({
    where: { revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return { success: result.count > 0 };
}
