-- Additive migration: add weather location columns on notification_preferences and weather_cache table
ALTER TABLE "notification_preferences"
  ADD COLUMN IF NOT EXISTS "location_name" TEXT,
  ADD COLUMN IF NOT EXISTS "location_lat" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "location_lon" DOUBLE PRECISION;

CREATE TABLE IF NOT EXISTS "weather_cache" (
  "id" TEXT NOT NULL,
  "cache_key" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "weather_cache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "weather_cache_cache_key_key"
  ON "weather_cache"("cache_key");

CREATE INDEX IF NOT EXISTS "weather_cache_fetched_at_idx"
  ON "weather_cache"("fetched_at");
