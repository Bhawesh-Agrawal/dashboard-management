import type { ChecklistItem, MeetingMeta, QuoteMeta } from "./capture-types";

export function formatMeetingPlainText(
  title: string,
  meta: MeetingMeta,
  notesBody: string
): string {
  const lines: string[] = [];
  const heading = title.trim() || `Meeting, ${meta.date}`;
  lines.push(heading);
  lines.push(`Date: ${meta.date}`);

  if (meta.attendees.trim()) {
    lines.push(`Attendees: ${meta.attendees.trim()}`);
  }
  if (meta.agenda.trim()) {
    lines.push("");
    lines.push("Agenda:");
    lines.push(meta.agenda.trim());
  }
  if (notesBody.trim()) {
    lines.push("");
    lines.push("Notes:");
    lines.push(notesBody.trim());
  }
  if (meta.decisions.trim()) {
    lines.push("");
    lines.push("Decisions:");
    lines.push(meta.decisions.trim());
  }
  if (meta.actionItems.length > 0) {
    lines.push("");
    lines.push("Action Items:");
    for (const item of meta.actionItems) {
      const box = item.done ? "[x]" : "[ ]";
      const suffixParts: string[] = [];
      if (item.owner?.trim()) suffixParts.push(`@${item.owner.trim()}`);
      if (item.due?.trim()) suffixParts.push(`due ${item.due.trim()}`);
      const suffix = suffixParts.length > 0 ? ` (${suffixParts.join(", ")})` : "";
      lines.push(`- ${box} ${item.text}${suffix}`);
    }
  }
  if (meta.nextMeeting?.trim()) {
    lines.push("");
    lines.push(`Next Meeting: ${meta.nextMeeting.trim()}`);
  }

  return lines.join("\n");
}

export function formatMeetingMarkdown(meta: MeetingMeta, notesBody: string): string {
  const parts: string[] = [];
  if (meta.attendees.trim()) parts.push(`**Attendees:** ${meta.attendees.trim()}`);
  if (meta.agenda.trim()) parts.push(`### Agenda\n${meta.agenda.trim()}`);
  if (notesBody.trim()) parts.push(`### Notes\n${notesBody.trim()}`);
  if (meta.decisions.trim()) parts.push(`### Decisions\n${meta.decisions.trim()}`);
  if (meta.actionItems.length > 0) {
    const items = meta.actionItems
      .map((i) => {
        const extra = [i.owner?.trim() ? `@${i.owner.trim()}` : "", i.due?.trim() ? `due ${i.due.trim()}` : ""]
          .filter(Boolean)
          .join(", ");
        return `- [${i.done ? "x" : " "}] ${i.text}${extra ? ` (${extra})` : ""}`;
      })
      .join("\n");
    parts.push(`### Action Items\n${items}`);
  }
  if (meta.nextMeeting?.trim()) parts.push(`**Next Meeting:** ${meta.nextMeeting.trim()}`);
  return parts.join("\n\n") || notesBody.trim() || `Meeting (${meta.date})`;
}

export function formatChecklistMarkdown(items: ChecklistItem[]): string {
  return items.map((i) => `- [${i.done ? "x" : " "}] ${i.text}`).join("\n");
}

export function formatQuoteMarkdown(meta: QuoteMeta): string {
  return meta.source?.trim() ? `"${meta.text}" — ${meta.source.trim()}` : `"${meta.text}"`;
}
