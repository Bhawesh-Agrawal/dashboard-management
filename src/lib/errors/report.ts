import { toast } from "sonner";

export function createRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().slice(0, 8);
  }
  return Math.random().toString(36).slice(2, 10);
}

export function logStructuredError(
  context: string,
  err: unknown,
  requestId = createRequestId()
): string {
  const message = err instanceof Error ? err.message : String(err ?? "Unknown error");
  console.error(
    JSON.stringify({
      level: "error",
      requestId,
      context,
      message,
      timestamp: new Date().toISOString(),
    })
  );
  return requestId;
}

export function notifySuccess(message: string) {
  toast.success(message);
}

export function notifyFailure(
  userMessage: string,
  context = "ui",
  err?: unknown
): string {
  const requestId = err ? logStructuredError(context, err) : createRequestId();
  toast.error(userMessage);
  return requestId;
}
