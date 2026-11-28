export type AssistantSseEventName =
  | "token"
  | "tool_start"
  | "tool_end"
  | "sources"
  | "proposals"
  | "done"
  | "error";

export function formatSseEvent(event: AssistantSseEventName, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}
