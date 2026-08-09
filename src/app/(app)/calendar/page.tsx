import { CalendarView } from "@/features/calendar/components/calendar-view";

export const revalidate = 0;

export default async function CalendarPage() {
  return (
    <div>
      <CalendarView />
    </div>
  );
}
