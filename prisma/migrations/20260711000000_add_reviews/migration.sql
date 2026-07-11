-- CreateEnum
CREATE TYPE "ReviewType" AS ENUM ('daily', 'weekly', 'monthly', 'quarterly');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('generated', 'viewed', 'archived');

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "ReviewType" NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "period_end" TIMESTAMP(3) NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'generated',
    "summary" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "metrics" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "viewed_at" TIMESTAMP(3),

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reviews_user_id_type_idx" ON "reviews"("user_id", "type");

-- CreateIndex
CREATE INDEX "reviews_period_end_idx" ON "reviews"("period_end");

-- CreateIndex
CREATE INDEX "reviews_status_idx" ON "reviews"("status");
