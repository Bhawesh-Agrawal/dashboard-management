"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  BookmarkPlus,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  History,
  Plus,
  RefreshCw,
  Send,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { createCaptureNote } from "@/features/notes/lib/capture-actions";
import {
  deleteConversationAction,
  loadConversationAction,
} from "../lib/conversation-actions";
import type { AssistantProposal, AssistantSource } from "../tools/types";

interface ToolUsageItem {
  name: string;
  argsSummary: string;
  ok: boolean;
  durationMs: number;
}

interface ChatMessageItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolsUsed?: ToolUsageItem[];
  sources?: AssistantSource[];
  proposals?: AssistantProposal[];
  error?: string;
}

interface ConversationSummary {
  id: string;
  title: string;
  updatedAt: string | Date;
}

const SUGGESTIONS = [
  "What is due this week?",
  "When is my next exam?",
  "Can I skip tomorrow's classes?",
  "What did I save about React?",
  "What does my day look like?",
  "Summarise my last meeting notes",
];

export interface AssistantChatClientProps {
  assistantEnabled: boolean;
  initialConversations: ConversationSummary[];
  initialPrompt?: string;
  focusNoteId?: string;
}

export function AssistantChatClient({
  assistantEnabled,
  initialConversations,
  initialPrompt,
  focusNoteId,
}: AssistantChatClientProps) {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [conversations, setConversations] =
    useState<ConversationSummary[]>(initialConversations);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [input, setInput] = useState(initialPrompt ?? "");
  const [streaming, setStreaming] = useState(false);
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const [expandedToolsFor, setExpandedToolsFor] = useState<Record<string, boolean>>({});
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const autoSentRef = useRef(false);

  useEffect(() => {
    const syncOnline = () => setIsOffline(!navigator.onLine);
    syncOnline();
    window.addEventListener("online", syncOnline);
    window.addEventListener("offline", syncOnline);
    return () => {
      window.removeEventListener("online", syncOnline);
      window.removeEventListener("offline", syncOnline);
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeToolName]);

  const sendMessage = useCallback(
    async (textToSend?: string) => {
      const trimmed = (textToSend ?? input).trim();
      if (!trimmed || streaming || !assistantEnabled || isOffline) return;

      const userMsgId = `u-${Date.now()}`;
      const assistantTempId = `a-${Date.now()}`;
      setInput("");
      setStreaming(true);
      setActiveToolName(null);

      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: "user", content: trimmed },
        { id: assistantTempId, role: "assistant", content: "" },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch("/api/assistant/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            message: trimmed,
            conversationId,
            focusNoteId,
          }),
        });

        if (!res.ok || !res.body) {
          throw new Error(`Request failed (${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() ?? "";

          for (const block of blocks) {
            let eventName = "message";
            let dataStr = "";
            for (const line of block.split(/\r?\n/)) {
              if (line.startsWith("event:")) {
                eventName = line.slice(6).trim();
              } else if (line.startsWith("data:")) {
                dataStr += line.slice(5).trim();
              }
            }
            if (!dataStr) continue;

            let payload: Record<string, unknown>;
            try {
              payload = JSON.parse(dataStr);
            } catch {
              continue;
            }

            if (eventName === "token" && typeof payload.text === "string") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantTempId
                    ? { ...m, content: m.content + payload.text }
                    : m
                )
              );
            } else if (eventName === "tool_start" && typeof payload.name === "string") {
              setActiveToolName(payload.name);
            } else if (eventName === "tool_end") {
              setActiveToolName(null);
            } else if (eventName === "sources" && Array.isArray(payload.sources)) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantTempId
                    ? { ...m, sources: payload.sources as AssistantSource[] }
                    : m
                )
              );
            } else if (eventName === "proposals" && Array.isArray(payload.proposals)) {
              const persistedId =
                typeof payload.messageId === "string"
                  ? payload.messageId
                  : assistantTempId;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantTempId
                    ? {
                        ...m,
                        id: persistedId,
                        proposals: payload.proposals as AssistantProposal[],
                      }
                    : m
                )
              );
            } else if (eventName === "done") {
              if (typeof payload.conversationId === "string") {
                setConversationId(payload.conversationId);
                setConversations((prev) => {
                  const exists = prev.some((c) => c.id === payload.conversationId);
                  if (exists) return prev;
                  return [
                    {
                      id: payload.conversationId as string,
                      title: trimmed.slice(0, 60),
                      updatedAt: new Date().toISOString(),
                    },
                    ...prev,
                  ];
                });
              }
              if (typeof payload.messageId === "string") {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantTempId
                      ? {
                          ...m,
                          id: payload.messageId as string,
                          toolsUsed: Array.isArray(payload.toolsUsed)
                            ? (payload.toolsUsed as ToolUsageItem[])
                            : m.toolsUsed,
                        }
                      : m
                  )
                );
              }
            } else if (eventName === "error") {
              const errMsg =
                typeof payload.message === "string"
                  ? payload.message
                  : "Assistant failed to respond.";
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantTempId ? { ...m, error: errMsg } : m
                )
              );
            }
          }
        }
      } catch (err) {
        if ((err as Error)?.name === "AbortError") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantTempId && !m.content
                ? { ...m, content: "(Stopped)" }
                : m
            )
          );
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantTempId
                ? {
                    ...m,
                    error:
                      err instanceof Error ? err.message : "Failed to reach assistant",
                  }
                : m
            )
          );
        }
      } finally {
        setStreaming(false);
        setActiveToolName(null);
        abortRef.current = null;
      }
    },
    [assistantEnabled, conversationId, focusNoteId, input, isOffline, streaming]
  );

  useEffect(() => {
    if (initialPrompt && !autoSentRef.current && assistantEnabled && !isOffline) {
      autoSentRef.current = true;
      void sendMessage(initialPrompt);
    }
  }, [assistantEnabled, initialPrompt, isOffline, sendMessage]);

  function handleStop() {
    abortRef.current?.abort();
  }

  async function handleConfirmProposal(messageId: string, proposalId: string) {
    const res = await fetch(`/api/assistant/proposals/${proposalId}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      proposal?: AssistantProposal;
      error?: string;
    };
    if (!res.ok || !data.proposal) {
      toast.error(data.error || "Could not confirm proposal");
      return;
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              proposals: m.proposals?.map((p) =>
                p.id === proposalId ? data.proposal! : p
              ),
            }
          : m
      )
    );
    toast.success("Confirmed");
  }

  async function handleDismissProposal(messageId: string, proposalId: string) {
    const res = await fetch(`/api/assistant/proposals/${proposalId}/dismiss`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId }),
    });
    const data = (await res.json()) as {
      ok?: boolean;
      proposal?: AssistantProposal;
      error?: string;
    };
    if (!res.ok || !data.proposal) {
      toast.error(data.error || "Could not dismiss proposal");
      return;
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId
          ? {
              ...m,
              proposals: m.proposals?.map((p) =>
                p.id === proposalId ? data.proposal! : p
              ),
            }
          : m
      )
    );
  }

  async function handleSaveToNotes(content: string) {
    const res = await createCaptureNote({
      kind: "note",
      title: "Assistant Answer",
      content,
    });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("Saved to Notes");
  }

  async function handleLoadConversation(id: string) {
    const conv = await loadConversationAction(id);
    setHistoryOpen(false);
    if (!conv) return;
    setConversationId(conv.id);
    setMessages(
      conv.messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          toolsUsed: Array.isArray(m.toolCalls)
            ? (m.toolCalls as unknown as ToolUsageItem[])
            : undefined,
          sources: Array.isArray(m.sources)
            ? (m.sources as unknown as AssistantSource[])
            : undefined,
          proposals: Array.isArray(m.proposals)
            ? (m.proposals as unknown as AssistantProposal[])
            : undefined,
        }))
    );
  }

  async function handleDeleteConversation(id: string) {
    const res = await deleteConversationAction(id);
    if (res.ok) {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (conversationId === id) {
        setConversationId(undefined);
        setMessages([]);
      }
      toast.success("Conversation deleted");
    }
  }

  function handleNewChat() {
    setConversationId(undefined);
    setMessages([]);
    setHistoryOpen(false);
  }

  return (
    <div className="flex h-[calc(100dvh-10rem)] lg:h-[calc(100dvh-6rem)] flex-col">
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-2 pb-3 border-b border-border">
        <div>
          <h1 className="page-heading">Ask</h1>
          <p className="text-xs text-muted-foreground">
            Grounded in your schedule, attendance, tasks, and notes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleNewChat}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            New
          </button>
          <button
            type="button"
            aria-label="Conversation history"
            onClick={() => setHistoryOpen(true)}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg border border-border bg-card text-foreground hover:bg-muted"
          >
            <History className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Disabled or Offline Banner */}
      {!assistantEnabled && (
        <div className="mt-3 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          The AI assistant is turned off. Enable it in{" "}
          <Link href="/settings" className="underline text-foreground">
            Settings
          </Link>
          .
        </div>
      )}

      {isOffline && (
        <div className="mt-3 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
          You are offline. Reconnect to ask the assistant.
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto py-4 space-y-4">
        {messages.length === 0 && (
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Ask about your week, attendance buffer, upcoming exams, or saved links:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={!assistantEnabled || isOffline}
                  onClick={() => void sendMessage(s)}
                  className="min-h-[44px] rounded-xl border border-border bg-card px-3.5 py-2.5 text-left text-sm text-foreground hover:bg-muted disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, idx) => (
          <div
            key={m.id}
            className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}
          >
            <div
              className={`max-w-[92%] sm:max-w-[82%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card text-foreground"
              }`}
            >
              {m.content || (streaming && idx === messages.length - 1 ? "Thinking..." : "")}

              {m.error && (
                <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                  <span>{m.error}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const prevUser = [...messages]
                        .slice(0, idx)
                        .reverse()
                        .find((x) => x.role === "user");
                      if (prevUser) void sendMessage(prevUser.content);
                    }}
                    className="inline-flex min-h-[36px] items-center gap-1 underline"
                  >
                    <RefreshCw className="h-3 w-3" aria-hidden="true" />
                    Retry
                  </button>
                </div>
              )}

              {/* Looked at tools */}
              {m.toolsUsed && m.toolsUsed.length > 0 && (
                <div className="mt-2 border-t border-border/60 pt-2">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedToolsFor((p) => ({ ...p, [m.id]: !p[m.id] }))
                    }
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {expandedToolsFor[m.id] ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    Looked at:{" "}
                    {Array.from(new Set(m.toolsUsed.map((t) => t.name))).join(", ")}
                  </button>
                  {expandedToolsFor[m.id] && (
                    <ul className="mt-1 space-y-1 text-[11px] text-muted-foreground">
                      {m.toolsUsed.map((t, ti) => (
                        <li key={`${t.name}-${ti}`}>
                          <code>{t.name}</code> ({t.durationMs}ms): {t.argsSummary}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Sources */}
              {m.sources && m.sources.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.sources.map((s) => (
                    <Link
                      key={`${s.type}:${s.id}`}
                      href={s.href}
                      className="inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      {s.title}
                    </Link>
                  ))}
                </div>
              )}

              {/* Proposals */}
              {m.proposals && m.proposals.length > 0 && (
                <div className="mt-3 space-y-2">
                  {m.proposals.map((p) => (
                    <div
                      key={p.id}
                      className="rounded-xl border border-border bg-background p-3 space-y-2"
                    >
                      <p className="text-xs font-medium text-foreground">{p.summary}</p>
                      {p.status === "pending" && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleConfirmProposal(m.id, p.id)}
                            className="inline-flex min-h-[44px] items-center gap-1 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                          >
                            <Check className="h-3.5 w-3.5" aria-hidden="true" />
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDismissProposal(m.id, p.id)}
                            className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-border px-3 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <X className="h-3.5 w-3.5" aria-hidden="true" />
                            Dismiss
                          </button>
                        </div>
                      )}
                      {p.status === "confirmed" && p.resultRef && (
                        <Link
                          href={p.resultRef.href}
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary underline"
                        >
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          {p.resultRef.label}
                        </Link>
                      )}
                      {p.status === "dismissed" && (
                        <span className="text-xs text-muted-foreground">Dismissed</span>
                      )}
                      {p.status === "expired" && (
                        <span className="text-xs text-muted-foreground">Expired</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Answer actions */}
              {m.role === "assistant" && m.content && !streaming && (
                <div className="mt-2 flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(m.content);
                      toast.success("Copied");
                    }}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Copy className="h-3 w-3" aria-hidden="true" />
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveToNotes(m.content)}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <BookmarkPlus className="h-3 w-3" aria-hidden="true" />
                    Save to Notes
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {activeToolName && (
          <p className="text-xs text-muted-foreground px-1">
            Checking <code>{activeToolName}</code>...
          </p>
        )}
        <div ref={endRef} />
      </div>

      {/* Sticky Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendMessage();
        }}
        className="flex items-center gap-2 border-t border-border pt-3 pb-[env(safe-area-inset-bottom,0px)]"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={!assistantEnabled || isOffline}
          placeholder="Ask about schedule, attendance, deadlines, notes..."
          className="flex-1 min-h-[44px] rounded-xl border border-input bg-background px-3.5 text-sm text-foreground placeholder:text-muted-foreground"
        />
        {streaming ? (
          <button
            type="button"
            onClick={handleStop}
            aria-label="Stop response"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-destructive text-destructive-foreground"
          >
            <Square className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim() || !assistantEnabled || isOffline}
            aria-label="Send message"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        )}
      </form>

      {/* Conversation History Sheet */}
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[75dvh] overflow-y-auto">
          <SheetHeader className="pb-3">
            <SheetTitle className="font-serif">Conversations</SheetTitle>
          </SheetHeader>
          <div className="space-y-2 pb-4">
            {conversations.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No saved conversations yet.
              </p>
            )}
            {conversations.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-1"
              >
                <button
                  type="button"
                  onClick={() => void handleLoadConversation(c.id)}
                  className="min-h-[44px] flex-1 truncate text-left text-sm text-foreground"
                >
                  {c.title}
                </button>
                <button
                  type="button"
                  aria-label="Delete conversation"
                  onClick={() => void handleDeleteConversation(c.id)}
                  className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
