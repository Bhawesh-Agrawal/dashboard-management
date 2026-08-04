-- CreateEnum
CREATE TYPE "ScheduleExceptionType" AS ENUM ('cancelled', 'rescheduled');

-- AlterTable: Add date range fields to ClassSchedule
ALTER TABLE "class_schedules" ADD COLUMN "effective_start_date" DATE,
ADD COLUMN "effective_end_date" DATE;

-- CreateTable
CREATE TABLE "schedule_exceptions" (
    "id" TEXT NOT NULL,
    "class_schedule_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "type" "ScheduleExceptionType" NOT NULL,
    "new_start_time" TEXT,
    "new_end_time" TEXT,
    "new_location" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sent_notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sent_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "schedule_exceptions_class_schedule_id_date_key" ON "schedule_exceptions"("class_schedule_id", "date");

-- CreateIndex
CREATE INDEX "schedule_exceptions_class_schedule_id_idx" ON "schedule_exceptions"("class_schedule_id");

-- CreateIndex
CREATE UNIQUE INDEX "sent_notifications_user_id_tag_key" ON "sent_notifications"("user_id", "tag");

-- CreateIndex
CREATE INDEX "sent_notifications_user_id_idx" ON "sent_notifications"("user_id");

-- CreateIndex
CREATE INDEX "sent_notifications_sent_at_idx" ON "sent_notifications"("sent_at");

-- AddForeignKey
ALTER TABLE "schedule_exceptions" ADD CONSTRAINT "schedule_exceptions_class_schedule_id_fkey" FOREIGN KEY ("class_schedule_id") REFERENCES "class_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

