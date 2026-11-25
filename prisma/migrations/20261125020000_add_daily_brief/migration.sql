-- Additive migration: add daily_briefs table for morning/evening deterministic briefs
DO $$ BEGIN
  CREATE TYPE "DailyBriefKind" AS ENUM ('morning', 'evening');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "daily_briefs" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "kind" "DailyBriefKind" NOT NULL,
  "for_date" DATE NOT NULL,
  "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payload" JSONB NOT NULL,
  CONSTRAINT "daily_briefs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "daily_briefs_user_id_kind_for_date_key"
  ON "daily_briefs"("user_id", "kind", "for_date");

CREATE INDEX IF NOT EXISTS "daily_briefs_user_id_generated_at_idx"
  ON "daily_briefs"("user_id", "generated_at");
