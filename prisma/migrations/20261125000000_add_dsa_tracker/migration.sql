-- CreateEnum
CREATE TYPE "DsaTopicStatus" AS ENUM ('not_started', 'in_progress', 'practised', 'needs_revision', 'comfortable');

-- CreateEnum
CREATE TYPE "DsaDifficulty" AS ENUM ('easy', 'medium', 'hard');

-- CreateEnum
CREATE TYPE "DsaClassification" AS ENUM ('independent', 'effortful', 'hinted', 'editorial', 'not_understood');

-- CreateEnum
CREATE TYPE "DsaHelpType" AS ENUM ('none', 'small_hint', 'big_hint', 'editorial', 'tutor', 'other');

-- CreateEnum
CREATE TYPE "DsaContestPlatform" AS ENUM ('leetcode', 'codechef', 'other');

-- CreateTable
CREATE TABLE "dsa_settings" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "programme_start_date" DATE NOT NULL,
    "programme_length_days" INTEGER NOT NULL DEFAULT 90,
    "phases" JSONB NOT NULL DEFAULT '[]',
    "current_topic_id" TEXT,
    "last_backup_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dsa_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dsa_topics" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "status" "DsaTopicStatus" NOT NULL DEFAULT 'not_started',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dsa_topics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dsa_problems" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "subtopic" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL,
    "difficulty" "DsaDifficulty",
    "source_url" TEXT NOT NULL DEFAULT '',
    "platform" TEXT NOT NULL DEFAULT '',
    "platform_id" TEXT,
    "order_in_topic" INTEGER NOT NULL DEFAULT 0,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "import_key" TEXT NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "last_classification" "DsaClassification",
    "last_attempt_at" TIMESTAMP(3),
    "interval_days" INTEGER,
    "consecutive_independent" INTEGER NOT NULL DEFAULT 0,
    "next_revision_date" DATE,
    "manual_next_revision_date" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dsa_problems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dsa_attempts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "problem_id" TEXT NOT NULL,
    "attempted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempt_date" DATE NOT NULL,
    "classification" "DsaClassification" NOT NULL,
    "time_spent_min" INTEGER NOT NULL,
    "confidence" INTEGER NOT NULL,
    "is_revision" BOOLEAN NOT NULL DEFAULT false,
    "help_type" "DsaHelpType" NOT NULL DEFAULT 'none',
    "initial_approach" TEXT,
    "final_approach" TEXT,
    "mistakes" TEXT,
    "mistake_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "time_complexity" TEXT,
    "space_complexity" TEXT,
    "observation" TEXT,
    "session_id" TEXT,
    "client_request_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dsa_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dsa_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "duration_min" INTEGER,
    "observations" TEXT,
    "next_session_availability_min" INTEGER,
    "next_session_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dsa_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dsa_contests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "platform" "DsaContestPlatform" NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "problems_attempted" INTEGER NOT NULL,
    "problems_solved" INTEGER NOT NULL,
    "rank_or_rating" TEXT,
    "upsolve_problems" TEXT,
    "concepts_missed" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dsa_contests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dsa_settings_user_id_key" ON "dsa_settings"("user_id");

-- CreateIndex
CREATE INDEX "dsa_topics_user_id_order_idx" ON "dsa_topics"("user_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "dsa_topics_user_id_name_key" ON "dsa_topics"("user_id", "name");

-- CreateIndex
CREATE INDEX "dsa_problems_user_id_topic_id_order_in_topic_idx" ON "dsa_problems"("user_id", "topic_id", "order_in_topic");

-- CreateIndex
CREATE INDEX "dsa_problems_user_id_next_revision_date_idx" ON "dsa_problems"("user_id", "next_revision_date");

-- CreateIndex
CREATE UNIQUE INDEX "dsa_problems_user_id_import_key_key" ON "dsa_problems"("user_id", "import_key");

-- CreateIndex
CREATE INDEX "dsa_attempts_user_id_problem_id_attempted_at_idx" ON "dsa_attempts"("user_id", "problem_id", "attempted_at");

-- CreateIndex
CREATE INDEX "dsa_attempts_user_id_attempt_date_idx" ON "dsa_attempts"("user_id", "attempt_date");

-- CreateIndex
CREATE INDEX "dsa_attempts_session_id_idx" ON "dsa_attempts"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "dsa_attempts_user_id_client_request_id_key" ON "dsa_attempts"("user_id", "client_request_id");

-- CreateIndex
CREATE INDEX "dsa_sessions_user_id_date_idx" ON "dsa_sessions"("user_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "dsa_sessions_user_id_date_key" ON "dsa_sessions"("user_id", "date");

-- CreateIndex
CREATE INDEX "dsa_contests_user_id_date_idx" ON "dsa_contests"("user_id", "date");

-- AddForeignKey
ALTER TABLE "dsa_problems" ADD CONSTRAINT "dsa_problems_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "dsa_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dsa_attempts" ADD CONSTRAINT "dsa_attempts_problem_id_fkey" FOREIGN KEY ("problem_id") REFERENCES "dsa_problems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dsa_attempts" ADD CONSTRAINT "dsa_attempts_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "dsa_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
