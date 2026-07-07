import Link from "next/link";
import type { DashboardData } from "@/types";
import { AlertTriangle } from "lucide-react";

export function AttendanceAlerts({
  alerts,
}: {
  alerts: DashboardData["attendanceAlerts"];
}) {
  if (alerts.length === 0) return null;

  return (
    <div>
      <p className="section-label mb-3">Attendance Alerts</p>
      <div className="space-y-2">
        {alerts.map((alert) => (
          <Link
            key={alert.courseId}
            href={`/courses/${alert.courseId}`}
            className="flex items-center gap-3 p-2.5 rounded-md bg-destructive/5 border border-destructive/20 hover:bg-destructive/10 transition-colors"
          >
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{alert.courseName}</span>
              </div>
              <span className="text-xs text-destructive">
                {alert.attendancePercent}% — below threshold
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
