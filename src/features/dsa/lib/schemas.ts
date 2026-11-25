import { z } from "zod";

export const DSA_TOPIC_STATUSES = [
  "not_started",
  "in_progress",
  "practised",
  "needs_revision",
  "comfortable",
] as const;

export const DSA_DIFFICULTIES = ["easy", "medium", "hard"] as const;

export const DSA_CLASSIFICATIONS = [
  "independent",
  "effortful",
  "hinted",
  "editorial",
  "not_understood",
] as const;

export const DSA_HELP_TYPES = [
  "none",
  "small_hint",
  "big_hint",
  "editorial",
  "tutor",
  "other",
] as const;

export const DSA_MISTAKE_TAGS = [
  "off-by-one",
  "edge case",
  "wrong data structure",
  "complexity/TLE",
  "missed pattern",
  "implementation bug",
  "misread problem",
  "other",
] as const;

export const DSA_CONTEST_PLATFORMS = ["leetcode", "codechef", "other"] as const;

export const DateOnlyStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD");

export const DsaPhaseSchema = z.object({
  name: z.string().trim().min(1, "Phase name is required").max(80),
  startDay: z.number().int().min(1).max(3650),
});

export const DsaSettingsInputSchema = z.object({
  programmeStartDate: DateOnlyStringSchema,
  programmeLengthDays: z.number().int().min(1).max(3650).default(90),
  phases: z.array(DsaPhaseSchema).default([]),
  currentTopicId: z.string().uuid().nullable().optional(),
});

export const DsaTopicStatusSchema = z.enum(DSA_TOPIC_STATUSES);

export const DsaCreateAttemptSchema = z.object({
  problemId: z.string().uuid(),
  attemptDate: DateOnlyStringSchema.optional(),
  classification: z.enum(DSA_CLASSIFICATIONS),
  timeSpentMin: z.number().int().min(1).max(1440),
  confidence: z.number().int().min(1).max(5),
  isRevision: z.boolean().optional(),
  helpType: z.enum(DSA_HELP_TYPES).default("none"),
  initialApproach: z.string().max(4000).optional().nullable(),
  finalApproach: z.string().max(4000).optional().nullable(),
  mistakes: z.string().max(4000).optional().nullable(),
  mistakeTags: z.array(z.string().trim().min(1).max(64)).default([]),
  timeComplexity: z.string().max(120).optional().nullable(),
  spaceComplexity: z.string().max(120).optional().nullable(),
  observation: z.string().max(4000).optional().nullable(),
  clientRequestId: z.string().min(1).max(120).optional(),
});

export const DsaUpdateAttemptSchema = DsaCreateAttemptSchema.omit({
  problemId: true,
  clientRequestId: true,
}).extend({
  attemptId: z.string().uuid(),
  attemptDate: DateOnlyStringSchema,
  isRevision: z.boolean(),
});

export const DsaSessionInputSchema = z.object({
  date: DateOnlyStringSchema,
  durationMin: z.number().int().min(0).max(1440).nullable().optional(),
  observations: z.string().max(4000).nullable().optional(),
  nextSessionAvailabilityMin: z.number().int().min(0).max(1440).nullable().optional(),
  nextSessionNote: z.string().max(1000).nullable().optional(),
});

export const DsaContestInputSchema = z.object({
  platform: z.enum(DSA_CONTEST_PLATFORMS),
  name: z.string().trim().min(1, "Contest name is required").max(160),
  date: DateOnlyStringSchema,
  problemsAttempted: z.number().int().min(0).max(100),
  problemsSolved: z.number().int().min(0).max(100),
  rankOrRating: z.string().max(120).nullable().optional(),
  upsolveProblems: z.string().max(2000).nullable().optional(),
  conceptsMissed: z.string().max(2000).nullable().optional(),
});

export type DsaTopicStatusValue = (typeof DSA_TOPIC_STATUSES)[number];
export type DsaDifficultyValue = (typeof DSA_DIFFICULTIES)[number];
export type DsaClassificationValue = (typeof DSA_CLASSIFICATIONS)[number];
export type DsaHelpTypeValue = (typeof DSA_HELP_TYPES)[number];
export type DsaContestPlatformValue = (typeof DSA_CONTEST_PLATFORMS)[number];
export type DsaPhase = z.infer<typeof DsaPhaseSchema>;
