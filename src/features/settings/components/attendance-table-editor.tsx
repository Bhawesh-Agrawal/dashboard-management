"use client";

import { useState } from "react";
import { updateAttendanceMarksConfig, resetAttendanceToDefaults } from "@/features/settings/lib/actions";
import { DEFAULT_ATTENDANCE_MARKS_CONFIG } from "@/lib/constants";

type Course = {
  id: string;
  name: string;
  code: string | null;
  attendanceMarksConfigs: { minPercent: number; marks: number }[];
};

export function AttendanceTableEditor({ courses }: { courses: Course[] }) {
  const [selectedCourse, setSelectedCourse] = useState<string>(courses[0]?.id || "");
  const [config, setConfig] = useState(
    courses[0]?.attendanceMarksConfigs.length
      ? courses[0].attendanceMarksConfigs
      : DEFAULT_ATTENDANCE_MARKS_CONFIG.map((c) => ({ ...c }))
  );
  const [loading, setLoading] = useState(false);

  function handleCourseChange(courseId: string) {
    setSelectedCourse(courseId);
    const course = courses.find((c) => c.id === courseId);
    setConfig(
      course?.attendanceMarksConfigs.length
        ? course.attendanceMarksConfigs
        : DEFAULT_ATTENDANCE_MARKS_CONFIG.map((c) => ({ ...c }))
    );
  }

  function updateRow(index: number, field: "minPercent" | "marks", value: number) {
    const newConfig = [...config];
    newConfig[index] = { ...newConfig[index], [field]: value };
    setConfig(newConfig);
  }

  async function handleSave() {
    if (!selectedCourse) return;
    setLoading(true);
    await updateAttendanceMarksConfig(selectedCourse, config);
    setLoading(false);
  }

  async function handleReset() {
    if (!selectedCourse) return;
    setLoading(true);
    await resetAttendanceToDefaults(selectedCourse);
    setConfig(DEFAULT_ATTENDANCE_MARKS_CONFIG.map((c) => ({ ...c })));
    setLoading(false);
  }

  return (
    <div>
      <h2 className="section-label mb-3">Attendance Marks Table</h2>
      <p className="text-sm text-muted-foreground mb-4">
        Edit the attendance-percentage-to-marks (out of 5) conversion. Changes apply per course.
      </p>

      <div className="space-y-4">
        <div className="space-y-2">
          <label className="section-label">Select Course</label>
          <select
            value={selectedCourse}
            onChange={(e) => handleCourseChange(e.target.value)}
            className="flex h-10 w-full max-w-md rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.name} {course.code ? `(${course.code})` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted">
                <th className="text-left px-3 py-2 section-label">Min %</th>
                <th className="text-left px-3 py-2 section-label">Marks (out of 5)</th>
              </tr>
            </thead>
            <tbody>
              {config.map((row, idx) => (
                <tr key={idx} className="border-t border-border">
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={row.minPercent}
                      onChange={(e) => updateRow(idx, "minPercent", parseFloat(e.target.value) || 0)}
                      className="h-8 w-20 rounded border border-input bg-background px-2 text-sm"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      max="5"
                      value={row.marks}
                      onChange={(e) => updateRow(idx, "marks", parseInt(e.target.value) || 0)}
                      className="h-8 w-20 rounded border border-input bg-background px-2 text-sm"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={loading || !selectedCourse}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Saving..." : "Save"}
          </button>
          <button
            onClick={handleReset}
            disabled={loading || !selectedCourse}
            className="inline-flex h-9 items-center justify-center rounded-md border border-border px-4 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            Reset to Defaults
          </button>
        </div>
      </div>
    </div>
  );
}
