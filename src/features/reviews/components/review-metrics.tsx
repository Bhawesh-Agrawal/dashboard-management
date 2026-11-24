import type { ReviewMetrics } from "../lib/types";
import { cn } from "@/lib/utils";

function MetricBar({
  label,
  value,
  max = 100,
  unit = "%",
}: {
  label: string;
  value: number;
  max?: number;
  unit?: string;
}) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-baseline">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-xs font-mono font-medium">
          {unit === "%" ? Math.round(value) : value}
          {unit}
        </span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary/60 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function MetricRow({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={cn("flex justify-between items-baseline py-1", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs font-mono font-medium">{value}</span>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-0.5 h-8">
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1 bg-primary/40 rounded-t min-h-[2px] transition-all duration-300"
          style={{ height: `${(v / max) * 100}%` }}
        />
      ))}
    </div>
  );
}

export function ReviewMetricsDisplay({
  metrics,
}: {
  metrics: ReviewMetrics;
}) {
  const hasAny =
    metrics.tasksTotal > 0 ||
    metrics.routineAdherence > 0 ||
    metrics.moodAverage != null ||
    metrics.totalSpent != null ||
    metrics.attendanceRate != null ||
    metrics.deepWorkHours != null ||
    (metrics.projectsProgress && metrics.projectsProgress.length > 0) ||
    (metrics.weeklyTrends && metrics.weeklyTrends.length > 0);

  if (!hasAny) return null;

  return (
    <div className="space-y-4">
      {metrics.tasksTotal > 0 && (
        <MetricBar
          label="Task Completion"
          value={metrics.tasksCompleted}
          max={metrics.tasksTotal}
          unit={`/${metrics.tasksTotal}`}
        />
      )}

      {metrics.routineAdherence > 0 && (
        <MetricBar
          label="Routine Adherence"
          value={metrics.routineAdherence}
        />
      )}

      <div className="grid grid-cols-2 gap-x-6">
        {metrics.moodAverage != null && (
          <MetricRow label="Mood" value={`${metrics.moodAverage.toFixed(1)}/5`} />
        )}
        {metrics.sleepAverage != null && (
          <MetricRow label="Sleep" value={`${metrics.sleepAverage.toFixed(1)}h`} />
        )}
        {metrics.deepWorkHours != null && (
          <MetricRow label="Deep Work" value={`${metrics.deepWorkHours}h`} />
        )}
        {metrics.attendanceRate != null && (
          <MetricRow label="Attendance" value={`${Math.round(metrics.attendanceRate)}%`} />
        )}
        {metrics.totalSpent != null && (
          <MetricRow label="Spent" value={`$${metrics.totalSpent.toFixed(2)}`} />
        )}
        {metrics.notesCreated != null && (
          <MetricRow label="Notes" value={`${metrics.notesCreated}`} />
        )}
      </div>

      {metrics.weeklyTrends && metrics.weeklyTrends.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            Trends
          </p>
          {metrics.weeklyTrends.map((trend) => (
            <div key={trend.label} className="space-y-1">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-muted-foreground">
                  {trend.label}
                </span>
                <span className="text-[0.6rem] font-mono text-muted-foreground">
                  [{trend.values.join(", ")}]
                </span>
              </div>
              <Sparkline values={trend.values} />
            </div>
          ))}
        </div>
      )}

      {metrics.projectsProgress && metrics.projectsProgress.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
            Projects
          </p>
          {metrics.projectsProgress.map((p) => (
            <MetricBar key={p.name} label={p.name} value={p.progress} />
          ))}
        </div>
      )}
    </div>
  );
}
