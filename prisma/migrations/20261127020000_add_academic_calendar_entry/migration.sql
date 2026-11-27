-- Additive migration: add academic_calendar_entries table
DO $$ BEGIN
  CREATE TYPE "AcademicCalendarKind" AS ENUM (
    'holiday',
    'break',
    'exam_period',
    'no_classes',
    'follows_weekday',
    'note'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "academic_calendar_entries" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "semester_id" TEXT NOT NULL,
  "kind" "AcademicCalendarKind" NOT NULL,
  "title" TEXT NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE NOT NULL,
  "cancels_classes" BOOLEAN NOT NULL DEFAULT true,
  "follows_weekday" INTEGER,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "academic_calendar_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "academic_calendar_entries_user_id_semester_id_start_date_idx"
  ON "academic_calendar_entries"("user_id", "semester_id", "start_date");

CREATE INDEX IF NOT EXISTS "academic_calendar_entries_semester_id_idx"
  ON "academic_calendar_entries"("semester_id");

DO $$ BEGIN
  ALTER TABLE "academic_calendar_entries"
    ADD CONSTRAINT "academic_calendar_entries_semester_id_fkey"
    FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
