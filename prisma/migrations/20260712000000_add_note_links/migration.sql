-- AlterTable: Add spaced repetition fields to Note
ALTER TABLE "notes" ADD COLUMN "last_reviewed_at" TIMESTAMP(3);
ALTER TABLE "notes" ADD COLUMN "review_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable: NoteLink
CREATE TABLE "note_links" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "strength" DOUBLE PRECISION NOT NULL,
    "link_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "note_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Unique constraint on sourceId+targetId
CREATE UNIQUE INDEX "note_links_source_id_target_id_key" ON "note_links"("source_id", "target_id");

-- CreateIndex: Index on sourceId
CREATE INDEX "note_links_source_id_idx" ON "note_links"("source_id");

-- CreateIndex: Index on targetId
CREATE INDEX "note_links_target_id_idx" ON "note_links"("target_id");

-- AddForeignKey: NoteLink.source -> Note
ALTER TABLE "note_links" ADD CONSTRAINT "note_links_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: NoteLink.target -> Note
ALTER TABLE "note_links" ADD CONSTRAINT "note_links_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
