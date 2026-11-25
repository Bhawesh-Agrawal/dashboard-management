import { z } from "zod";
import {
  DSA_CLASSIFICATIONS,
  DSA_CONTEST_PLATFORMS,
  DSA_DIFFICULTIES,
  DSA_HELP_TYPES,
  DSA_TOPIC_STATUSES,
  DateOnlyStringSchema,
  DsaPhaseSchema,
} from "./schemas";

export const DSA_BACKUP_SCHEMA_VERSION = "1.0.0";

export const DsaBackupSettingsSchema = z.object({
  id: z.string().uuid(),
  programmeStartDate: DateOnlyStringSchema,
  programmeLengthDays: z.number().int().min(1).max(3650),
  phases: z.array(DsaPhaseSchema),
  currentTopicId: z.string().uuid().nullable(),
  lastBackupAt: z.string().datetime().nullable(),
});

export const DsaBackupTopicSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  order: z.number().int(),
  status: z.enum(DSA_TOPIC_STATUSES),
});

export const DsaBackupProblemSchema = z.object({
  id: z.string().uuid(),
  topicId: z.string().uuid(),
  subtopic: z.string(),
  title: z.string().min(1),
  difficulty: z.enum(DSA_DIFFICULTIES).nullable(),
  sourceUrl: z.string(),
  platform: z.string(),
  platformId: z.string().nullable(),
  orderInTopic: z.number().int(),
  tags: z.array(z.string()),
  importKey: z.string().min(1),
  archived: z.boolean(),
  lastClassification: z.enum(DSA_CLASSIFICATIONS).nullable(),
  lastAttemptAt: z.string().datetime().nullable(),
  intervalDays: z.number().int().nullable(),
  consecutiveIndependent: z.number().int().min(0),
  nextRevisionDate: DateOnlyStringSchema.nullable(),
  manualNextRevisionDate: DateOnlyStringSchema.nullable(),
});

export const DsaBackupAttemptSchema = z.object({
  id: z.string().uuid(),
  problemId: z.string().uuid(),
  attemptedAt: z.string().datetime(),
  attemptDate: DateOnlyStringSchema,
  classification: z.enum(DSA_CLASSIFICATIONS),
  timeSpentMin: z.number().int().min(1),
  confidence: z.number().int().min(1).max(5),
  isRevision: z.boolean(),
  helpType: z.enum(DSA_HELP_TYPES),
  initialApproach: z.string().nullable(),
  finalApproach: z.string().nullable(),
  mistakes: z.string().nullable(),
  mistakeTags: z.array(z.string()),
  timeComplexity: z.string().nullable(),
  spaceComplexity: z.string().nullable(),
  observation: z.string().nullable(),
  sessionId: z.string().uuid().nullable(),
  clientRequestId: z.string().nullable(),
});

export const DsaBackupSessionSchema = z.object({
  id: z.string().uuid(),
  date: DateOnlyStringSchema,
  durationMin: z.number().int().min(0).nullable(),
  observations: z.string().nullable(),
  nextSessionAvailabilityMin: z.number().int().min(0).nullable(),
  nextSessionNote: z.string().nullable(),
});

export const DsaBackupContestSchema = z.object({
  id: z.string().uuid(),
  platform: z.enum(DSA_CONTEST_PLATFORMS),
  name: z.string().min(1),
  date: DateOnlyStringSchema,
  problemsAttempted: z.number().int().min(0),
  problemsSolved: z.number().int().min(0),
  rankOrRating: z.string().nullable(),
  upsolveProblems: z.string().nullable(),
  conceptsMissed: z.string().nullable(),
});

export const DsaBackupPayloadSchema = z.object({
  schemaVersion: z.literal(DSA_BACKUP_SCHEMA_VERSION),
  exportedAt: z.string().datetime(),
  data: z.object({
    settings: DsaBackupSettingsSchema.nullable(),
    topics: z.array(DsaBackupTopicSchema),
    problems: z.array(DsaBackupProblemSchema),
    attempts: z.array(DsaBackupAttemptSchema),
    sessions: z.array(DsaBackupSessionSchema),
    contests: z.array(DsaBackupContestSchema),
  }),
});

export type DsaBackupPayload = z.infer<typeof DsaBackupPayloadSchema>;

export interface BackupPreviewCounts {
  hasSettings: boolean;
  topics: number;
  problems: number;
  attempts: number;
  sessions: number;
  contests: number;
}

export function validateBackupPayload(raw: unknown):
  | { ok: true; payload: DsaBackupPayload; counts: BackupPreviewCounts }
  | { ok: false; error: string } {
  const parsed = DsaBackupPayloadSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first ? `${first.path.join(".")}: ${first.message}` : "Invalid backup schema",
    };
  }

  const { data } = parsed.data;
  const topicIds = new Set(data.topics.map((t) => t.id));
  const problemIds = new Set(data.problems.map((p) => p.id));
  const sessionIds = new Set(data.sessions.map((s) => s.id));

  for (const p of data.problems) {
    if (!topicIds.has(p.topicId)) {
      return {
        ok: false,
        error: `Problem "${p.title}" references missing topicId ${p.topicId}`,
      };
    }
  }
  for (const a of data.attempts) {
    if (!problemIds.has(a.problemId)) {
      return {
        ok: false,
        error: `Attempt ${a.id} references missing problemId ${a.problemId}`,
      };
    }
    if (a.sessionId && !sessionIds.has(a.sessionId)) {
      return {
        ok: false,
        error: `Attempt ${a.id} references missing sessionId ${a.sessionId}`,
      };
    }
  }

  return {
    ok: true,
    payload: parsed.data,
    counts: {
      hasSettings: data.settings !== null,
      topics: data.topics.length,
      problems: data.problems.length,
      attempts: data.attempts.length,
      sessions: data.sessions.length,
      contests: data.contests.length,
    },
  };
}
