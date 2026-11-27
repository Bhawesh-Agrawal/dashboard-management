-- Additive migration: add brief_config JSONB column and midday enum value
ALTER TABLE "notification_preferences"
  ADD COLUMN IF NOT EXISTS "brief_config" JSONB;

ALTER TYPE "DailyBriefKind" ADD VALUE IF NOT EXISTS 'midday';
