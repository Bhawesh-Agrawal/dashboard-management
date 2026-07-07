import { Link } from "next-view-transitions";
import type { DashboardData } from "@/types";

export function UpNext({
  deadlines,
}: {
  deadlines: DashboardData["upcomingDeadlines"];
}) {
  return (
    <div>
      <p className="section-label mb-3">COMING UP</p>
      {deadlines.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing coming up.</p>
      ) : (
        <div className="relative ml-1.5">
          {/* Vertical timeline line */}
          <div className="absolute left-0 top-1 bottom-1 w-px bg-border" />

          <div className="space-y-4">
            {deadlines.map((item) => {
              const date = new Date(item.date);
              const hasTime = date.getHours() !== 0 || date.getMinutes() !== 0;
              const isBirthday = item.type === "birthday";

              const dateStr = date.toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
              });
              const timeStr = hasTime
                ? date.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : null;

              // Use linkTo if provided, fallback to /calendar
              const linkHref = item.linkTo || "/calendar";

              return (
                <Link
                  key={`${item.type}-${item.id}`}
                  href={linkHref}
                  className="relative flex items-start gap-3 group"
                >
                  {/* Dot on timeline */}
                  <div
                    className="relative z-10 mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-background shrink-0 bg-muted-foreground/40 group-hover:ring-2 group-hover:ring-foreground/10 transition-shadow"
                  />

                  {/* Content */}
                  <div className="flex-1 min-w-0 -mt-0.5">
                    <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
                      <span>{dateStr}</span>
                      {timeStr && <span>· {timeStr}</span>}
                    </div>
                    <span className="text-sm group-hover:underline">
                      {item.title}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
