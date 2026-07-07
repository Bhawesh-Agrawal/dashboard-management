import Link from "next/link";
import type { DashboardData } from "@/types";

export function TodaysClasses({
  classes,
}: {
  classes: DashboardData["todayClasses"];
}) {
  return (
    <div>
      <p className="section-label mb-3">Today&apos;s Classes</p>
      {classes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No classes today.</p>
      ) : (
        <div className="space-y-0.5">
          {classes.map((cls) => (
            <div key={cls.id} className="list-row items-center">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {cls.startTime} — {cls.endTime}
                </span>
              </div>
              <div className="flex-1">
                <Link
                  href={`/courses/${cls.course.id}`}
                  className="text-sm hover:underline"
                >
                  {cls.course.name}
                </Link>
                {cls.location && (
                  <span className="text-xs text-muted-foreground ml-2">
                    {cls.location}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
