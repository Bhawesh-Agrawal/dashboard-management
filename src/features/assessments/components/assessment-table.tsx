"use client";

import { useState } from "react";
import { updateAssessment, createAssessment, deleteAssessment } from "@/features/assessments/lib/actions";
import type { Assessment } from "@prisma/client";
import { Plus, Trash2 } from "lucide-react";

const componentLabels: Record<string, string> = {
  minor_assignment: "Minor + Assignment",
  attendance: "Attendance (auto)",
  mid_sem: "Mid-Semester",
  end_sem: "End-Semester",
};

const componentMaxMarks: Record<string, number> = {
  minor_assignment: 15,
  attendance: 5,
  mid_sem: 30,
  end_sem: 50,
};

export function AssessmentSection({
  courseId,
  assessments,
  attendanceMarks,
  attendancePercent,
  attendanceMode,
  manualPresent,
  manualTotalClasses,
}: {
  courseId: string;
  assessments: Assessment[];
  /** Computed live from AttendanceRecords or manual input — never from DB */
  attendanceMarks?: number;
  /** Computed live from AttendanceRecords or manual input — never from DB */
  attendancePercent?: number;
  /** Attendance computation mode */
  attendanceMode?: "auto" | "manual";
  /** Manual mode: classes attended */
  manualPresent?: number | null;
  /** Manual mode: total classes held */
  manualTotalClasses?: number | null;
}) {
  const [showForm, setShowForm] = useState(false);

  // Group by type
  const grouped = assessments.reduce(
    (acc, a) => {
      acc[a.componentType] = acc[a.componentType] || [];
      acc[a.componentType].push(a);
      return acc;
    },
    {} as Record<string, Assessment[]>
  );

  // Sum manual assessments only (attendance excluded from this total)
  let manualObtained = 0;
  let manualMax = 0;
  for (const a of assessments) {
    if (a.componentType === "attendance") continue;
    if (a.obtainedMarks !== null) manualObtained += a.obtainedMarks;
    manualMax += a.maxMarks;
  }

  // Include attendance in the full total
  const hasAttendanceRow = assessments.some((a) => a.componentType === "attendance");
  const attMarks = hasAttendanceRow ? (attendanceMarks ?? 0) : 0;
  const fullObtained = manualObtained + attMarks;
  const fullMax = manualMax + (hasAttendanceRow ? 5 : 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="section-label">Assessments</h2>
        <div className="flex items-center gap-3">
          {fullMax > 0 && (
            <span className="text-sm text-muted-foreground">
              {fullObtained}/{fullMax} ({Math.round((fullObtained / fullMax) * 100)}%)
              {hasAttendanceRow && attendancePercent !== undefined && (
                <span className="ml-1 text-[0.65rem]">
                  — incl. {attMarks}/5 from {Math.round(attendancePercent)}% attendance
                  {attendanceMode === "manual" && manualPresent != null && manualTotalClasses != null && (
                    <span className="ml-1">(manual: {manualPresent}/{manualTotalClasses})</span>
                  )}
                </span>
              )}
            </span>
          )}
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>
      </div>

      {showForm && (
        <AddAssessmentForm courseId={courseId} onDone={() => setShowForm(false)} />
      )}

      <div className="space-y-4">
        {(Object.keys(componentLabels) as string[]).map((type) => {
          const items = grouped[type] || [];
          const maxMarks = componentMaxMarks[type];

          // For attendance, use computed values; for others, sum from DB
          let obtained: number;
          if (type === "attendance") {
            obtained = attMarks;
          } else {
            obtained = items.reduce((sum, a) => sum + (a.obtainedMarks || 0), 0);
          }

          return (
            <div key={type}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium">{componentLabels[type]}</span>
                <span className="text-xs text-muted-foreground">
                  {obtained}/{maxMarks}
                </span>
              </div>
              {items.length === 0 ? (
                <p className="text-xs text-muted-foreground">Not added yet.</p>
              ) : (
                <div className="space-y-1">
                  {items.map((item) => (
                    <AssessmentRow
                      key={item.id}
                      assessment={item}
                      courseId={courseId}
                      attendanceMarks={type === "attendance" ? attMarks : undefined}
                      attendancePercent={type === "attendance" ? attendancePercent : undefined}
                      attendanceMode={type === "attendance" ? attendanceMode : undefined}
                      manualPresent={type === "attendance" ? manualPresent : undefined}
                      manualTotalClasses={type === "attendance" ? manualTotalClasses : undefined}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AssessmentRow({
  assessment,
  courseId,
  attendanceMarks,
  attendancePercent,
  attendanceMode,
  manualPresent,
  manualTotalClasses,
}: {
  assessment: Assessment;
  courseId: string;
  /** Only provided for attendance rows — the computed value */
  attendanceMarks?: number;
  /** Only provided for attendance rows */
  attendancePercent?: number;
  /** Attendance computation mode */
  attendanceMode?: "auto" | "manual";
  /** Manual mode: classes attended */
  manualPresent?: number | null;
  /** Manual mode: total classes held */
  manualTotalClasses?: number | null;
}) {
  const [obtained, setObtained] = useState(assessment.obtainedMarks?.toString() || "");

  async function handleUpdate(value: string) {
    setObtained(value);
    const num = value ? parseInt(value) : undefined;
    if (num !== undefined && !isNaN(num)) {
      await updateAssessment(assessment.id, { obtainedMarks: num });
    }
  }

  const isAttendance = assessment.componentType === "attendance";

  return (
    <div className="flex items-center gap-2 list-row !py-1 !border-0">
      {assessment.date && (
        <span className="text-xs text-muted-foreground w-16 shrink-0">
          {new Date(assessment.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
        </span>
      )}
      <div className="flex-1 flex items-center gap-1">
        {isAttendance ? (
          <>
            <span className="text-sm font-medium text-foreground">
              {attendanceMarks ?? 0}
            </span>
            <span className="text-xs text-muted-foreground">
              / {assessment.maxMarks}
              {attendancePercent !== undefined && (
                <span className="ml-1">
                  — from {Math.round(attendancePercent)}% attendance
                  {attendanceMode === "manual" && manualPresent != null && manualTotalClasses != null && (
                    <span className="ml-1">(manual: {manualPresent}/{manualTotalClasses})</span>
                  )}
                </span>
              )}
            </span>
          </>
        ) : (
          <>
            <input
              type="number"
              min="0"
              max={assessment.maxMarks}
              value={obtained}
              onChange={(e) => setObtained(e.target.value)}
              onBlur={(e) => handleUpdate(e.target.value)}
              className="h-7 w-16 rounded border border-input bg-background px-1.5 text-sm text-right"
              placeholder="—"
            />
            <span className="text-xs text-muted-foreground">/ {assessment.maxMarks}</span>
          </>
        )}
      </div>
      {!isAttendance && (
        <form
          action={deleteAssessment.bind(null, assessment.id, courseId)}
          onSubmit={(e) => {
            if (!confirm("Delete this assessment?")) e.preventDefault();
          }}
        >
          <button type="submit" className="p-1 text-muted-foreground hover:text-destructive transition-colors">
            <Trash2 className="h-3 w-3" />
          </button>
        </form>
      )}
    </div>
  );
}

function AddAssessmentForm({
  courseId,
  onDone,
}: {
  courseId: string;
  onDone: () => void;
}) {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const formData = new FormData(e.currentTarget);
    const componentType = formData.get("componentType") as string;

      await createAssessment({
      courseId,
      componentType: componentType as "minor_assignment" | "mid_sem" | "end_sem",
      maxMarks: parseInt(formData.get("maxMarks") as string),
      obtainedMarks: formData.get("obtainedMarks")
        ? parseInt(formData.get("obtainedMarks") as string)
        : undefined,
      date: (formData.get("date") as string) || undefined,
    });

    setLoading(false);
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3 p-3 rounded-md border border-border bg-card mb-3">
      <div className="space-y-1">
        <label className="section-label">Type</label>
        <select
          name="componentType"
          required
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        >
          <option value="minor_assignment">Minor + Assignment</option>
          <option value="mid_sem">Mid-Semester</option>
          <option value="end_sem">End-Semester</option>
        </select>
      </div>
      <div className="space-y-1">
        <label className="section-label">Max Marks</label>
        <input
          name="maxMarks"
          type="number"
          min="1"
          required
          defaultValue="15"
          className="h-9 w-20 rounded-md border border-input bg-background px-2 text-sm"
        />
      </div>
      <div className="space-y-1">
        <label className="section-label">Obtained</label>
        <input
          name="obtainedMarks"
          type="number"
          min="0"
          className="h-9 w-20 rounded-md border border-input bg-background px-2 text-sm"
          placeholder="—"
        />
      </div>
      <div className="space-y-1">
        <label className="section-label">Date</label>
        <input
          name="date"
          type="date"
          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={loading}
        className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? "..." : "Add"}
      </button>
    </form>
  );
}
