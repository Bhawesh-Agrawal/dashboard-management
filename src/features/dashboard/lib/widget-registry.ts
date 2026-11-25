// Widget registry — maps widget IDs to labels and default column assignments.
// The Today page uses this to render widgets in the user's preferred order.

export type WidgetId =
  | "TopThree"
  | "DailyTimeline"
  | "UpNext"
  | "AllOpenTasks"
  | "OngoingProjects"
  | "ReviewPreviewWidget"
  | "AttendanceAlerts"
  | "TomorrowRoutines"
  | "FocusCarousel"
  | "SemesterSnapshot"
  | "ContributionGraph"
  | "ActiveUpcoming"
  | "DsaSummary";

export type WidgetColumn = "main" | "sidebar";

export const WIDGET_REGISTRY: Record<
  WidgetId,
  { label: string; defaultColumn: WidgetColumn }
> = {
  TopThree: { label: "Top Three", defaultColumn: "main" },
  DailyTimeline: { label: "Daily Timeline", defaultColumn: "main" },
  UpNext: { label: "Up Next", defaultColumn: "main" },
  AllOpenTasks: { label: "All Open Tasks", defaultColumn: "main" },
  OngoingProjects: { label: "Ongoing Projects", defaultColumn: "main" },
  ReviewPreviewWidget: { label: "Latest Review", defaultColumn: "sidebar" },
  AttendanceAlerts: { label: "Attendance Alerts", defaultColumn: "sidebar" },
  DsaSummary: { label: "DSA Revisions", defaultColumn: "sidebar" },
  TomorrowRoutines: { label: "Tomorrow's Routines", defaultColumn: "sidebar" },
  FocusCarousel: { label: "Focus", defaultColumn: "sidebar" },
  SemesterSnapshot: { label: "Semester Snapshot", defaultColumn: "sidebar" },
  ContributionGraph: { label: "Contribution Graph", defaultColumn: "sidebar" },
  ActiveUpcoming: { label: "Active & Upcoming", defaultColumn: "sidebar" },
};

export const DEFAULT_MAIN_ORDER: WidgetId[] = [
  "TopThree",
  "DailyTimeline",
  "UpNext",
  "AllOpenTasks",
  "OngoingProjects",
];

export const DEFAULT_SIDEBAR_ORDER: WidgetId[] = [
  "ActiveUpcoming",
  "DsaSummary",
  "ReviewPreviewWidget",
  "AttendanceAlerts",
  "TomorrowRoutines",
  "FocusCarousel",
  "SemesterSnapshot",
  "ContributionGraph",
];

/**
 * Resolve a persisted widget order into main/sidebar columns.
 * Handles new widgets added since the user last saved their layout.
 */
export function resolveLayout(widgetOrder: string[]) {
  const orderSet = new Set(widgetOrder);
  const main: WidgetId[] = [];
  const sidebar: WidgetId[] = [];

  // Place ordered widgets in their assigned columns
  for (const id of widgetOrder) {
    if (!(id in WIDGET_REGISTRY)) continue;
    const col = WIDGET_REGISTRY[id as WidgetId].defaultColumn;
    if (col === "main") main.push(id as WidgetId);
    else sidebar.push(id as WidgetId);
  }

  // Append any new widgets not yet in the saved order
  for (const id of DEFAULT_MAIN_ORDER) {
    if (!orderSet.has(id)) main.push(id);
  }
  for (const id of DEFAULT_SIDEBAR_ORDER) {
    if (!orderSet.has(id)) sidebar.push(id);
  }

  return { main, sidebar };
}
