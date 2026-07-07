import { Link } from "next-view-transitions";
import type { RoutineWithStreak } from "@/features/routines/types";
import { Flame } from "lucide-react";

export function RoutinesWidget({
  routines,
}: {
  routines: RoutineWithStreak[];
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="section-label">
          ROUTINES · {routines.filter((r) => r.completedToday).length}/
          {routines.length}
        </p>
        <Link
          href="/routines"
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View all
        </Link>
      </div>
      {routines.length === 0 ? (
        <p className="text-sm text-muted-foreground">No routines for today.</p>
      ) : (
        <div className="space-y-2">
          {routines.map((routine) => (
            <Link
              key={routine.id}
              href="/routines"
              className="flex items-center gap-2 hover:bg-accent/50 -mx-1 px-1 py-0.5 rounded transition-colors"
            >
              <div
                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                  routine.completedToday
                    ? "bg-primary border-primary text-primary-foreground"
                    : "border-input"
                }`}
              >
                {routine.completedToday && (
                  <svg
                    className="h-3 w-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </div>
              <span
                className={`text-sm flex-1 ${
                  routine.completedToday
                    ? "line-through text-muted-foreground"
                    : ""
                }`}
              >
                {routine.name}
              </span>
              {routine.currentStreak > 0 && (
                <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
                  <Flame className="h-3 w-3 text-orange-500" />
                  {routine.currentStreak}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
