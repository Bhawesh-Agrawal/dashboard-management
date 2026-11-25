-- Additive migration: add is_travel on events and event_documents join table
ALTER TABLE "events"
  ADD COLUMN IF NOT EXISTS "is_travel" BOOLEAN;

CREATE TABLE IF NOT EXISTS "event_documents" (
  "id" TEXT NOT NULL,
  "event_id" TEXT NOT NULL,
  "note_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_documents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "event_documents_event_id_note_id_key"
  ON "event_documents"("event_id", "note_id");

CREATE INDEX IF NOT EXISTS "event_documents_event_id_idx"
  ON "event_documents"("event_id");

CREATE INDEX IF NOT EXISTS "event_documents_note_id_idx"
  ON "event_documents"("note_id");

DO $$ BEGIN
  ALTER TABLE "event_documents"
    ADD CONSTRAINT "event_documents_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "event_documents"
    ADD CONSTRAINT "event_documents_note_id_fkey"
    FOREIGN KEY ("note_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
