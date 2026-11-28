import { getCurrentUserId } from "@/lib/auth";
import { getAiPreferences, listConversations } from "@/features/assistant/lib/persistence";
import { AssistantChatClient } from "@/features/assistant/components/AssistantChatClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AskPage({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string; focusNoteId?: string }>;
}) {
  const userId = await getCurrentUserId();
  const [params, prefs, conversations] = await Promise.all([
    searchParams,
    getAiPreferences(userId),
    listConversations(userId),
  ]);

  return (
    <AssistantChatClient
      assistantEnabled={prefs.assistantEnabled}
      initialConversations={conversations}
      initialPrompt={params.prompt}
      focusNoteId={params.focusNoteId}
    />
  );
}
