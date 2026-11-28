import { z } from "zod";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

export type AIErrorCode =
  | "not_configured"
  | "rate_limited"
  | "timeout"
  | "provider_error"
  | "invalid_output"
  | "budget_exceeded";

export class AIError extends Error {
  readonly code: AIErrorCode;
  readonly status?: number;
  readonly retryAfterMs?: number;

  constructor(
    code: AIErrorCode,
    message: string,
    options?: { status?: number; retryAfterMs?: number; cause?: unknown }
  ) {
    super(message);
    this.name = "AIError";
    this.code = code;
    this.status = options?.status;
    this.retryAfterMs = options?.retryAfterMs;
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export interface AIToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface AIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls?: AIToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string; name?: string };

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  tools?: AIToolDefinition[];
  toolChoice?: "auto" | "none" | "required" | { type: "function"; function: { name: string } };
  responseFormat?: { type: "json_object" };
  fetchFn?: typeof fetch;
  maxRetries?: number;
}

export interface ChatCompletionToolResult {
  content: string | null;
  toolCalls: AIToolCall[];
  finishReason: string | null;
  usage: TokenUsage;
  model: string;
}

export type AIStreamEvent =
  | { type: "text_delta"; text: string }
  | {
      type: "tool_call_delta";
      index: number;
      id?: string;
      name?: string;
      argumentsDelta?: string;
    }
  | { type: "usage"; usage: TokenUsage }
  | { type: "done"; finishReason: string | null };

export type AIResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: AIErrorCode };

export function getAssistantModel(): string {
  return process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b";
}

export function getFastModel(): string {
  return process.env.OPENROUTER_MODEL_FAST || getAssistantModel();
}

export function getAppUrl(): string {
  return process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://codexdash.app";
}

function getApiKey(): string | null {
  return process.env.OPENROUTER_API_KEY || null;
}

function parseRetryAfterMs(headerVal: string | null): number | undefined {
  if (!headerVal) return undefined;
  const seconds = Number(headerVal);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, 30_000);
  }
  const dateMs = Date.parse(headerVal);
  if (!Number.isNaN(dateMs)) {
    return Math.min(Math.max(0, dateMs - Date.now()), 30_000);
  }
  return undefined;
}

function normalizeUsage(raw: unknown): TokenUsage {
  const u = (raw && typeof raw === "object" ? raw : {}) as {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  const promptTokens = Number(u.prompt_tokens) || 0;
  const completionTokens = Number(u.completion_tokens) || 0;
  const totalTokens = Number(u.total_tokens) || promptTokens + completionTokens;
  return { promptTokens, completionTokens, totalTokens };
}

function linkSignals(
  timeoutMs: number,
  externalSignal?: AbortSignal
): { signal: AbortSignal; cleanup: () => void; didTimeout: () => boolean } {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new AIError("timeout", `AI request timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  const onExternalAbort = () => {
    controller.abort(externalSignal?.reason);
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason);
    } else {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    },
  };
}

async function sleepWithJitter(baseMs: number): Promise<void> {
  const jitter = Math.floor(Math.random() * 150);
  await new Promise((resolve) => setTimeout(resolve, baseMs + jitter));
}

async function fetchOpenRouter(
  body: Record<string, unknown>,
  options?: ChatCompletionOptions
): Promise<Response> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new AIError("not_configured", "OPENROUTER_API_KEY is not configured");
  }

  const fetchFn = options?.fetchFn ?? fetch;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = options?.maxRetries ?? MAX_RETRIES;

  let attempt = 0;
  while (true) {
    const { signal, cleanup, didTimeout } = linkSignals(timeoutMs, options?.signal);
    try {
      const response = await fetchFn(OPENROUTER_API_URL, {
        method: "POST",
        signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": getAppUrl(),
          "X-Title": "CodexDash",
        },
        body: JSON.stringify(body),
      });

      if (response.ok) {
        return response;
      }

      const errorText = (await response.text().catch(() => "")).slice(0, 200);
      const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
      const isRetryable = response.status === 429 || response.status >= 500;

      if (isRetryable && attempt < maxRetries && !options?.signal?.aborted) {
        attempt++;
        const backoffMs = retryAfterMs ?? Math.min(500 * 2 ** (attempt - 1), 8_000);
        await sleepWithJitter(backoffMs);
        continue;
      }

      if (response.status === 429) {
        throw new AIError("rate_limited", `OpenRouter rate limited (429): ${errorText}`, {
          status: 429,
          retryAfterMs,
        });
      }

      throw new AIError(
        "provider_error",
        `OpenRouter API error (${response.status}): ${errorText}`,
        { status: response.status }
      );
    } catch (error) {
      if (error instanceof AIError) {
        throw error;
      }
      if (didTimeout()) {
        throw new AIError("timeout", `OpenRouter request timed out after ${timeoutMs}ms`, {
          cause: error,
        });
      }
      if (options?.signal?.aborted) {
        throw new AIError("timeout", "OpenRouter request aborted", { cause: error });
      }
      if (attempt < maxRetries) {
        attempt++;
        await sleepWithJitter(500 * 2 ** (attempt - 1));
        continue;
      }
      throw new AIError(
        "provider_error",
        error instanceof Error ? error.message : "Network error calling OpenRouter",
        { cause: error }
      );
    } finally {
      cleanup();
    }
  }
}

export async function chatCompletionWithTools(
  messages: ChatMessage[],
  options?: ChatCompletionOptions
): Promise<ChatCompletionToolResult> {
  const model = options?.model || getAssistantModel();
  const startedAt = Date.now();

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: options?.temperature ?? 0.3,
    max_tokens: options?.maxTokens ?? 1024,
  };
  if (options?.tools && options.tools.length > 0) {
    body.tools = options.tools;
    body.tool_choice = options.toolChoice ?? "auto";
  }
  if (options?.responseFormat) {
    body.response_format = options.responseFormat;
  }

  const response = await fetchOpenRouter(body, options);
  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: AIToolCall[];
      };
      finish_reason?: string | null;
    }>;
    usage?: unknown;
  };

  if (!data.choices || data.choices.length === 0) {
    throw new AIError("provider_error", "No response choices from OpenRouter");
  }

  const choice = data.choices[0];
  const usage = normalizeUsage(data.usage);
  const durationMs = Date.now() - startedAt;

  console.info(
    JSON.stringify({
      event: "ai.completion",
      model,
      durationMs,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      finishReason: choice.finish_reason ?? null,
    })
  );

  return {
    content: choice.message?.content ?? null,
    toolCalls: Array.isArray(choice.message?.tool_calls) ? choice.message.tool_calls : [],
    finishReason: choice.finish_reason ?? null,
    usage,
    model,
  };
}

export async function chatCompletion(
  messages: ChatMessage[],
  options?: ChatCompletionOptions
): Promise<string> {
  const res = await chatCompletionWithTools(messages, options);
  return res.content ?? "";
}

export async function* streamChatCompletion(
  messages: ChatMessage[],
  options?: ChatCompletionOptions
): AsyncGenerator<AIStreamEvent> {
  const model = options?.model || getAssistantModel();
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    temperature: options?.temperature ?? 0.3,
    max_tokens: options?.maxTokens ?? 1024,
  };
  if (options?.tools && options.tools.length > 0) {
    body.tools = options.tools;
    body.tool_choice = options.toolChoice ?? "auto";
  }

  const response = await fetchOpenRouter(body, options);
  if (!response.body) {
    throw new AIError("provider_error", "OpenRouter streaming response had no body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lastFinishReason: string | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(":")) continue;
        if (!trimmed.startsWith("data:")) continue;

        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") {
          yield { type: "done", finishReason: lastFinishReason };
          return;
        }

        let chunk: {
          choices?: Array<{
            delta?: {
              content?: string | null;
              tool_calls?: Array<{
                index?: number;
                id?: string;
                function?: { name?: string; arguments?: string };
              }>;
            };
            finish_reason?: string | null;
          }>;
          usage?: unknown;
        };
        try {
          chunk = JSON.parse(payload);
        } catch {
          continue;
        }

        if (chunk.usage) {
          yield { type: "usage", usage: normalizeUsage(chunk.usage) };
        }

        const choice = chunk.choices?.[0];
        if (!choice) continue;
        if (choice.finish_reason) {
          lastFinishReason = choice.finish_reason;
        }

        const delta = choice.delta;
        if (delta?.content) {
          yield { type: "text_delta", text: delta.content };
        }
        if (Array.isArray(delta?.tool_calls)) {
          for (const tc of delta.tool_calls) {
            yield {
              type: "tool_call_delta",
              index: tc.index ?? 0,
              id: tc.id,
              name: tc.function?.name,
              argumentsDelta: tc.function?.arguments,
            };
          }
        }
      }
    }
    yield { type: "done", finishReason: lastFinishReason };
  } finally {
    reader.releaseLock();
  }
}

function stripJsonFences(raw: string): string {
  const trimmed = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fence ? fence[1].trim() : trimmed;
}

export async function chatCompletionJson<T>(
  messages: ChatMessage[],
  schema: z.ZodType<T>,
  options?: ChatCompletionOptions
): Promise<{ data: T; usage: TokenUsage }> {
  const first = await chatCompletionWithTools(messages, {
    ...options,
    responseFormat: { type: "json_object" },
  });
  let totalUsage = { ...first.usage };

  const attemptParse = (raw: string | null) => {
    if (!raw) return null;
    const cleaned = stripJsonFences(raw);
    const parsedJson = JSON.parse(cleaned);
    return schema.safeParse(parsedJson);
  };

  try {
    const check = attemptParse(first.content);
    if (check?.success) {
      return { data: check.data, usage: totalUsage };
    }
  } catch {
    // Fall through to one repair retry
  }

  const repairMessages: ChatMessage[] = [
    ...messages,
    { role: "assistant", content: first.content ?? "" },
    {
      role: "user",
      content:
        "Your previous response was not valid JSON matching the required schema. Return ONLY valid JSON with no markdown fences or commentary.",
    },
  ];

  const second = await chatCompletionWithTools(repairMessages, {
    ...options,
    responseFormat: { type: "json_object" },
  });
  totalUsage = {
    promptTokens: totalUsage.promptTokens + second.usage.promptTokens,
    completionTokens: totalUsage.completionTokens + second.usage.completionTokens,
    totalTokens: totalUsage.totalTokens + second.usage.totalTokens,
  };

  try {
    const check2 = attemptParse(second.content);
    if (check2?.success) {
      return { data: check2.data, usage: totalUsage };
    }
  } catch {
    // Throw invalid_output below
  }

  throw new AIError("invalid_output", "AI response failed JSON schema validation after repair retry");
}

export async function tryAI<T>(fn: () => Promise<T>, context: string): Promise<AIResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (error) {
    const code = error instanceof AIError ? error.code : "provider_error";
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`AI call failed (${context}, code=${code}):`, message);
    return {
      ok: false,
      code,
      error: `AI temporarily unavailable (${context}). Please try again later.`,
    };
  }
}

export async function askAI(
  messages: ChatMessage[],
  context: string,
  options?: ChatCompletionOptions
): Promise<AIResult<string>> {
  return tryAI(() => chatCompletion(messages, options), context);
}

export async function checkAIAvailability(): Promise<{
  configured: boolean;
  available: boolean;
  model: string;
}> {
  const model = getAssistantModel();
  if (!getApiKey()) {
    return { configured: false, available: false, model };
  }

  try {
    const result = await chatCompletion(
      [{ role: "user", content: "Reply with OK" }],
      { maxTokens: 5, temperature: 0, model: getFastModel(), timeoutMs: 8000 }
    );
    return { configured: true, available: result.trim().length > 0, model };
  } catch {
    return { configured: true, available: false, model };
  }
}
