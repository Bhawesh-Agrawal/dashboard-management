"use client";

import { useState } from "react";
import { markAttendance } from "@/features/attendance/lib/actions";
import type { AttendanceRecord, AttendanceStatus } from "@prisma/client";

const statusColors: Record<AttendanceStatus, string> = {
  present: "bg-green-500 text-white",
  absent: "bg-destructive text-white",
  cancelled: "bg-muted text-muted-foreground",
  not_marked: "bg-muted/50 text-muted-foreground border border-dashed border-border",
};

const statusCycle: AttendanceStatus[] = ["not_marked", "present", "absent", "cancelled"];

export function AttendanceSection({
  courseId,
  records,
}: {
  courseId: string;
  records: AttendanceRecord[];
}) {
  const present = records.filter((r) => r.status === "present").length;
  const absent = records.filter((r) => r.status === "absent").length;
  const total = present + absent;
  const percent = total === 0 ? 0 : Math.round((present / total) * 1000) / 10;

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="section-label">Attendance</h2>
        <span className="text-sm text-muted-foreground">
          {percent}% ({present}/{total} classes)
        </span>
      </div>

      {records.length === 0 ? (
        <p className="text-sm text-muted-foreground">No attendance records yet.</p>
      ) : (
        <div className="grid grid-cols-7 gap-1.5">
          {records.map((record) => (
            <AttendanceCell
              key={record.id}
              record={record}
              courseId={courseId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AttendanceCell({
  record,
  courseId,
}: {
  record: AttendanceRecord;
  courseId: string;
}) {
  const [status, setStatus] = useState(record.status);

  async function cycleStatus() {
    const currentIndex = statusCycle.indexOf(status);
    const nextStatus = statusCycle[(currentIndex + 1) % statusCycle.length];
    setStatus(nextStatus);
    await markAttendance({
      courseId,
      date: record.date.toISOString().slice(0, 10),
      status: nextStatus,
    });
  }

  return (
    <button
      onClick={cycleStatus}
      className={`aspect-square rounded-md text-[0.6rem] font-medium transition-colors ${statusColors[status]}`}
      title={`${record.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}: ${status}`}
    >
      {record.date.toLocaleDateString("en-US", { day: "numeric" })}
    </button>
  );
}
