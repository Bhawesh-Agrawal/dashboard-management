# Attendance Subsystem Audit & Lifecycle Map

Date: 2026-11-24
Status: Complete
Branch: `phase-3-attendance`

---

## 1. Executive Summary

This document maps the end-to-end lifecycle of attendance records in the application, details all code paths that create, modify, sync, or compute attendance, analyzes date storage and timezone handling, and provides confirmed evidence for all reported architectural and runtime bugs.

---

## 2. Data Model & Lifecycle Architecture

### 2.1 Current Schema Definition
In [prisma/schema.prisma](file:///home/bhawesh/Projects/dashboard-management/prisma/schema.prisma#L126-L145):

```prisma
model AttendanceRecord {
  id       String           @id @default(uuid())
  courseId String           @map("course_id")
  date     DateTime         @db.Date
  status   AttendanceStatus @default(not_marked)

  course Course @relation(fields: [courseId], references: [id], onDelete: Cascade)

  @@unique([courseId, date])
  @@map("attendance_records")
}

enum AttendanceStatus {
  present
  absent
  cancelled
  not_marked
}
```

### 2.2 Lifecycle & Creation Mechanics
- **On-Demand Only**: `AttendanceRecord` rows are **never** created ahead of time. When a semester, course, or class schedule is created, no corresponding attendance records are generated.
- **Occurrence Disconnect**: The database model links `AttendanceRecord` solely to `Course` (`courseId`) and a calendar date (`date @db.Date`). It possesses **no relation** to `ClassSchedule` (the recurring schedule entry).
- **Collision Vulnerability**: The unique constraint `@@unique([courseId, date])` enforces that only one record can exist per course per calendar day. If a course meets twice in one day (e.g. morning lecture at 09:00 and afternoon practical at 14:00), the two occurrences collide; marking one erases the other.

---

## 3. Code Paths Marking Attendance

### 3.1 Course Page Calendar Grid
- **Location**: [src/features/attendance/components/attendance-calendar.tsx](file:///home/bhawesh/Projects/dashboard-management/src/features/attendance/components/attendance-calendar.tsx#L54-L83)
- **Component**: `AttendanceSection` -> `AttendanceCell`
- **Behavior**:
  - `AttendanceSection` receives `records: AttendanceRecord[]` passed from [src/app/(app)/courses/[id]/page.tsx](file:///home/bhawesh/Projects/dashboard-management/src/app/(app)/courses/[id]/page.tsx#L91).
  - It iterates exclusively over existing `records`. If no record exists for a date, nothing is rendered.
  - Tapping a cell calls `cycleStatus()`, which rotates through `["not_marked", "present", "absent", "cancelled"]`.
  - Sets local React state `setStatus(nextStatus)`.
  - Dispatches `markAttendance({ courseId, date: record.date.toISOString().slice(0, 10), status: nextStatus })`.

### 3.2 Dashboard "Active & Upcoming" Card
- **Location**: [src/features/dashboard/components/active-upcoming.tsx](file:///home/bhawesh/Projects/dashboard-management/src/features/dashboard/components/active-upcoming.tsx#L119-L129)
- **Behavior**:
  - For currently active or upcoming classes today, provides a "Mark Present" button.
  - Handler computes:
    ```typescript
    const today = new Date().toISOString().split("T")[0];
    await markAttendance({
      courseId: cls.course.id,
      date: today,
      status: "present",
    });
    ```
  - Offers no option to mark "Absent" or "Cancelled" from this quick action.
  - When user clicks "Cancel Class" in this dialog ([active-upcoming.tsx:131-142](file:///home/bhawesh/Projects/dashboard-management/src/features/dashboard/components/active-upcoming.tsx#L131-L142)), it creates a `ScheduleException` record instead of an `AttendanceRecord`.

### 3.3 Web Push Notification Action
- **Location**: [public/sw.js](file:///home/bhawesh/Projects/dashboard-management/public/sw.js#L259-L290) and [src/app/api/attendance/mark-from-push/route.ts](file:///home/bhawesh/Projects/dashboard-management/src/app/api/attendance/mark-from-push/route.ts#L6-L48)
- **Trigger**: [src/features/notifications/lib/scheduler.ts](file:///home/bhawesh/Projects/dashboard-management/src/features/notifications/lib/scheduler.ts#L518-L605) emits push notification `attendance-${schedule.id}-${todayStr}` within 20 minutes after class end time.
- **Handling**:
  - Notification action buttons: `mark_present` ("Present") and `mark_absent` ("Absent").
  - Service worker intercepts click event and sends `POST /api/attendance/mark-from-push` with `{ courseId, date, status }`.
  - The API route validates ownership via `getCurrentUserId()` and `course.semester.userId`, then delegates to `markAttendance`.

### 3.4 Bulk Marking Action
- **Location**: [src/features/attendance/lib/actions.ts](file:///home/bhawesh/Projects/dashboard-management/src/features/attendance/lib/actions.ts#L50-L83)
- **Function**: `bulkMarkAttendance(courseId, records)`
- **Behavior**: Performs batch upserts inside a `prisma.$transaction`. Currently only consumed by unit test suites; no user UI exists for bulk operations.

### 3.5 Offline Sync Manager Push
- **Location**: [src/lib/sync/sync-manager.ts](file:///home/bhawesh/Projects/dashboard-management/src/lib/sync/sync-manager.ts#L248-L265)
- **Method**: `pushDirtyAttendance()` queries local IndexedDB `db.attendance.where("dirty").equals(1)`.
- **Target**: Calls `this.apiWrite("attendance", item)`, which posts to `/api/sync/write`.

---

## 4. Computation of Percentage and Marks (Auto vs Manual Mode)

### 4.1 Auto Mode vs Manual Mode
In [src/app/(app)/courses/[id]/page.tsx](file:///home/bhawesh/Projects/dashboard-management/src/app/(app)/courses/[id]/page.tsx#L30-L50):
- **Manual Mode**:
  If `course.attendanceMode === "manual"` and `course.manualTotalClasses !== null`:
  - `present = course.manualPresent ?? 0`
  - `absent = Math.max(0, course.manualTotalClasses - present)`
  - Attendance % is computed as `computeAttendancePercent(present, absent)`.
- **Auto Mode (Default)**:
  - Filters `course.attendanceRecords` in memory:
    - `present = records.filter(r => r.status === "present").length`
    - `absent = records.filter(r => r.status === "absent").length`
  - Attendance % is computed via `computeAttendancePercent(present, absent)`.

### 4.2 Percentage Calculation Logic
In [src/features/assessments/lib/calculations.ts](file:///home/bhawesh/Projects/dashboard-management/src/features/assessments/lib/calculations.ts#L11-L15):
```typescript
export function computeAttendancePercent(present: number, absent: number): number {
  const total = present + absent;
  if (total === 0) return 0;
  return (present / total) * 100;
}
```
- `cancelled` and `not_marked` are excluded from the denominator.
- **Critical Flaw**: Unrecorded past classes are completely invisible to this formula. If a student enrolled in a course with 40 scheduled classes attends 1 class and never records the other 39, `records` has only 1 row (`present`), yielding `1 / (1 + 0) * 100 = 100%`.

### 4.3 Marks Calculation Logic
In [src/features/assessments/lib/calculations.ts](file:///home/bhawesh/Projects/dashboard-management/src/features/assessments/lib/calculations.ts#L22-L34):
- Evaluates `attendancePercent` against course-specific or semester default tiers (e.g., `>=85%` -> 5 marks, `>=80%` -> 4 marks, down to `<65%` -> 0 marks).
- **Missing Metrics**: There is no calculation for:
  - "How many classes can I still miss while staying above 75%?"
  - "How many consecutive classes must I attend to recover to 75%?"

---

## 5. Handling of Cancelled Classes and ScheduleExceptions

- **Two Competing Mechanisms**:
  1. `ScheduleException` in [prisma/schema.prisma](file:///home/bhawesh/Projects/dashboard-management/prisma/schema.prisma#L109-L124): Records `type: "cancelled" | "rescheduled"` linked to `classScheduleId` and `date`.
  2. `AttendanceRecord.status = "cancelled"` in [prisma/schema.prisma](file:///home/bhawesh/Projects/dashboard-management/prisma/schema.prisma#L132).
- **Inconsistencies**:
  - Cancelling a class from the dashboard creates a `ScheduleException` ([active-upcoming.tsx:131-142](file:///home/bhawesh/Projects/dashboard-management/src/features/dashboard/components/active-upcoming.tsx#L131-L142)) but **does not create** an `AttendanceRecord`.
  - The Course Page calendar grid ([attendance-calendar.tsx](file:///home/bhawesh/Projects/dashboard-management/src/features/attendance/components/attendance-calendar.tsx)) only queries `AttendanceRecord`. Thus, classes cancelled via the schedule exception system do not display as cancelled in the attendance calendar!
  - `generateClassEndNotifications` ([scheduler.ts:559](file:///home/bhawesh/Projects/dashboard-management/src/features/notifications/lib/scheduler.ts#L559)) checks `ScheduleException`, skipping notification generation if `exception.type === "cancelled"`.

---

## 6. Date Storage, Timezone & Comparison Analysis

- **Storage Type**: Postgres `@db.Date` via Prisma `DateTime @db.Date`.
- **Parsing Bug**:
  In [src/features/attendance/lib/actions.ts:26](file:///home/bhawesh/Projects/dashboard-management/src/features/attendance/lib/actions.ts#L26):
  ```typescript
  const date = data.date ? new Date(data.date) : getNow();
  ```
  - When `data.date` is `"2026-11-24"`, JavaScript parses `new Date("2026-11-24")` as UTC midnight (`2026-11-24T00:00:00.000Z`).
  - When retrieved by Prisma, it returns a `Date` object representing UTC midnight.
  - When client code calls `record.date.toLocaleDateString()` in any timezone with a negative UTC offset (such as Americas), the date renders as the preceding day (`2026-11-23`).
- **Generation Bug**:
  In [active-upcoming.tsx:121](file:///home/bhawesh/Projects/dashboard-management/src/features/dashboard/components/active-upcoming.tsx#L121) and [scheduler.ts:555](file:///home/bhawesh/Projects/dashboard-management/src/features/notifications/lib/scheduler.ts#L555):
  ```typescript
  const today = new Date().toISOString().split("T")[0];
  ```
  - `new Date().toISOString()` returns the UTC date string.
  - In Nepal (`UTC+05:45`) or India (`UTC+05:30`), between midnight and 05:30/05:45 AM, UTC is still on the previous calendar date. Any early morning or post-midnight operation marks attendance on the wrong calendar date!

---

## 7. Investigation of Known Leads

### Lead (a): Calendar only renders existing records; unrecorded classes invisible
- **Status**: **CONFIRMED**
- **Evidence**:
  [src/features/attendance/components/attendance-calendar.tsx:37-49](file:///home/bhawesh/Projects/dashboard-management/src/features/attendance/components/attendance-calendar.tsx#L37-L49):
  ```tsx
  {records.length === 0 ? (
    <p className="text-sm text-muted-foreground">No attendance records yet.</p>
  ) : (
    <div className="grid grid-cols-7 gap-1.5">
      {records.map((record) => (
        <AttendanceCell key={record.id} record={record} courseId={courseId} />
      ))}
    </div>
  )}
  ```
  The calendar maps strictly over `records`. If a class was scheduled but not marked, no record exists in `AttendanceRecord`, making the class completely invisible in the UI.

### Lead (b): Tap cycles four states with server round-trip and no error handling or rollback
- **Status**: **CONFIRMED**
- **Evidence**:
  [src/features/attendance/components/attendance-calendar.tsx:61-72](file:///home/bhawesh/Projects/dashboard-management/src/features/attendance/components/attendance-calendar.tsx#L61-L72):
  ```typescript
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
  ```
  There is no `try/catch` block. If the server request fails (due to network failure, session expiration, or DB error), the UI retains `nextStatus` falsely. There is no rollback mechanism and no error indication to the user.

### Lead (c): Dates are built from UTC midnight and displayed in local time
- **Status**: **CONFIRMED**
- **Evidence**:
  - [src/features/attendance/lib/actions.ts:26](file:///home/bhawesh/Projects/dashboard-management/src/features/attendance/lib/actions.ts#L26): `new Date(data.date)` parses date strings as UTC midnight.
  - [src/features/attendance/components/attendance-calendar.tsx:78-81](file:///home/bhawesh/Projects/dashboard-management/src/features/attendance/components/attendance-calendar.tsx#L78-L81): `record.date.toLocaleDateString(...)` formats UTC midnight in client local time, causing day-shift bugs depending on the client timezone.
  - [src/features/dashboard/components/active-upcoming.tsx:121](file:///home/bhawesh/Projects/dashboard-management/src/features/dashboard/components/active-upcoming.tsx#L121): `new Date().toISOString().split("T")[0]` evaluates to yesterday's date in Asian timezones during the early morning hours.

### Lead (d): AttendanceRecord has no link to class occurrence
- **Status**: **CONFIRMED**
- **Evidence**:
  [prisma/schema.prisma:128-138](file:///home/bhawesh/Projects/dashboard-management/prisma/schema.prisma#L128-L138):
  `AttendanceRecord` contains `courseId` and `date`, with constraint `@@unique([courseId, date])`. It has no foreign key to `ClassSchedule` (`classScheduleId`). Multiple class sessions for the same course on the same day cannot be individually tracked or marked.

### Lead (e): Sync manager pushes attendance to /api/sync/write which does not support it and swallows error
- **Status**: **CONFIRMED**
- **Evidence**:
  - [src/lib/sync/sync-manager.ts:248-265](file:///home/bhawesh/Projects/dashboard-management/src/lib/sync/sync-manager.ts#L248-L265):
    `pushDirtyAttendance` invokes `this.apiWrite("attendance", item)`.
  - [src/app/api/sync/write/route.ts:56-61](file:///home/bhawesh/Projects/dashboard-management/src/app/api/sync/write/route.ts#L56-L61):
    `handleUpsert` handles only `tasks`, `courses`, `notes`, `routines`, and `events`. Any other table (including `attendance`) hits `default: throw new Error("Unknown table: " + table)`, returning HTTP 500.
  - [src/lib/sync/sync-manager.ts:261-263](file:///home/bhawesh/Projects/dashboard-management/src/lib/sync/sync-manager.ts#L261-L263):
    The empty `catch { // Will retry }` swallows the 500 error, leaving `dirty = 1` in IndexedDB, which causes an infinite retry loop on every sync cycle.

---

## 8. Summary of Bugs

| Bug ID | Description | File & Line | Status |
|---|---|---|---|
| BUG-ATT-01 | Calendar grid only displays pre-existing `AttendanceRecord`s; unrecorded classes are missing | `attendance-calendar.tsx:37-49` | CONFIRMED |
| BUG-ATT-02 | Calendar tap cycles 4 states optimistically with no rollback or error handling on failure | `attendance-calendar.tsx:61-72` | CONFIRMED |
| BUG-ATT-03 | UTC midnight dates formatted in local browser time cause date shifts | `actions.ts:26`, `attendance-calendar.tsx:78-81` | CONFIRMED |
| BUG-ATT-04 | `toISOString().split("T")[0]` produces wrong local date in Asia before 05:30/05:45 AM | `active-upcoming.tsx:121`, `scheduler.ts:555` | CONFIRMED |
| BUG-ATT-05 | `AttendanceRecord` lacks `classScheduleId`; multi-period days collide | `prisma/schema.prisma:128-138` | CONFIRMED |
| BUG-ATT-06 | `pushDirtyAttendance` posts to unsupported `/api/sync/write` table and swallows 500 error | `sync-manager.ts:248-265`, `sync/write/route.ts:56` | CONFIRMED |
| BUG-ATT-07 | Schedule exceptions (cancellations) are disconnected from `AttendanceRecord` calculation | `active-upcoming.tsx:134`, `page.tsx:43` | CONFIRMED |
| BUG-ATT-08 | Attendance calculations ignore past unrecorded classes, skewing percentage upwards | `calculations.ts:11`, `courses/[id]/page.tsx:49` | CONFIRMED |
| BUG-ATT-09 | Proxy uses unverified `getSession()` instead of server-verified `getUser()` | `src/proxy.ts:21` | CONFIRMED |
