import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AIError,
  chatCompletionJson,
  chatCompletionWithTools,
  streamChatCompletion,
} from "../openrouter";

describe("OpenRouter client v2", () => {
  const originalKey = process.env.OPENROUTER_API_KEY;

  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env.OPENROUTER_API_KEY = originalKey;
  });

  it("throws not_configured when OPENROUTER_API_KEY is missing", async () => {
    delete process.env.OPENROUTER_API_KEY;
    await expect(
      chatCompletionWithTools([{ role: "user", content: "hi" }])
    ).rejects.toMatchObject({ code: "not_configured" });
  });

  it("retries 429 and 5xx and succeeds with token usage", async () => {
    let calls = 0;
    const fakeFetch: typeof fetch = async () => {
      calls++;
      if (calls === 1) {
        return new Response("rate limit", {
          status: 429,
          headers: { "retry-after": "0" },
        });
      }
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "ok", tool_calls: [] }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
        { status: 200 }
      );
    };

    const res = await chatCompletionWithTools([{ role: "user", content: "hi" }], {
      fetchFn: fakeFetch,
      maxRetries: 2,
    });
    expect(calls).toBe(2);
    expect(res.content).toBe("ok");
    expect(res.usage.totalTokens).toBe(15);
  });

  it("aborts via AbortController on timeout", async () => {
    const fakeFetch: typeof fetch = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });

    await expect(
      chatCompletionWithTools([{ role: "user", content: "hi" }], {
        fetchFn: fakeFetch,
        timeoutMs: 30,
        maxRetries: 0,
      })
    ).rejects.toBeInstanceOf(AIError);
  });

  it("parses SSE streaming text deltas, tool call deltas, and usage", async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"tc1","function":{"name":"get_tasks","arguments":"{\\"status\\""}}]}}]}\n\n',
      'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":":\\"pending\\"}"}}]},"finish_reason":"tool_calls"}]}\n\n',
      'data: {"usage":{"prompt_tokens":12,"completion_tokens":8,"total_tokens":20}}\n\n',
      "data: [DONE]\n\n",
    ].join("");

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(sse));
        controller.close();
      },
    });

    const fakeFetch: typeof fetch = async () => new Response(stream, { status: 200 });

    const events = [];
    for await (const ev of streamChatCompletion([{ role: "user", content: "hi" }], {
      fetchFn: fakeFetch,
    })) {
      events.push(ev);
    }

    expect(events.some((e) => e.type === "text_delta" && e.text === "Hello ")).toBe(true);
    expect(events.some((e) => e.type === "tool_call_delta" && e.name === "get_tasks")).toBe(true);
    expect(events.some((e) => e.type === "usage" && e.usage.totalTokens === 20)).toBe(true);
    expect(events.some((e) => e.type === "done" && e.finishReason === "tool_calls")).toBe(true);
  });

  it("performs one repair retry on invalid JSON output", async () => {
    let calls = 0;
    const fakeFetch: typeof fetch = async () => {
      calls++;
      const content = calls === 1 ? "not valid json" : '{"name":"Alice"}';
      return new Response(
        JSON.stringify({
          choices: [{ message: { content }, finish_reason: "stop" }],
          usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
        }),
        { status: 200 }
      );
    };

    const res = await chatCompletionJson(
      [{ role: "user", content: "json" }],
      z.object({ name: z.string() }),
      { fetchFn: fakeFetch }
    );
    expect(calls).toBe(2);
    expect(res.data).toEqual({ name: "Alice" });
    expect(res.usage.totalTokens).toBe(20);
  });
});
