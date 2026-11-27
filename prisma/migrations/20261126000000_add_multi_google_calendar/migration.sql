-- Additive migration: add multi-account Google Calendar tables
CREATE TABLE IF NOT EXISTS "google_calendar_accounts" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "google_account_id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "label" TEXT,
  "access_token" TEXT NOT NULL,
  "refresh_token" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "google_calendar_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "google_calendar_accounts_user_id_google_account_id_key"
  ON "google_calendar_accounts"("user_id", "google_account_id");

CREATE INDEX IF NOT EXISTS "google_calendar_accounts_user_id_idx"
  ON "google_calendar_accounts"("user_id");

CREATE TABLE IF NOT EXISTS "google_calendar_subscriptions" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "account_id" TEXT NOT NULL,
  "calendar_id" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "color" TEXT,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "is_birthday" BOOLEAN NOT NULL DEFAULT false,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "google_calendar_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "google_calendar_subscriptions_account_id_calendar_id_key"
  ON "google_calendar_subscriptions"("account_id", "calendar_id");

CREATE INDEX IF NOT EXISTS "google_calendar_subscriptions_user_id_idx"
  ON "google_calendar_subscriptions"("user_id");

CREATE INDEX IF NOT EXISTS "google_calendar_subscriptions_account_id_idx"
  ON "google_calendar_subscriptions"("account_id");

DO $$ BEGIN
  ALTER TABLE "google_calendar_subscriptions"
    ADD CONSTRAINT "google_calendar_subscriptions_account_id_fkey"
    FOREIGN KEY ("account_id") REFERENCES "google_calendar_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
