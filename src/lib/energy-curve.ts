// Shared energy curve computation used by both the EnergyMap visualization
// and the task sequencing engine.

export const START_HOUR = 6;
const END_HOUR = 22;
const HOURS = END_HOUR - START_HOUR;

export type RoutineEnergy = {
  timeOfDay: string;
  specificTime: string | null;
  energyImpact: "charging" | "draining" | "neutral";
};

function getRoutinePosition(r: RoutineEnergy): number {
  if (r.specificTime) {
    const [h, m] = r.specificTime.split(":").map(Number);
    return h * 60 + m - START_HOUR * 60;
  }
  const midpoints: Record<string, number> = {
    morning: 7.5,
    afternoon: 13,
    evening: 19,
    anytime: 20,
  };
  return ((midpoints[r.timeOfDay] ?? 12) - START_HOUR) * 60;
}

/** Compute energy level (0-100) at a specific minute offset from START_HOUR. */
export function computeEnergyAtTime(
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
      const decay = 1 - dist / 120;
      energy += effect * decay;
    }
  }

  const hour = START_HOUR + targetMinutesFromStart / 60;
  if (hour >= 13 && hour <= 15) energy -= 8;
  if (hour >= 19) energy -= (hour - 19) * 5;
  if (hour >= 6 && hour <= 8) energy += (hour - 6) * 5;

  return Math.max(0, Math.min(100, energy));
}

/**
 * Compute the full energy curve as 32 points (every 30 min from 6 AM to 10 PM).
 * Used by EnergyMap for visualization.
 */
export function computeEnergyCurve(routines: RoutineEnergy[]): number[] {
  const points = 32;
  const curve: number[] = [];
  for (let i = 0; i < points; i++) {
    const minutesFromStart = (i / (points - 1)) * HOURS * 60;
    curve.push(computeEnergyAtTime(routines, minutesFromStart));
  }
  return curve;
}

export function formatHour(hour: number): string {
  if (hour === 0 || hour === 12) return hour === 0 ? "12AM" : "12PM";
  return hour > 12 ? `${hour - 12}PM` : `${hour}AM`;
}
