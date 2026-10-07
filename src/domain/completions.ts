/**
 * Completion timestamp helpers.
 *
 * Completion records historically retain only local calendar date keys
 * (`completedDates: "YYYY-MM-DD"`). New completions additionally record a
 * `completedAt` timestamp (epoch milliseconds, captured when the user marks
 * the habit complete) so future intelligent features can learn actual
 * completion timing. `completedDates` remains the source of truth for
 * whether a habit is complete on a given day; `completedAt` is purely
 * additive metadata.
 *
 * Backwards compatibility rules:
 * - Old records without `completedAt` keep working unchanged.
 * - Timestamps are never fabricated for old records; lookups fall back to
 *   null so callers use the existing date-based behavior.
 * - `completedAt` entries are only kept for dates present in
 *   `completedDates`; orphans are dropped on load.
 */

import type { Habit } from "../types";

export function getCompletionTimestamp(
  habit: Pick<Habit, "completedAt">,
  dateKey: string,
): number | null {
  const timestamp = habit.completedAt?.[dateKey];
  return typeof timestamp === "number" && Number.isFinite(timestamp) ? timestamp : null;
}

/**
 * Keep only valid timestamps for dates that are actually completed.
 * Returns undefined when nothing valid remains so old records stay untouched.
 */
export function sanitizeCompletedAt(
  completedDates: string[],
  completedAt: unknown,
): Record<string, number> | undefined {
  if (typeof completedAt !== "object" || completedAt === null) return undefined;
  const dateSet = new Set(completedDates);
  let sanitized: Record<string, number> | undefined;
  for (const [dateKey, timestamp] of Object.entries(completedAt)) {
    if (typeof timestamp === "number" && Number.isFinite(timestamp) && dateSet.has(dateKey)) {
      sanitized ??= {};
      sanitized[dateKey] = timestamp;
    }
  }
  return sanitized;
}

export function markHabitComplete<T extends Habit>(habit: T, dateKey: string, now = Date.now()): T {
  if (habit.completedDates.includes(dateKey)) return habit;
  return {
    ...habit,
    completedDates: [...habit.completedDates, dateKey],
    completedAt: { ...habit.completedAt, [dateKey]: now },
  };
}

export function markHabitIncomplete<T extends Habit>(habit: T, dateKey: string): T {
  if (!habit.completedDates.includes(dateKey)) return habit;
  const result: T = {
    ...habit,
    completedDates: habit.completedDates.filter((date) => date !== dateKey),
  };
  if (habit.completedAt !== undefined) {
    const rest = { ...habit.completedAt };
    delete rest[dateKey];
    if (Object.keys(rest).length > 0) {
      result.completedAt = rest;
    } else {
      delete result.completedAt;
    }
  }
  return result;
}
