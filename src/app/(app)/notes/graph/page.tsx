import { getNoteGraphData } from "@/features/notes/lib/semantic-links";
import { getCurrentUserId } from "@/lib/auth";
import { NoteGraphView } from "@/features/notes/components/note-graph-view";
import { PageHeader } from "@/components/shared/page-header";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function NoteGraphPage() {
  const userId = await getCurrentUserId();
  const graphData = await getNoteGraphData(userId, 100);

  return (
    <div className="flex flex-col h-[calc(100dvh-4rem)]">
      <PageHeader
        title="Note Graph"
        subtitle={`${graphData.nodes.length} notes, ${graphData.edges.length} connections`}
        backHref="/notes"
        action={
          <Link
            href="/notes"
            className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border text-sm font-medium hover:bg-accent transition-colors"
          >
            Back to Notes
          </Link>
        }
      />
      <div className="flex-1 min-h-0 -mx-6">
        <NoteGraphView data={graphData} className="h-full" />
      </div>
    </div>
  );
}
