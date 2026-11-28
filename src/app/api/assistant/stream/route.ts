import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUserId, UnauthorizedError } from "@/lib/auth";
import { AIError } from "@/lib/ai/openrouter";
import { getRegisteredTools } from "@/features/assistant/tools/registry";
import { runAssistantAgent } from "@/features/assistant/lib/agent";
import { buildStateSnapshot } from "@/features/assistant/lib/runner";
import {
  appendAiMessage,
  checkAssistantQuota,
  createConversation,
  getConversationWithMessages,
} from "@/features/assistant/lib/persistence";
import { formatSseEvent } from "@/features/assistant/lib/sse";

export const runtime = "nodejs";
export const maxDuration = 60;

const requestSchema = z.object({
  message: z.string().trim().min(1, "Message is required").max(4000, "Message too long"),
  conversationId: z.string().uuid().optional(),
  focusNoteId: z.string().min(1).optional(),
});

export async function POST(req: NextRequest) {
  let userId: string;
  try {
    userId = await getCurrentUserId();
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  const { message, focusNoteId } = parsed.data;
  const quota = await checkAssistantQuota(userId);
  if (!quota.allowed) {
    const encoder = new TextEncoder();
    const friendlyStream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            formatSseEvent("error", { code: quota.reason, message: quota.message })
          )
        );
        controller.close();
      },
    });
    return new Response(friendlyStream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  }

  let conversationId = parsed.data.conversationId;
  let history: Array<{ role: "user" | "assistant"; content: string }> = [];

  if (conversationId) {
    const conv = await getConversationWithMessages(conversationId, userId);
    if (!conv) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    history = conv.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
  } else {
    const created = await createConversation(userId, message);
    conversationId = created.id;
  }

  await appendAiMessage({
    conversationId,
    userId,
    role: "user",
    content: message,
  });

  const snapshot = await buildStateSnapshot(userId, focusNoteId);
  const tools = getRegisteredTools({ dsaEnabled: quota.prefs.assistantDsaAccess });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Parameters<typeof formatSseEvent>[0], data: unknown) => {
        if (req.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(formatSseEvent(event, data)));
        } catch {
          // Stream closed
        }
      };

      try {
        const result = await runAssistantAgent({
          userId,
          userMessage: message,
          history,
          snapshot,
          tools,
          stream: true,
          signal: req.signal,
          callbacks: {
            onToken: (text) => send("token", { text }),
            onToolStart: (name, argsSummary) => send("tool_start", { name, argsSummary }),
            onToolEnd: (name, ok, durationMs) => send("tool_end", { name, ok, durationMs }),
          },
        });

        const savedMsg = await appendAiMessage({
          conversationId: conversationId!,
          userId,
          role: "assistant",
          content: result.answer,
          toolCalls: result.toolsUsed,
          sources: result.sources,
          proposals: result.proposals,
          usage: result.usage,
        });

        if (result.sources.length > 0) {
          send("sources", { sources: result.sources });
        }
        if (result.proposals.length > 0) {
          send("proposals", { messageId: savedMsg.id, proposals: result.proposals });
        }
        send("done", {
          conversationId,
          messageId: savedMsg.id,
          usage: result.usage,
          toolsUsed: result.toolsUsed,
        });
      } catch (err) {
        const code = err instanceof AIError ? err.code : "provider_error";
        const msg =
          err instanceof Error && code !== "provider_error"
            ? err.message
            : "Assistant temporarily unavailable. Please try again.";
        send("error", { code, message: msg });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
