/**
 * Calculate completion percentage from milestones.
 * Each milestone contributes its weight toward 100%.
 */
export function computeProjectProgress(
  milestones: { isDone: boolean; weight: number }[]
): number {
  if (milestones.length === 0) return 0;
  const totalWeight = milestones.reduce((sum, m) => sum + m.weight, 0);
  if (totalWeight === 0) return 0;
  const doneWeight = milestones
    .filter((m) => m.isDone)
    .reduce((sum, m) => sum + m.weight, 0);
  return Math.round((doneWeight / totalWeight) * 100);
}
