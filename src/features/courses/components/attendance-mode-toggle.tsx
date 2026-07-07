"use client";

import { useState } from "react";
import { updateAttendanceMode } from "@/features/courses/lib/actions";
import { Settings, Calculator } from "lucide-react";

export function AttendanceModeToggle({
  courseId,
  mode,
  manualPresent,
  manualTotalClasses,
}: {
  courseId: string;
  mode: "auto" | "manual";
  manualPresent: number | null;
  manualTotalClasses: number | null;
}) {
  const [currentMode, setCurrentMode] = useState(mode);
  const [present, setPresent] = useState(manualPresent?.toString() ?? "");
  const [total, setTotal] = useState(manualTotalClasses?.toString() ?? "");
  const [loading, setLoading] = useState(false);

  async function handleModeChange(newMode: "auto" | "manual") {
    setLoading(true);
    setCurrentMode(newMode);
    await updateAttendanceMode(courseId, {
      attendanceMode: newMode,
      manualPresent: newMode === "manual" ? (present ? parseInt(present) : null) : null,
      manualTotalClasses: newMode === "manual" ? (total ? parseInt(total) : null) : null,
    });
    setLoading(false);
  }

  async function handleManualUpdate() {
    setLoading(true);
    await updateAttendanceMode(courseId, {
      attendanceMode: "manual",
      manualPresent: present ? parseInt(present) : null,
      manualTotalClasses: total ? parseInt(total) : null,
    });
    setLoading(false);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="section-label">Attendance Mode</h2>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {currentMode === "auto" ? (
            <Settings className="h-3 w-3" />
          ) : (
            <Calculator className="h-3 w-3" />
          )}
          <span>{currentMode === "auto" ? "Auto (from records)" : "Manual (input)"}</span>
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        <button
          onClick={() => handleModeChange("auto")}
          disabled={loading}
          className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            currentMode === "auto"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          } disabled:opacity-50`}
        >
          Auto
        </button>
        <button
          onClick={() => handleModeChange("manual")}
          disabled={loading}
          className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
            currentMode === "manual"
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:text-foreground"
          } disabled:opacity-50`}
        >
          Manual
        </button>
      </div>

      {currentMode === "manual" && (
        <div className="flex items-end gap-3 p-3 rounded-md border border-border bg-card">
          <div className="space-y-1">
            <label className="section-label">Classes Attended</label>
            <input
              type="number"
              min="0"
              value={present}
              onChange={(e) => setPresent(e.target.value)}
              onBlur={handleManualUpdate}
              className="h-9 w-24 rounded-md border border-input bg-background px-2 text-sm"
              placeholder="—"
            />
          </div>
          <div className="space-y-1">
            <label className="section-label">Total Classes</label>
            <input
              type="number"
              min="1"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              onBlur={handleManualUpdate}
              className="h-9 w-24 rounded-md border border-input bg-background px-2 text-sm"
              placeholder="—"
            />
          </div>
          {present && total && parseInt(total) > 0 && (
            <div className="text-sm text-muted-foreground pb-2">
              = {Math.round((parseInt(present) / parseInt(total)) * 100)}% attendance
            </div>
          )}
        </div>
      )}
    </div>
  );
}
