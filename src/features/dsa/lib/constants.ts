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
    badgeClass: "bg-primary/10 text-primary",
  },
  effortful: {
    label: "Solved with considerable effort",
    shortLabel: "Effortful",
    description: "Got there yourself, but struggled or took long.",
    intervalLabel: "3d",
    severityRank: 2,
    badgeClass: "bg-muted text-foreground",
  },
  hinted: {
    label: "Solved with hints",
    shortLabel: "Hinted",
    description: "Needed a nudge or partial hint to finish.",
    intervalLabel: "2d",
    severityRank: 3,
    badgeClass: "bg-muted text-muted-foreground",
  },
  editorial: {
    label: "Understood after editorial",
    shortLabel: "Editorial",
    description: "Read editorial/solution, now understand the idea.",
    intervalLabel: "1d",
    severityRank: 4,
    badgeClass: "bg-muted text-muted-foreground",
  },
  not_understood: {
    label: "Still not understood",
    shortLabel: "Not understood",
    description: "Could not follow or still unclear.",
    intervalLabel: "1d",
    severityRank: 5,
    badgeClass: "bg-destructive/10 text-destructive",
  },
};

export const DIFFICULTY_BADGE_CLASS: Record<DsaDifficultyValue, string> = {
  easy: "bg-muted text-foreground",
  medium: "bg-muted text-muted-foreground",
  hard: "bg-destructive/10 text-destructive",
};

export const HELP_TYPE_LABELS: Record<DsaHelpTypeValue, string> = {
  none: "None",
  small_hint: "Small hint",
  big_hint: "Big hint",
  editorial: "Editorial",
  tutor: "Tutor",
  other: "Other",
};
