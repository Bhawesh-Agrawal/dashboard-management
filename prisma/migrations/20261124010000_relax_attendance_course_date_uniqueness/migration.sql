-- DropIndex
DROP INDEX IF EXISTS "attendance_records_course_id_date_key";

-- CreateIndex
CREATE INDEX "attendance_records_course_id_date_idx" ON "attendance_records"("course_id", "date");
