import { ChatInterface } from "@/features/ask/components/chat-interface";
import { PageHeader } from "@/components/shared/page-header";

export const revalidate = 0;

export default function AskPage() {
  return (
    <div>
      <PageHeader title="Ask" subtitle="Chat with your academic data" />
      <div className="mt-6">
        <ChatInterface />
      </div>
    </div>
  );
}
