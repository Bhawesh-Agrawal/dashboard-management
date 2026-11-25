-- Additive migration: add dedup_key column and unique index on (user_id, dedup_key) to sent_notifications
ALTER TABLE "sent_notifications" ADD COLUMN IF NOT EXISTS "dedup_key" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "sent_notifications_user_id_dedup_key_key"
  ON "sent_notifications"("user_id", "dedup_key");
