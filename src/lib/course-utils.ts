/**
 * Pure function to check if a course has ended based on its parent semester's end date.
 * Used everywhere courses need forward-looking filtering: task filters, Link-to picker.
 *
 * Does NOT alter or hide tasks that already reference an ended course —
 * only removes ended courses from pickers/filters for new task creation.
 */
export function isCourseEnded(course: {
  semester?: { endDate: Date | string } | null;
}): boolean {
  if (!course.semester) return false;
  const endDate =
    course.semester.endDate instanceof Date
      ? course.semester.endDate
      : new Date(course.semester.endDate);
  return endDate < new Date();
}
