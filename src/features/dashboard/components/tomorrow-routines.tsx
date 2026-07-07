import type { DashboardData } from "@/types";

export function TomorrowRoutines({
  routines,
}: {
  routines: DashboardData["tomorrowRoutines"];
}) {
  if (routines.length === 0) return null;

  return (
    <div>
      <p className="section-label mb-3">TOMORROW</p>
      <div className="space-y-1">
        {routines.map((routine) => (
          <div key={routine.id} className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
            <span>{routine.name}</span>
            {routine.specificTime && (
              <span className="text-xs ml-auto">{routine.specificTime}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
