import type {
  DsaClassificationValue,
  DsaDifficultyValue,
  DsaHelpTypeValue,
  DsaTopicStatusValue,
} from "./schemas";

export const TOPIC_STATUS_LABELS: Record<DsaTopicStatusValue, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  practised: "Practised",
  needs_revision: "Needs revision",
  comfortable: "Comfortable",
};

export const CLASSIFICATION_META: Record<
  DsaClassificationValue,
  {
    label: string;
    shortLabel: string;
    description: string;
    intervalLabel: string;
    severityRank: number;
    badgeClass: string;
  }
> = {
  independent: {
    label: "Solved independently",
    shortLabel: "Independent",
    description: "No hints, solved on your own.",
    intervalLabel: "7d → 14d → 30d",
    severityRank: 1,
    badgeClass: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  effortful: {
    label: "Solved with considerable effort",
    shortLabel: "Effortful",
    description: "Got there yourself, but struggled or took long.",
    intervalLabel: "3d",
    severityRank: 2,
    badgeClass: "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  },
  hinted: {
    label: "Solved with hints",
    shortLabel: "Hinted",
    description: "Needed a nudge or partial hint to finish.",
    intervalLabel: "2d",
    severityRank: 3,
    badgeClass: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  editorial: {
    label: "Understood after editorial",
    shortLabel: "Editorial",
    description: "Read editorial/solution, now understand the idea.",
    intervalLabel: "1d",
    severityRank: 4,
    badgeClass: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  },
  not_understood: {
    label: "Still not understood",
    shortLabel: "Not understood",
    description: "Could not follow or still unclear.",
    intervalLabel: "1d",
    severityRank: 5,
    badgeClass: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  },
};

export const DIFFICULTY_BADGE_CLASS: Record<DsaDifficultyValue, string> = {
  easy: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  medium: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  hard: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

export const HELP_TYPE_LABELS: Record<DsaHelpTypeValue, string> = {
  none: "None",
  small_hint: "Small hint",
  big_hint: "Big hint",
  editorial: "Editorial",
  tutor: "Tutor",
  other: "Other",
};
