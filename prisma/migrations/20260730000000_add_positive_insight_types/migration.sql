-- AlterEnum
ALTER TYPE "InsightSeverity" ADD VALUE IF NOT EXISTS 'positive';

-- AlterEnum
ALTER TYPE "InsightType" ADD VALUE IF NOT EXISTS 'achievement';
ALTER TYPE "InsightType" ADD VALUE IF NOT EXISTS 'positive_trend';
ALTER TYPE "InsightType" ADD VALUE IF NOT EXISTS 'streak_milestone';
