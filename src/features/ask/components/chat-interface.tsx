"use client";

import { useState, useRef, useEffect } from "react";
import { askQuestion } from "@/features/ask/lib/actions";
import { Send, Loader2, AlertCircle, BookOpen } from "lucide-react";

type Message = {
  role: "user" | "assistant";
  content: string;
  contextUsed?: boolean;
};

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const question = input.trim();
    setInput("");
    setError(null);

    // Add user message
    const userMessage: Message = { role: "user", content: question };
    setMessages((prev) => [...prev, userMessage]);

    setLoading(true);

    const result = await askQuestion(question);

    setLoading(false);

    if (result.ok) {
      const assistantMessage: Message = {
        role: "assistant",
        content: result.data.answer,
        contextUsed: result.data.contextUsed,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } else {
      setError(result.error);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-12rem)]">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <BookOpen className="h-10 w-10 text-muted-foreground mb-4" />
            <h3 className="font-serif text-lg mb-2">Ask about your academics</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Ask questions about your courses, tasks, attendance, grades, or notes.
              The AI will search your data and provide answers.
            </p>
            <div className="mt-6 space-y-2 text-sm text-muted-foreground">
              <p className="font-medium">Try asking:</p>
              <ul className="space-y-1">
                <li>&quot;What&apos;s due this week in Physics?&quot;</li>
                <li>&quot;How&apos;s my attendance in Data Structures?&quot;</li>
                <li>&quot;Summarize my notes tagged exam-prep&quot;</li>
              </ul>
            </div>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                {msg.role === "assistant" && msg.contextUsed && (
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                    <BookOpen className="h-3 w-3" />
                    Based on your academic data
                  </p>
                )}
              </div>
            </div>
          ))
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-muted rounded-lg px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching your data and thinking...
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="flex justify-start">
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3">
              <div className="flex items-start gap-2 text-sm">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-destructive">
                    AI temporarily unavailable
                  </p>
                  <p className="text-muted-foreground mt-1">{error}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question..."
          disabled={loading}
          className="flex-1 h-10 px-4 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!mounted || !input.trim() || loading}
          className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-2"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Send
        </button>
      </form>
    </div>
  );
}
