-- AlterTable
ALTER TABLE "attendance_records" ADD COLUMN "class_schedule_id" TEXT;

-- CreateIndex
CREATE INDEX "attendance_records_class_schedule_id_idx" ON "attendance_records"("class_schedule_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_class_schedule_id_date_key" ON "attendance_records"("class_schedule_id", "date");

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_class_schedule_id_fkey" FOREIGN KEY ("class_schedule_id") REFERENCES "class_schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;
