/**
 * OpenRouter API client with graceful fallback pattern.
 *
 * All AI features (Ask, NLP parsing) use this shared client.
 * Every caller uses the tryAI() wrapper to handle failures gracefully.
 *
 * Environment variables:
 * - OPENROUTER_API_KEY: API key from OpenRouter
 * - OPENROUTER_MODEL: Model to use (default: openai/gpt-oss-120b)
 */

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ChatCompletionResponse = {
  choices: {
    message: {
      content: string;
    };
    finish_reason: string | null;
  }[];
};

/**
 * Result type for AI operations.
 * All AI callers receive this type — never throw, always return ok: false on failure.
 */
export type AIResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Shared error-handling wrapper for all AI operations.
 * Catches errors and returns a structured error result instead of throwing.
 */
export async function tryAI<T>(
  fn: () => Promise<T>,
  context: string
): Promise<AIResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`AI call failed (${context}):`, message);
    return {
      ok: false,
      error: `AI temporarily unavailable (${context}). Please try again later.`,
    };
  }
}

/**
 * Get the configured model name from environment.
 */
function getModel(): string {
  return process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b";
}

/**
 * Get the API key from environment.
 */
function getApiKey(): string | null {
  return process.env.OPENROUTER_API_KEY || null;
}

/**
 * Send a chat completion request to OpenRouter.
 * Returns the assistant's response content.
 *
 * @throws If API key is missing or request fails
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const model = options?.model || getModel();

  const response = await fetch(OPENROUTER_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://academic-command-center.vercel.app",
      "X-Title": "CodexDash",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options?.temperature ?? 0.3,
      max_tokens: options?.maxTokens ?? 1024,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OpenRouter API error (${response.status}): ${errorText.slice(0, 200)}`
    );
  }

  const data: ChatCompletionResponse = await response.json();

  if (!data.choices || data.choices.length === 0) {
    throw new Error("No response from OpenRouter");
  }

  const choice = data.choices[0];
  if (choice.finish_reason === "length") {
    console.warn("AI response was truncated (finish_reason: length). Consider increasing maxTokens.");
  }

  return choice.message.content;
}

/**
 * Simple wrapper for chat completion with graceful fallback.
 * Returns the response or an error result — never throws.
 */
export async function askAI(
  messages: ChatMessage[],
  context: string,
  options?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
  }
): Promise<AIResult<string>> {
  return tryAI(
    () => chatCompletion(messages, options),
    context
  );
}

/**
 * Check if the AI service is configured and available.
 * Useful for showing connection status in the UI.
 */
export async function checkAIAvailability(): Promise<{
  configured: boolean;
  available: boolean;
}> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return { configured: false, available: false };
  }

  try {
    await chatCompletion(
      [{ role: "user", content: "Hello" }],
      { maxTokens: 5 }
    );
    return { configured: true, available: true };
  } catch {
    return { configured: true, available: false };
  }
}
