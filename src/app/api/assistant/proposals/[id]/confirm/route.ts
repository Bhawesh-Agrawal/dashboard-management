import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserId, UnauthorizedError } from "@/lib/auth";
import { confirmProposal } from "@/features/assistant/lib/proposals";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: proposalId } = await params;
  const body = (await req.json().catch(() => ({}))) as { messageId?: string };
  if (!body.messageId || typeof body.messageId !== "string") {
    return NextResponse.json({ error: "messageId is required" }, { status: 400 });
  }

  const res = await confirmProposal({
    messageId: body.messageId,
    proposalId,
    userId,
  });

  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: res.status });
  }
  return NextResponse.json(res);
}
