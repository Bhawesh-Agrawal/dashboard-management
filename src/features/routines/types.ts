/**
 * Types for routines with streak information.
 * This file is safe to import from client components.
 */

export type RoutineWithStreak = {
  id: string;
  name: string;
  timeOfDay: string;
  specificTime: string | null;
  streakGoal: number | null;
  activeDays: string[];
  currentStreak: number;
  completedToday: boolean;
  lastCompletedAt: Date | null;
};
