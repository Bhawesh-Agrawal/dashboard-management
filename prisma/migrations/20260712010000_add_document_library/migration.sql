-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "GradingScale" AS ENUM ('ten_point', 'four_point');

-- CreateEnum
CREATE TYPE "AttendanceMode" AS ENUM ('auto', 'manual');

-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('present', 'absent', 'cancelled', 'not_marked');

-- CreateEnum
CREATE TYPE "AssessmentType" AS ENUM ('minor_assignment', 'attendance', 'mid_sem', 'end_sem');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('open', 'done');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('typed', 'ocr_photo', 'voice', 'uploaded_pdf', 'uploaded_pptx', 'uploaded_doc');

-- CreateEnum
CREATE TYPE "AttachmentType" AS ENUM ('PDF', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT', 'TEXT', 'LINK', 'OTHER');

-- CreateEnum
CREATE TYPE "FolderType" AS ENUM ('PYQ', 'RESOURCE_BOOK', 'LECTURE_NOTE', 'ASSIGNMENT', 'REFERENCE', 'PROJECT', 'GENERAL');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('general', 'birthday', 'class', 'assessment');

-- CreateEnum
CREATE TYPE "TimeOfDay" AS ENUM ('morning', 'afternoon', 'evening', 'anytime');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('active', 'completed', 'archived');

-- CreateEnum
CREATE TYPE "BudgetType" AS ENUM ('income', 'expense');

-- CreateEnum
CREATE TYPE "InsightSeverity" AS ENUM ('info', 'warning', 'critical');

-- CreateEnum
CREATE TYPE "InsightType" AS ENUM ('declining_skill', 'burnout_risk', 'missed_opportunity', 'relationship_drift', 'energy_mismatch', 'budget_anomaly', 'knowledge_gap', 'focus_fragmentation');

-- CreateEnum
CREATE TYPE "PatternType" AS ENUM ('procrastination_spike', 'energy_crash', 'social_isolation', 'overspending', 'learning_decay', 'attendance_decline', 'task_avoidance');

-- CreateEnum
CREATE TYPE "EnergyImpact" AS ENUM ('charging', 'draining', 'neutral');

-- CreateEnum
CREATE TYPE "IdentityStatus" AS ENUM ('aspirational', 'developing', 'integrated', 'neglected');

-- CreateEnum
CREATE TYPE "ReviewType" AS ENUM ('daily', 'weekly', 'monthly', 'quarterly');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('generated', 'viewed', 'archived');

-- CreateTable
CREATE TABLE "semesters" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "name" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "grading_scale" "GradingScale" NOT NULL DEFAULT 'ten_point',
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "semesters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL,
    "semester_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "credits" INTEGER NOT NULL,
    "instructor" TEXT,
    "color" TEXT,
    "target_grade" TEXT,
    "attendance_mode" "AttendanceMode" DEFAULT 'auto',
    "manual_present" INTEGER,
    "manual_total_classes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_schedules" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "day_of_week" "DayOfWeek" NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "location" TEXT,

    CONSTRAINT "class_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'not_marked',

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assessments" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "component_type" "AssessmentType" NOT NULL,
    "max_marks" INTEGER NOT NULL,
    "obtained_marks" INTEGER,
    "date" DATE,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grading_configs" (
    "id" TEXT NOT NULL,
    "course_id" TEXT,
    "semester_id" TEXT,
    "min_percent" DOUBLE PRECISION NOT NULL,
    "grade_point" INTEGER NOT NULL,

    CONSTRAINT "grading_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_marks_configs" (
    "id" TEXT NOT NULL,
    "course_id" TEXT,
    "semester_id" TEXT,
    "min_percent" DOUBLE PRECISION NOT NULL,
    "marks" INTEGER NOT NULL,

    CONSTRAINT "attendance_marks_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "title" TEXT NOT NULL,
    "notes" TEXT,
    "due_date" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 2,
    "status" "TaskStatus" NOT NULL DEFAULT 'open',
    "course_id" TEXT,
    "project_id" TEXT,
    "domain_id" TEXT,
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "energy_requirement" TEXT,
    "estimated_duration" INTEGER,
    "optimal_time_of_day" TEXT,
    "sort_priority" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "source_type" "SourceType" NOT NULL DEFAULT 'typed',
    "source_link" TEXT,
    "tags" TEXT[],
    "course_id" TEXT,
    "is_document_library_entry" BOOLEAN NOT NULL DEFAULT false,
    "folder_id" TEXT,
    "document_type" "AttachmentType",
    "s3_key" TEXT,
    "s3_url" TEXT,
    "file_size" INTEGER,
    "file_name" TEXT,
    "mime_type" TEXT,
    "page_count" INTEGER,
    "thumbnail_url" TEXT,
    "original_url" TEXT,
    "embed_html" TEXT,
    "extracted_text" TEXT,
    "last_viewed_at" TIMESTAMP(3),
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "last_reviewed_at" TIMESTAMP(3),
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_links" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "strength" DOUBLE PRECISION NOT NULL,
    "linkType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_attachments" (
    "id" TEXT NOT NULL,
    "note_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "AttachmentType" NOT NULL,
    "title" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "s3_url" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "thumbnail_url" TEXT,
    "page_count" INTEGER,
    "extracted_text" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "note_annotations" (
    "id" TEXT NOT NULL,
    "note_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "page_number" INTEGER NOT NULL,
    "x" DOUBLE PRECISION,
    "y" DOUBLE PRECISION,
    "width" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "text" TEXT,
    "color" TEXT NOT NULL DEFAULT '#FFD700',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "note_annotations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_folders" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "FolderType" NOT NULL DEFAULT 'GENERAL',
    "color" TEXT,
    "icon" TEXT,
    "parent_id" TEXT,
    "course_id" TEXT,
    "semester_id" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "title" TEXT NOT NULL,
    "date_time" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "notes" TEXT,
    "event_type" "EventType" DEFAULT 'general',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "text" TEXT NOT NULL,
    "source" TEXT,
    "tags" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routines" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "name" TEXT NOT NULL,
    "time_of_day" "TimeOfDay" NOT NULL,
    "specific_time" TEXT,
    "streak_goal" INTEGER,
    "active_days" "DayOfWeek"[],
    "energy_impact" "EnergyImpact" NOT NULL DEFAULT 'neutral',
    "category" TEXT,
    "flow_trigger" TEXT,
    "identity_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "routines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "routine_completions" (
    "id" TEXT NOT NULL,
    "routine_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "routine_completions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identities" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "description" TEXT,
    "status" "IdentityStatus" NOT NULL DEFAULT 'aspirational',
    "color" TEXT,
    "icon" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "daily_summary_time" TEXT,
    "daily_summary_sections" TEXT[],
    "timezone" TEXT,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "domains" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "domains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "domain_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "milestones" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "weight" INTEGER NOT NULL,
    "is_done" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_entries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "type" "BudgetType" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "category" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budget_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resources" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "notes" TEXT,
    "tags" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "name" TEXT NOT NULL,
    "birthday" DATE,
    "notes" TEXT,
    "last_contact" TIMESTAMP(3),
    "contact_frequency" TEXT,
    "relationship_type" TEXT,
    "energy_impact" "EnergyImpact" NOT NULL DEFAULT 'neutral',
    "importance_score" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_calendar_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_calendar_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_insights" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "insights" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "widget_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),

    CONSTRAINT "widget_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ignored_insights" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "InsightType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "InsightSeverity" NOT NULL,
    "evidence" JSONB,
    "dismissed_at" TIMESTAMP(3),
    "acted_on" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ignored_insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behavioral_patterns" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "pattern" "PatternType" NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL,
    "severity" "InsightSeverity" NOT NULL,
    "evidence" JSONB NOT NULL,
    "resolved_at" TIMESTAMP(3),
    "resolution" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behavioral_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "life_metrics" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "life_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "ReviewType" NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'generated',
    "summary" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "metrics" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewed_at" TIMESTAMP(3),

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_attachments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "content_type" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "semester_id" TEXT,
    "course_id" TEXT,
    "category" TEXT,
    "tags" TEXT[],
    "description" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "file_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "semesters_user_id_idx" ON "semesters"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_course_id_date_key" ON "attendance_records"("course_id", "date");

-- CreateIndex
CREATE INDEX "tasks_user_id_idx" ON "tasks"("user_id");

-- CreateIndex
CREATE INDEX "notes_user_id_idx" ON "notes"("user_id");

-- CreateIndex
CREATE INDEX "notes_folder_id_idx" ON "notes"("folder_id");

-- CreateIndex
CREATE INDEX "note_links_sourceId_idx" ON "note_links"("sourceId");

-- CreateIndex
CREATE INDEX "note_links_targetId_idx" ON "note_links"("targetId");

-- CreateIndex
CREATE UNIQUE INDEX "note_links_sourceId_targetId_key" ON "note_links"("sourceId", "targetId");

-- CreateIndex
CREATE INDEX "note_attachments_note_id_idx" ON "note_attachments"("note_id");

-- CreateIndex
CREATE INDEX "note_attachments_user_id_idx" ON "note_attachments"("user_id");

-- CreateIndex
CREATE INDEX "note_attachments_type_idx" ON "note_attachments"("type");

-- CreateIndex
CREATE INDEX "note_annotations_note_id_idx" ON "note_annotations"("note_id");

-- CreateIndex
CREATE INDEX "note_annotations_user_id_idx" ON "note_annotations"("user_id");

-- CreateIndex
CREATE INDEX "note_annotations_page_number_idx" ON "note_annotations"("page_number");

-- CreateIndex
CREATE INDEX "document_folders_user_id_idx" ON "document_folders"("user_id");

-- CreateIndex
CREATE INDEX "document_folders_parent_id_idx" ON "document_folders"("parent_id");

-- CreateIndex
CREATE INDEX "document_folders_course_id_idx" ON "document_folders"("course_id");

-- CreateIndex
CREATE INDEX "document_folders_semester_id_idx" ON "document_folders"("semester_id");

-- CreateIndex
CREATE INDEX "document_folders_type_idx" ON "document_folders"("type");

-- CreateIndex
CREATE INDEX "events_user_id_idx" ON "events"("user_id");

-- CreateIndex
CREATE INDEX "quotes_user_id_idx" ON "quotes"("user_id");

-- CreateIndex
CREATE INDEX "routines_user_id_idx" ON "routines"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "routine_completions_routine_id_date_key" ON "routine_completions"("routine_id", "date");

-- CreateIndex
CREATE INDEX "identities_user_id_idx" ON "identities"("user_id");

-- CreateIndex
CREATE INDEX "identities_status_idx" ON "identities"("status");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "notification_preferences_user_id_idx" ON "notification_preferences"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_type_key" ON "notification_preferences"("user_id", "type");

-- CreateIndex
CREATE INDEX "domains_user_id_idx" ON "domains"("user_id");

-- CreateIndex
CREATE INDEX "budget_entries_user_id_idx" ON "budget_entries"("user_id");

-- CreateIndex
CREATE INDEX "resources_user_id_idx" ON "resources"("user_id");

-- CreateIndex
CREATE INDEX "people_user_id_idx" ON "people"("user_id");

-- CreateIndex
CREATE INDEX "google_calendar_tokens_user_id_idx" ON "google_calendar_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "google_calendar_tokens_user_id_key" ON "google_calendar_tokens"("user_id");

-- CreateIndex
CREATE INDEX "ai_insights_user_id_idx" ON "ai_insights"("user_id");

-- CreateIndex
CREATE INDEX "widget_tokens_user_id_idx" ON "widget_tokens"("user_id");

-- CreateIndex
CREATE INDEX "ignored_insights_user_id_idx" ON "ignored_insights"("user_id");

-- CreateIndex
CREATE INDEX "ignored_insights_created_at_idx" ON "ignored_insights"("created_at");

-- CreateIndex
CREATE INDEX "ignored_insights_acted_on_dismissed_at_idx" ON "ignored_insights"("acted_on", "dismissed_at");

-- CreateIndex
CREATE INDEX "behavioral_patterns_user_id_idx" ON "behavioral_patterns"("user_id");

-- CreateIndex
CREATE INDEX "behavioral_patterns_detected_at_idx" ON "behavioral_patterns"("detected_at");

-- CreateIndex
CREATE INDEX "behavioral_patterns_resolved_at_idx" ON "behavioral_patterns"("resolved_at");

-- CreateIndex
CREATE INDEX "life_metrics_user_id_category_idx" ON "life_metrics"("user_id", "category");

-- CreateIndex
CREATE INDEX "life_metrics_recorded_at_idx" ON "life_metrics"("recorded_at");

-- CreateIndex
CREATE INDEX "reviews_user_id_type_idx" ON "reviews"("user_id", "type");

-- CreateIndex
CREATE INDEX "reviews_period_end_idx" ON "reviews"("period_end");

-- CreateIndex
CREATE INDEX "reviews_status_idx" ON "reviews"("status");

-- CreateIndex
CREATE INDEX "file_attachments_user_id_idx" ON "file_attachments"("user_id");

-- CreateIndex
CREATE INDEX "file_attachments_semester_id_idx" ON "file_attachments"("semester_id");

-- CreateIndex
CREATE INDEX "file_attachments_course_id_idx" ON "file_attachments"("course_id");

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_schedules" ADD CONSTRAINT "class_schedules_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_configs" ADD CONSTRAINT "grading_configs_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grading_configs" ADD CONSTRAINT "grading_configs_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_marks_configs" ADD CONSTRAINT "attendance_marks_configs_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_marks_configs" ADD CONSTRAINT "attendance_marks_configs_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "domains"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_folder_id_fkey" FOREIGN KEY ("folder_id") REFERENCES "document_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_links" ADD CONSTRAINT "note_links_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_links" ADD CONSTRAINT "note_links_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_attachments" ADD CONSTRAINT "note_attachments_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "note_annotations" ADD CONSTRAINT "note_annotations_note_id_fkey" FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "document_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_folders" ADD CONSTRAINT "document_folders_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routines" ADD CONSTRAINT "routines_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "identities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routine_completions" ADD CONSTRAINT "routine_completions_routine_id_fkey" FOREIGN KEY ("routine_id") REFERENCES "routines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_domain_id_fkey" FOREIGN KEY ("domain_id") REFERENCES "domains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_semester_id_fkey" FOREIGN KEY ("semester_id") REFERENCES "semesters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_attachments" ADD CONSTRAINT "file_attachments_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

