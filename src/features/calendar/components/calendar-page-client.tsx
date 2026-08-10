"use client";

import { useTasks, useEvents } from "@/lib/sync/hooks";
import { CalendarView } from "@/features/calendar/components/calendar-view";

export default function CalendarPageClient() {
  const dexieTasks = useTasks();
  const dexieEvents = useEvents();

  // Pass Dexie data to CalendarView for local-first rendering
  return (
    <div>
      <CalendarView
        externalTasks={dexieTasks.map((t) => ({
          id: t.id,
          title: t.title,
          dueDate: t.dueDate,
          courseId: t.courseId,
          courseName: t.courseName,
          courseColor: t.courseColor,
        }))}
        externalEvents={dexieEvents.map((e) => ({
          id: e.id,
          title: e.title,
          dateTime: e.dateTime,
          location: e.location,
          eventType: e.eventType,
        }))}
      />
    </div>
  );
}
