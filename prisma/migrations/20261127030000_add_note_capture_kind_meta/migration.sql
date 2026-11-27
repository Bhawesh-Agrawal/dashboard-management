-- AlterTable: additive-only columns for Notes capture inbox
ALTER TABLE "notes"
ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'note',
ADD COLUMN "meta" JSONB,
ADD COLUMN "archived_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "notes_user_id_kind_created_at_idx" ON "notes"("user_id", "kind", "created_at");
