"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

// ─── Types ──────────────────────────────────────────────────

export type TaskWithEnergy = {
  id: string;
  title: string;
  priority: number;
  dueDate: Date | null;
  energyRequirement: string | null;
  estimatedDuration: number | null;
  optimalTimeOfDay: string | null;
  sortPriority: number | null;
  course: { name: string; color: string | null } | null;
  project: { name: string; color: string | null } | null;
};

type SuggestionResult = {
  current: TaskWithEnergy[];
  suggested: TaskWithEnergy[];
  explanation: string[];
};

// ─── Energy Curve Helpers ───────────────────────────────────

const START_HOUR = 6;

type RoutineEnergy = {
  timeOfDay: string;
  specificTime: string | null;
  energyImpact: "charging" | "draining" | "neutral";
};

function getRoutinePosition(r: RoutineEnergy): number {
  if (r.specificTime) {
    const [h, m] = r.specificTime.split(":").map(Number);
    return (h * 60 + m) - START_HOUR * 60;
  }
  const midpoints: Record<string, number> = {
    morning: 7.5,
    afternoon: 13,
    evening: 19,
    anytime: 20,
  };
  return ((midpoints[r.timeOfDay] ?? 12) - START_HOUR) * 60;
}

function computeEnergyAtTime(
  routines: RoutineEnergy[],
  targetMinutesFromStart: number
): number {
  let energy = 60; // baseline

  const sorted = [...routines]
    .map((r) => ({ ...r, pos: getRoutinePosition(r) }))
    .sort((a, b) => a.pos - b.pos);

  for (const r of sorted) {
    const effect =
      r.energyImpact === "charging" ? 15 : r.energyImpact === "draining" ? -15 : 0;
    const dist = Math.abs(targetMinutesFromStart - r.pos);
    if (dist < 120) {
      // Within 2 hours
      const decay = 1 - dist / 120;
      energy += effect * decay;
    }
  }

  // Circadian adjustments
  const hour = START_HOUR + targetMinutesFromStart / 60;
  if (hour >= 13 && hour <= 15) energy -= 8;
  if (hour >= 19) energy -= (hour - 19) * 5;
  if (hour >= 6 && hour <= 8) energy += (hour - 6) * 5;

  return Math.max(0, Math.min(100, energy));
}

// ─── Suggest Task Order ─────────────────────────────────────

export async function suggestTaskOrder(
  userId: string,
  date: Date
): Promise<SuggestionResult> {
  const dayOfWeek = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][
    date.getDay()
  ];

  // Get incomplete tasks
  const tasks = await prisma.task.findMany({
    where: {
      userId,
      status: "open",
    },
    orderBy: [{ priority: "asc" }, { dueDate: "asc" }],
    include: {
      course: { select: { name: true, color: true } },
      project: { select: { name: true, color: true } },
    },
  });

  // Get today's routines with energy impact
  const routines = await prisma.routine.findMany({
    where: {
      activeDays: { has: dayOfWeek as "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN" },
    },
    select: {
      timeOfDay: true,
      specificTime: true,
      energyImpact: true,
    },
  });

  const routineEnergy: RoutineEnergy[] = routines;

  // Current order (existing sort)
  const current: TaskWithEnergy[] = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    dueDate: t.dueDate,
    energyRequirement: t.energyRequirement,
    estimatedDuration: t.estimatedDuration,
    optimalTimeOfDay: t.optimalTimeOfDay,
    sortPriority: t.sortPriority,
    course: t.course,
    project: t.project,
  }));

  // Score each task for energy matching
  const todayStart = new Date(date);
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(date);
  todayEnd.setHours(23, 59, 59, 999);
  const tomorrowEnd = new Date(todayEnd);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);

  const scored = tasks.map((task) => {
    let score = 0;
    const explanation: string[] = [];

    // Urgency bonus (deadlines)
    if (task.dueDate && task.dueDate <= todayEnd) {
      score += 50;
      explanation.push("Due today");
    } else if (task.dueDate && task.dueDate <= tomorrowEnd) {
      score += 25;
      explanation.push("Due tomorrow");
    }

    // Priority bonus
    const priorityBonus = (5 - task.priority) * 10;
    score += priorityBonus;
    if (task.priority === 1) explanation.push("High priority");

    // Energy matching
    const energyLevel = task.energyRequirement ?? "medium";
    const energyScore =
      energyLevel === "high" ? 80 : energyLevel === "medium" ? 50 : 20;

    // Find best time slot for this task's energy requirement
    const timeSlots = [0, 120, 240, 360, 480, 600, 720, 840, 960]; // 30-min intervals
    let bestSlotEnergy = 50;
    let bestSlotLabel = "anytime";

    for (const slot of timeSlots) {
      const curveEnergy = computeEnergyAtTime(routineEnergy, slot);
      const match = 100 - Math.abs(energyScore - curveEnergy);
      if (match > bestSlotEnergy) {
        bestSlotEnergy = match;
        const slotHour = START_HOUR + slot / 60;
        bestSlotLabel = formatHour(Math.round(slotHour));
      }
    }

    score += bestSlotEnergy * 0.3;
    if (energyLevel === "high") {
      explanation.push(`High-energy → ${bestSlotLabel}`);
    }

    // Optimal time bonus
    if (task.optimalTimeOfDay && task.optimalTimeOfDay !== "any") {
      const timeOfDayMap: Record<string, [number, number]> = {
        morning: [0, 360],      // 6 AM - 12 PM
        afternoon: [360, 720],  // 12 PM - 6 PM
        evening: [720, 960],    // 6 PM - 10 PM
      };
      const [start, end] = timeOfDayMap[task.optimalTimeOfDay] ?? [0, 960];
      const mid = (start + end) / 2;
      const curveEnergy = computeEnergyAtTime(routineEnergy, mid);
      score += curveEnergy * 0.1;
    }

    return {
      task,
      score,
      explanation,
    };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Assign sortPriority values
  const suggested: TaskWithEnergy[] = scored.map((s, i) => ({
    id: s.task.id,
    title: s.task.title,
    priority: s.task.priority,
    dueDate: s.task.dueDate,
    energyRequirement: s.task.energyRequirement,
    estimatedDuration: s.task.estimatedDuration,
    optimalTimeOfDay: s.task.optimalTimeOfDay,
    sortPriority: i + 1,
    course: s.task.course,
    project: s.task.project,
  }));

  // Build explanation
  const explanations: string[] = [];
  if (scored.length > 0) {
    const top = scored[0];
    if (top.explanation.length > 0) {
      explanations.push(`Top task: ${top.task.title} — ${top.explanation.join(", ")}`);
    }
  }
  const highEnergyTasks = scored.filter(
    (s) => s.task.energyRequirement === "high"
  );
  if (highEnergyTasks.length > 0) {
    explanations.push(
      `${highEnergyTasks.length} high-energy task${highEnergyTasks.length !== 1 ? "s" : ""} matched to peak energy windows`
    );
  }

  return { current, suggested, explanation: explanations };
}

// ─── Apply Task Order ───────────────────────────────────────

export async function applyTaskOrder(taskIds: string[]): Promise<void> {
  await Promise.all(
    taskIds.map((id, index) =>
      prisma.task.update({
        where: { id },
        data: { sortPriority: index + 1 },
      })
    )
  );
  revalidatePath("/tasks");
  revalidatePath("/today");
}

// ─── Helpers ────────────────────────────────────────────────

function formatHour(hour: number): string {
  if (hour === 0 || hour === 12) return hour === 0 ? "12AM" : "12PM";
  return hour > 12 ? `${hour - 12}PM` : `${hour}AM`;
}
