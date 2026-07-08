import { PageHeader } from "@/components/shared/page-header";
import { CalendarView } from "@/features/calendar/components/calendar-view";

export const revalidate = 0;

export default async function CalendarPage() {
  const now = new Date();

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle={now.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
      />
      <CalendarView />
    </div>
  );
}
