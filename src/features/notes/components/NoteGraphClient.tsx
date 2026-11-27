"use client";

import dynamic from "next/dynamic";
import type { NoteGraphData } from "@/types";

const NoteGraphView = dynamic(
  () => import("./note-graph-view").then((m) => m.NoteGraphView),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full rounded-lg bg-muted animate-pulse" />
    ),
  }
);

export function NoteGraphClient({
  data,
  className = "",
}: {
  data: NoteGraphData;
  className?: string;
}) {
  return <NoteGraphView data={data} className={className} />;
}
