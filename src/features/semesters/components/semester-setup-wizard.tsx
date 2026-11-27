"use client";

import { useState, useTransition, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, Copy, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createSemester, updateSemester } from "../lib/actions";
import { createCourse } from "@/features/courses/lib/actions";
import { copyCoursesFromSemesterAction } from "../lib/wizard-actions";
import {
  AcademicCalendarManager,
  type CalendarEntryDTO,
} from "./academic-calendar-manager";

export interface WizardPreviousSemester {
  id: string;
  name: string;
  courseCount: number;
}

export interface WizardCourseItem {
  id: string;
  name: string;
  code: string | null;
  credits: number;
  instructor: string | null;
}

const DRAFT_KEY = "semester_setup_wizard_draft_v1";

interface WizardDraft {
  step: number;
  semesterId: string | null;
  name: string;
  startDate: string;
  endDate: string;
  gradingScale: "ten_point" | "four_point";
  timetableDeferred: boolean;
}

const STEPS = [
  { id: 1, label: "Details" },
  { id: 2, label: "Calendar" },
  { id: 3, label: "Courses" },
  { id: 4, label: "Timetable" },
  { id: 5, label: "Summary" },
];

export function SemesterSetupWizard({
  previousSemesters,
  initialSemester,
  initialCourses = [],
  initialCalendarEntries = [],
  initialScheduleCount = 0,
}: {
  previousSemesters: WizardPreviousSemester[];
  initialSemester?: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    gradingScale: "ten_point" | "four_point";
  } | null;
  initialCourses?: WizardCourseItem[];
  initialCalendarEntries?: CalendarEntryDTO[];
  initialScheduleCount?: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [step, setStep] = useState(1);
  const [semesterId, setSemesterId] = useState<string | null>(
    initialSemester?.id ?? null
  );
  const [name, setName] = useState(initialSemester?.name ?? "");
  const [startDate, setStartDate] = useState(initialSemester?.startDate ?? "");
  const [endDate, setEndDate] = useState(initialSemester?.endDate ?? "");
  const [gradingScale, setGradingScale] = useState<"ten_point" | "four_point">(
    initialSemester?.gradingScale ?? "ten_point"
  );
  const [timetableDeferred, setTimetableDeferred] = useState(false);

  const [courses, setCourses] = useState<WizardCourseItem[]>(initialCourses);
  const [calendarCount, setCalendarCount] = useState(initialCalendarEntries.length);

  // Course add form
  const [courseName, setCourseName] = useState("");
  const [courseCode, setCourseCode] = useState("");
  const [courseCredits, setCourseCredits] = useState(3);
  const [attendanceTarget, setAttendanceTarget] = useState(75);
  const [instructor, setInstructor] = useState("");
  const [copySourceId, setCopySourceId] = useState(previousSemesters[0]?.id ?? "");

  // Resume draft from localStorage if starting fresh
  useEffect(() => {
    if (initialSemester) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<WizardDraft>;
      if (parsed.name) setName(parsed.name);
      if (parsed.startDate) setStartDate(parsed.startDate);
      if (parsed.endDate) setEndDate(parsed.endDate);
      if (parsed.gradingScale) setGradingScale(parsed.gradingScale);
      if (parsed.semesterId) setSemesterId(parsed.semesterId);
      if (typeof parsed.timetableDeferred === "boolean") {
        setTimetableDeferred(parsed.timetableDeferred);
      }
      if (typeof parsed.step === "number" && parsed.step >= 1 && parsed.step <= 5) {
        setStep(parsed.step);
      }
    } catch {
      // Ignore corrupt draft
    }
  }, [initialSemester]);

  useEffect(() => {
    try {
      const draft: WizardDraft = {
        step,
        semesterId,
        name,
        startDate,
        endDate,
        gradingScale,
        timetableDeferred,
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // Ignore storage errors
    }
  }, [step, semesterId, name, startDate, endDate, gradingScale, timetableDeferred]);

  function handleSaveStep1(nextStep: number) {
    if (!name.trim() || !startDate || !endDate) {
      toast.error("Please fill in semester name, start date, and end date");
      return;
    }
    startTransition(async () => {
      try {
        if (semesterId) {
          await updateSemester(semesterId, {
            name: name.trim(),
            startDate,
            endDate,
            gradingScale,
          });
        } else {
          const created = await createSemester({
            name: name.trim(),
            startDate,
            endDate,
            gradingScale,
          });
          setSemesterId(created.id);
        }
        setStep(nextStep);
        toast.success("Semester details saved");
      } catch {
        toast.error("Failed to save semester details");
      }
    });
  }

  function handleAddCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!semesterId || !courseName.trim()) return;
    startTransition(async () => {
      try {
        const created = await createCourse({
          semesterId,
          name: courseName.trim(),
          code: courseCode.trim() || undefined,
          credits: courseCredits,
          instructor: instructor.trim() || undefined,
        });
        setCourses((prev) => [
          ...prev,
          {
            id: created.id,
            name: created.name,
            code: created.code,
            credits: created.credits,
            instructor: created.instructor,
          },
        ]);
        setCourseName("");
        setCourseCode("");
        setInstructor("");
        toast.success(`Added ${created.name} (target ${attendanceTarget}%)`);
      } catch {
        toast.error("Failed to add course");
      }
    });
  }

  function handleCopyCourses() {
    if (!semesterId || !copySourceId) return;
    startTransition(async () => {
      try {
        const res = await copyCoursesFromSemesterAction({
          targetSemesterId: semesterId,
          sourceSemesterId: copySourceId,
        });
        setCourses((prev) => [...prev, ...res.copied]);
        toast.success(`Copied ${res.copied.length} courses`);
      } catch {
        toast.error("Failed to copy courses");
      }
    });
  }

  function handleFinish() {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // Ignore
    }
    if (semesterId) {
      router.push(`/semesters/${semesterId}`);
    } else {
      router.push("/semesters");
    }
  }

  return (
    <div className="space-y-6">
      {/* Mobile-first Stepper */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 p-1 bg-muted rounded-md">
          {STEPS.map((s) => {
            const active = step === s.id;
            const disabled = s.id > 1 && !semesterId;
            return (
              <button
                key={s.id}
                type="button"
                disabled={disabled}
                onClick={() => setStep(s.id)}
                className={`px-3 py-1.5 rounded text-xs min-h-[44px] transition-colors disabled:opacity-40 ${
                  active
                    ? "bg-background text-foreground font-medium shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s.id}. {s.label}
              </button>
            );
          })}
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={handleFinish}
          className="min-h-[44px]"
        >
          Finish &amp; Exit
        </Button>
      </div>

      {/* Step 1: Details */}
      {step === 1 && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="page-heading text-lg">1. Semester Details</h2>
          <div className="space-y-3">
            <label className="block space-y-1 text-xs text-muted-foreground">
              <span>Semester name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Spring 2027"
                className="w-full min-h-[44px] rounded-md border border-border bg-background px-3 text-sm text-foreground"
              />
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="space-y-1 text-xs text-muted-foreground">
                <span>Start date</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full min-h-[44px] rounded-md border border-border bg-background px-3 text-sm text-foreground"
                />
              </label>
              <label className="space-y-1 text-xs text-muted-foreground">
                <span>End date</span>
                <input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full min-h-[44px] rounded-md border border-border bg-background px-3 text-sm text-foreground"
                />
              </label>
            </div>
            <label className="block space-y-1 text-xs text-muted-foreground">
              <span>Grading scale</span>
              <select
                value={gradingScale}
                onChange={(e) =>
                  setGradingScale(e.target.value as "ten_point" | "four_point")
                }
                className="w-full min-h-[44px] rounded-md border border-border bg-background px-3 text-sm text-foreground"
              >
                <option value="ten_point">10-Point Scale</option>
                <option value="four_point">4-Point Scale</option>
              </select>
            </label>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={isPending}
              onClick={() => handleSaveStep1(2)}
              className="min-h-[44px]"
            >
              {isPending ? "Saving..." : "Save & Continue"}
            </Button>
          </div>
        </div>
      )}

      {/* Step 2: Academic Calendar */}
      {step === 2 && semesterId && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="page-heading text-lg">2. Academic Calendar</h2>
              <p className="text-xs text-muted-foreground">
                Add holidays, breaks, exam periods, and day-order swaps before the timetable is announced.
              </p>
            </div>
            <Button type="button" onClick={() => setStep(3)} className="min-h-[44px] shrink-0">
              Next: Courses
            </Button>
          </div>

          <AcademicCalendarManager
            semesterId={semesterId}
            defaultYear={startDate ? Number(startDate.slice(0, 4)) : new Date().getFullYear()}
            initialEntries={initialCalendarEntries}
            onChanged={() => setCalendarCount((c) => c + 1)}
          />
        </div>
      )}

      {/* Step 3: Courses */}
      {step === 3 && semesterId && (
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="page-heading text-lg">3. Courses</h2>
              <Button type="button" onClick={() => setStep(4)} className="min-h-[44px]">
                Next: Timetable
              </Button>
            </div>

            {previousSemesters.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background p-3">
                <select
                  value={copySourceId}
                  onChange={(e) => setCopySourceId(e.target.value)}
                  className="min-h-[44px] rounded border border-border bg-card px-2.5 text-xs text-foreground flex-1 min-w-[180px]"
                >
                  {previousSemesters.map((ps) => (
                    <option key={ps.id} value={ps.id}>
                      {ps.name} ({ps.courseCount} courses)
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending}
                  onClick={handleCopyCourses}
                  className="min-h-[44px]"
                >
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  Copy courses
                </Button>
              </div>
            )}

            <form onSubmit={handleAddCourse} className="space-y-3 border-t border-border pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  value={courseName}
                  onChange={(e) => setCourseName(e.target.value)}
                  placeholder="Course name (e.g. Operating Systems)"
                  className="min-h-[44px] rounded-md border border-border bg-background px-3 text-sm text-foreground"
                />
                <input
                  type="text"
                  value={courseCode}
                  onChange={(e) => setCourseCode(e.target.value)}
                  placeholder="Code (e.g. CS301)"
                  className="min-h-[44px] rounded-md border border-border bg-background px-3 text-sm text-foreground"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="space-y-1 text-xs text-muted-foreground">
                  <span>Credits</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={courseCredits}
                    onChange={(e) => setCourseCredits(Number(e.target.value) || 3)}
                    className="w-full min-h-[44px] rounded-md border border-border bg-background px-3 text-sm text-foreground"
                  />
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  <span>Attendance target %</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={attendanceTarget}
                    onChange={(e) => setAttendanceTarget(Number(e.target.value) || 75)}
                    className="w-full min-h-[44px] rounded-md border border-border bg-background px-3 text-sm text-foreground"
                  />
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  <span>Instructor (optional)</span>
                  <input
                    type="text"
                    value={instructor}
                    onChange={(e) => setInstructor(e.target.value)}
                    placeholder="Prof. Name"
                    className="w-full min-h-[44px] rounded-md border border-border bg-background px-3 text-sm text-foreground"
                  />
                </label>
              </div>
              <Button type="submit" disabled={isPending} className="min-h-[44px]">
                <Plus className="h-4 w-4 mr-1.5" />
                Add course
              </Button>
            </form>

            {courses.length > 0 && (
              <ul className="divide-y divide-border rounded-lg border border-border bg-background">
                {courses.map((c) => (
                  <li key={c.id} className="p-3 flex items-center justify-between text-sm">
                    <span className="font-medium text-foreground">
                      {c.name} {c.code ? `(${c.code})` : ""}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {c.credits} cr{c.instructor ? ` · ${c.instructor}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Step 4: Timetable */}
      {step === 4 && semesterId && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="page-heading text-lg">4. Timetable</h2>
          <p className="text-sm text-muted-foreground">
            If the timetable has been announced, add or import weekly class slots now. Otherwise, you can add it later and your academic calendar will apply automatically.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/semesters/${semesterId}/timetable`}
              className="inline-flex items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 min-h-[44px]"
            >
              Add / Import Timetable Now
            </Link>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setTimetableDeferred(true);
                setStep(5);
              }}
              className="min-h-[44px]"
            >
              I&apos;ll add it when it is announced
            </Button>
          </div>
        </div>
      )}

      {/* Step 5: Summary */}
      {step === 5 && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <h2 className="page-heading text-lg">5. Setup Summary</h2>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-2xl font-bold text-foreground">{calendarCount}</p>
              <p className="text-xs text-muted-foreground">Calendar entries</p>
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-2xl font-bold text-foreground">{courses.length}</p>
              <p className="text-xs text-muted-foreground">Courses</p>
            </div>
            <div className="rounded-lg border border-border bg-background p-3">
              <p className="text-2xl font-bold text-foreground">{initialScheduleCount}</p>
              <p className="text-xs text-muted-foreground">Weekly slots</p>
            </div>
          </div>

          <div className="space-y-2 pt-2">
            <p className="section-label">Readiness Checklist</p>
            <ul className="space-y-1.5 text-sm">
              <li className="flex items-center gap-2">
                {semesterId ? (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
                <span>Semester dates configured</span>
              </li>
              <li className="flex items-center gap-2">
                {calendarCount > 0 ? (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
                <span>
                  {calendarCount > 0
                    ? "Academic calendar added"
                    : "Academic calendar is still empty (optional)"}
                </span>
              </li>
              <li className="flex items-center gap-2">
                {courses.length > 0 ? (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
                <span>
                  {courses.length > 0
                    ? `${courses.length} courses added`
                    : "No courses added yet"}
                </span>
              </li>
              <li className="flex items-center gap-2">
                {initialScheduleCount > 0 ? (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
                <span>
                  {initialScheduleCount > 0
                    ? `${initialScheduleCount} weekly timetable slots configured`
                    : "Timetable not added yet — add when announced"}
                </span>
              </li>
            </ul>
          </div>

          <div className="flex justify-end">
            <Button type="button" onClick={handleFinish} className="min-h-[44px]">
              Open Semester
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
