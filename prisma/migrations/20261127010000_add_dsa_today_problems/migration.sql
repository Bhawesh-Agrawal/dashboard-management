-- Additive migration: add today_problem_ids JSONB column on dsa_settings
ALTER TABLE "dsa_settings"
  ADD COLUMN IF NOT EXISTS "today_problem_ids" JSONB;
