import { Link } from "next-view-transitions";

export function SemesterSnapshot({
  sgpa,
  cgpa,
}: {
  sgpa: number | null;
  cgpa: number | null;
}) {
  return (
    <div>
      <p className="section-label mb-3">Semester Snapshot</p>
      <div className="space-y-2">
        <Link
          href="/semesters"
          className="flex items-baseline justify-between hover:bg-accent/50 -mx-2 px-2 py-1 rounded transition-colors"
        >
          <span className="text-sm text-muted-foreground">SGPA (live)</span>
          <span className="text-lg font-medium font-serif">
            {sgpa !== null ? sgpa.toFixed(2) : "—"}
          </span>
        </Link>
        <Link
          href="/semesters"
          className="flex items-baseline justify-between hover:bg-accent/50 -mx-2 px-2 py-1 rounded transition-colors"
        >
          <span className="text-sm text-muted-foreground">CGPA</span>
          <span className="text-lg font-medium font-serif">
            {cgpa !== null ? cgpa.toFixed(2) : "—"}
          </span>
        </Link>
      </div>
    </div>
  );
}
