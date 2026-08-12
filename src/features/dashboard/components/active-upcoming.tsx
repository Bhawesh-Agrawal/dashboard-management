"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  CalendarOff,
  Clock,
  Plus,
  MapPin,
  ArrowRight,
  Timer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { markAttendance } from "@/features/attendance/lib/actions";
import { createScheduleException } from "@/features/schedule/lib/actions";
import { createAssessment } from "@/features/assessments/lib/actions";
import { createTask } from "@/features/tasks/lib/actions";
import { toast } from "sonner";
import type { DashboardData } from "@/types";
import type { ScheduleException } from "@prisma/client";

type ClassItem = DashboardData["todayClasses"][number];
type ClassWithExceptions = ClassItem & { exceptions?: ScheduleException[] };
type AssessmentType = "minor_assignment" | "attendance" | "mid_sem" | "end_sem";

interface ActiveUpcomingProps {
  todayClasses: DashboardData["todayClasses"];
}

export function ActiveUpcoming({ todayClasses }: ActiveUpcomingProps) {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  // Determine active and upcoming classes
  let activeClass: ClassItem | null = null;
  let upcomingClass: ClassItem | null = null;

  for (const cls of todayClasses) {
    const clsWithExceptions = cls as ClassWithExceptions;
    const exception = clsWithExceptions.exceptions?.[0];

    // Skip cancelled classes
    if (exception?.type === "cancelled") continue;

    const startTimeStr =
      exception?.type === "rescheduled" && exception.newStartTime
        ? exception.newStartTime
        : cls.startTime;
    const endTimeStr =
      exception?.type === "rescheduled" && exception.newEndTime
        ? exception.newEndTime
        : cls.endTime;

    const [startH, startM] = startTimeStr.split(":").map(Number);
    const [endH, endM] = endTimeStr.split(":").map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (currentMinutes >= startMinutes && currentMinutes < endMinutes) {
      activeClass = cls;
    } else if (currentMinutes < startMinutes && !upcomingClass) {
      upcomingClass = cls;
    }
  }

  if (!activeClass && !upcomingClass) {
    return (
      <div>
        <p className="section-label mb-3">ACTIVE & UPCOMING</p>
        <div className="rounded-lg border border-border bg-card p-4 text-center">
          <CalendarOff className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">No classes today</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="section-label mb-3">ACTIVE & UPCOMING</p>
      <div className="space-y-3">
        {activeClass && <ActiveClassCard cls={activeClass} now={now} />}
        {upcomingClass && <UpcomingClassCard cls={upcomingClass} now={now} />}
      </div>
    </div>
  );
}

// ─── Active Class Card ──────────────────────────────────────

function ActiveClassCard({ cls, now }: { cls: ClassItem; now: Date }) {
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showRescheduleDialog, setShowRescheduleDialog] = useState(false);
  const [showAssessmentDialog, setShowAssessmentDialog] = useState(false);
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [isPending, startTransition] = useTransition();

  const clsWithExceptions = cls as ClassWithExceptions;
  const exception = clsWithExceptions.exceptions?.[0];
  const isRescheduled = exception?.type === "rescheduled";
  const startTime = isRescheduled && exception.newStartTime ? exception.newStartTime : cls.startTime;
  const endTime = isRescheduled && exception.newEndTime ? exception.newEndTime : cls.endTime;
  const location = isRescheduled && exception.newLocation ? exception.newLocation : cls.location;

  const [endH, endM] = endTime.split(":").map(Number);
  const endMinutes = endH * 60 + endM;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const remainingMinutes = endMinutes - currentMinutes;

  function handleMarkPresent() {
    startTransition(async () => {
      const today = new Date().toISOString().split("T")[0];
      await markAttendance({
        courseId: cls.course.id,
        date: today,
        status: "present",
      });
      toast.success("Marked present!");
    });
  }

  function handleCancel() {
    startTransition(async () => {
      const today = new Date().toISOString().split("T")[0];
      await createScheduleException({
        classScheduleId: cls.id,
        date: today,
        type: "cancelled",
      });
      toast.success("Class cancelled");
      setShowCancelDialog(false);
    });
  }

  function handleReschedule(newStart: string, newEnd: string) {
    startTransition(async () => {
      const today = new Date().toISOString().split("T")[0];
      await createScheduleException({
        classScheduleId: cls.id,
        date: today,
        type: "rescheduled",
        newStartTime: newStart,
        newEndTime: newEnd,
      });
      toast.success("Class rescheduled");
      setShowRescheduleDialog(false);
    });
  }

  return (
    <>
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
            <span className="text-[0.65rem] font-medium text-emerald-600 uppercase tracking-wider">
              Happening Now
            </span>
          </div>
          {remainingMinutes > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Timer className="h-3 w-3" />
              {remainingMinutes}m left
            </span>
          )}
        </div>

        <Link
          href={`/courses/${cls.course.id}`}
          className="text-sm font-semibold hover:underline block mb-1"
          style={{ color: cls.course.color ?? undefined }}
        >
          {cls.course.name}
        </Link>

        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {startTime} — {endTime}
          </span>
          {location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {location}
            </span>
          )}
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="xs"
            onClick={handleMarkPresent}
            disabled={isPending}
            className="bg-emerald-600 text-white hover:bg-emerald-700"
          >
            <CheckCircle2 className="h-3 w-3" />
            Mark Present
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => setShowCancelDialog(true)}
            disabled={isPending}
          >
            <CalendarOff className="h-3 w-3" />
            Cancel
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => setShowRescheduleDialog(true)}
            disabled={isPending}
          >
            <Clock className="h-3 w-3" />
            Reschedule
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => setShowAssessmentDialog(true)}
            disabled={isPending}
          >
            <Plus className="h-3 w-3" />
            Assessment
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => setShowTaskDialog(true)}
            disabled={isPending}
          >
            <Plus className="h-3 w-3" />
            Task
          </Button>
        </div>
      </div>

      {/* Cancel Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Class</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Cancel <strong>{cls.course.name}</strong> for today? This will also
            mark your attendance as cancelled.
          </p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>
              Keep Class
            </DialogClose>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleCancel}
              disabled={isPending}
            >
              {isPending ? "Cancelling..." : "Cancel Class"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reschedule Dialog */}
      <RescheduleDialog
        open={showRescheduleDialog}
        onOpenChange={setShowRescheduleDialog}
        defaultStart={cls.startTime}
        defaultEnd={cls.endTime}
        onReschedule={handleReschedule}
        loading={isPending}
      />

      {/* Assessment Dialog */}
      <AssessmentDialog
        open={showAssessmentDialog}
        onOpenChange={setShowAssessmentDialog}
        courseId={cls.course.id}
        courseName={cls.course.name}
      />

      {/* Task Dialog */}
      <TaskDialog
        open={showTaskDialog}
        onOpenChange={setShowTaskDialog}
        courseId={cls.course.id}
        courseName={cls.course.name}
      />
    </>
  );
}

// ─── Upcoming Class Card ────────────────────────────────────

function UpcomingClassCard({ cls, now }: { cls: ClassItem; now: Date }) {
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showRescheduleDialog, setShowRescheduleDialog] = useState(false);
  const [showAssessmentDialog, setShowAssessmentDialog] = useState(false);
  const [showTaskDialog, setShowTaskDialog] = useState(false);
  const [isPending, startTransition] = useTransition();

  const clsWithExceptions = cls as ClassWithExceptions;
  const exception = clsWithExceptions.exceptions?.[0];
  const isRescheduled = exception?.type === "rescheduled";
  const startTime = isRescheduled && exception.newStartTime ? exception.newStartTime : cls.startTime;
  const endTime = isRescheduled && exception.newEndTime ? exception.newEndTime : cls.endTime;
  const location = isRescheduled && exception.newLocation ? exception.newLocation : cls.location;

  const [startH, startM] = startTime.split(":").map(Number);
  const startMinutes = startH * 60 + startM;
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const minutesUntil = startMinutes - currentMinutes;

  function handleCancel() {
    startTransition(async () => {
      const today = new Date().toISOString().split("T")[0];
      await createScheduleException({
        classScheduleId: cls.id,
        date: today,
        type: "cancelled",
      });
      toast.success("Class cancelled");
      setShowCancelDialog(false);
    });
  }

  function handleReschedule(newStart: string, newEnd: string) {
    startTransition(async () => {
      const today = new Date().toISOString().split("T")[0];
      await createScheduleException({
        classScheduleId: cls.id,
        date: today,
        type: "rescheduled",
        newStartTime: newStart,
        newEndTime: newEnd,
      });
      toast.success("Class rescheduled");
      setShowRescheduleDialog(false);
    });
  }

  return (
    <>
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex items-start justify-between mb-2">
          <span className="text-[0.65rem] font-medium text-blue-600 uppercase tracking-wider">
            Up Next
          </span>
          {minutesUntil > 0 && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <ArrowRight className="h-3 w-3" />
              in {minutesUntil}m
            </span>
          )}
        </div>

        <Link
          href={`/courses/${cls.course.id}`}
          className="text-sm font-semibold hover:underline block mb-1"
          style={{ color: cls.course.color ?? undefined }}
        >
          {cls.course.name}
        </Link>

        <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {startTime} — {endTime}
          </span>
          {location && (
            <span className="flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {location}
            </span>
          )}
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="xs"
            variant="outline"
            onClick={() => setShowCancelDialog(true)}
            disabled={isPending}
          >
            <CalendarOff className="h-3 w-3" />
            Cancel
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => setShowRescheduleDialog(true)}
            disabled={isPending}
          >
            <Clock className="h-3 w-3" />
            Reschedule
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => setShowAssessmentDialog(true)}
            disabled={isPending}
          >
            <Plus className="h-3 w-3" />
            Assessment
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => setShowTaskDialog(true)}
            disabled={isPending}
          >
            <Plus className="h-3 w-3" />
            Task
          </Button>
        </div>
      </div>

      {/* Cancel Dialog */}
      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Class</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Cancel <strong>{cls.course.name}</strong> for today?
          </p>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>
              Keep Class
            </DialogClose>
            <Button
              size="sm"
              variant="destructive"
              onClick={handleCancel}
              disabled={isPending}
            >
              {isPending ? "Cancelling..." : "Cancel Class"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reschedule Dialog */}
      <RescheduleDialog
        open={showRescheduleDialog}
        onOpenChange={setShowRescheduleDialog}
        defaultStart={cls.startTime}
        defaultEnd={cls.endTime}
        onReschedule={handleReschedule}
        loading={isPending}
      />

      {/* Assessment Dialog */}
      <AssessmentDialog
        open={showAssessmentDialog}
        onOpenChange={setShowAssessmentDialog}
        courseId={cls.course.id}
        courseName={cls.course.name}
      />

      {/* Task Dialog */}
      <TaskDialog
        open={showTaskDialog}
        onOpenChange={setShowTaskDialog}
        courseId={cls.course.id}
        courseName={cls.course.name}
      />
    </>
  );
}

// ─── Shared Dialog Components ───────────────────────────────

function RescheduleDialog({
  open,
  onOpenChange,
  defaultStart,
  defaultEnd,
  onReschedule,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultStart: string;
  defaultEnd: string;
  onReschedule: (start: string, end: string) => void;
  loading: boolean;
}) {
  const [newStart, setNewStart] = useState(defaultStart);
  const [newEnd, setNewEnd] = useState(defaultEnd);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reschedule Class</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-3">
          <div className="space-y-1 flex-1">
            <label className="section-label">Start Time</label>
            <input
              type="time"
              value={newStart}
              onChange={(e) => setNewStart(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            />
          </div>
          <div className="space-y-1 flex-1">
            <label className="section-label">End Time</label>
            <input
              type="time"
              value={newEnd}
              onChange={(e) => setNewEnd(e.target.value)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="sm" />}>
            Cancel
          </DialogClose>
          <Button
            size="sm"
            onClick={() => onReschedule(newStart, newEnd)}
            disabled={loading}
          >
            {loading ? "Saving..." : "Reschedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssessmentDialog({
  open,
  onOpenChange,
  courseId,
  courseName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  courseName: string;
}) {
  const [loading, setLoading] = useState(false);
  const [componentType, setComponentType] = useState<AssessmentType>("minor_assignment");
  const [maxMarks, setMaxMarks] = useState("10");
  const [date, setDate] = useState("");

  async function handleSubmit() {
    setLoading(true);
    await createAssessment({
      courseId,
      componentType,
      maxMarks: parseInt(maxMarks) || 10,
      date: date || undefined,
    });
    toast.success("Assessment added");
    setLoading(false);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Assessment</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Adding to <strong>{courseName}</strong>
          </p>
          <div className="space-y-1">
            <label className="section-label">Type</label>
            <select
              value={componentType}
              onChange={(e) => setComponentType(e.target.value as AssessmentType)}
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
            >
              <option value="minor_assignment">Minor / Assignment</option>
              <option value="mid_sem">Mid Sem</option>
              <option value="end_sem">End Sem</option>
              <option value="attendance">Attendance</option>
            </select>
          </div>
          <div className="flex gap-3">
            <div className="space-y-1 flex-1">
              <label className="section-label">Max Marks</label>
              <input
                type="number"
                value={maxMarks}
                onChange={(e) => setMaxMarks(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </div>
            <div className="space-y-1 flex-1">
              <label className="section-label">Date (optional)</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="sm" />}>
            Cancel
          </DialogClose>
          <Button size="sm" onClick={handleSubmit} disabled={loading}>
            {loading ? "Adding..." : "Add Assessment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TaskDialog({
  open,
  onOpenChange,
  courseId,
  courseName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  courseName: string;
}) {
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("2");

  async function handleSubmit() {
    if (!title.trim()) return;
    setLoading(true);
    await createTask({
      title: title.trim(),
      courseId,
      dueDate: dueDate || undefined,
      priority: parseInt(priority),
    });
    toast.success("Task added");
    setLoading(false);
    setTitle("");
    setDueDate("");
    setPriority("2");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Task</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Adding to <strong>{courseName}</strong>
          </p>
          <div className="space-y-1">
            <label className="section-label">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              autoFocus
            />
          </div>
          <div className="flex gap-3">
            <div className="space-y-1 flex-1">
              <label className="section-label">Due Date (optional)</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              />
            </div>
            <div className="space-y-1 flex-1">
              <label className="section-label">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="1">High</option>
                <option value="2">Medium</option>
                <option value="3">Low</option>
                <option value="4">Lowest</option>
              </select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" size="sm" />}>
            Cancel
          </DialogClose>
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={loading || !title.trim()}
          >
            {loading ? "Adding..." : "Add Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
