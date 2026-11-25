-- Additive migration: add reminder_minutes on notification_preferences
ALTER TABLE "notification_preferences"
  ADD COLUMN IF NOT EXISTS "reminder_minutes" INTEGER;
