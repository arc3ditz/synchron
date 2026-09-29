/**
 * Date utility functions for habit tracking
 * All dates are local calendar days, not UTC, not a rolling timer
 */

import type { FrequencyType } from "../types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Format a date key or Date as a full, human-readable calendar date. */
export function formatFullDate(dateValue: string | Date): string {
  let date: Date;
  if (dateValue instanceof Date) {
    date = dateValue;
  } else {
    const dateKeyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
    date = dateKeyMatch
      ? new Date(Number(dateKeyMatch[1]), Number(dateKeyMatch[2]) - 1, Number(dateKeyMatch[3]))
      : new Date(dateValue);
  }

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Convert a Date object to a YYYY-MM-DD string key
 * @param date - The date to convert
 * @returns A string in YYYY-MM-DD format
 */
export function getDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Get the habit date key for a given date, accounting for day reset hour
 * @param date - The date to convert
 * @param resetHour - The hour at which the day resets (0-23)
 * @returns A string in YYYY-MM-DD format adjusted for the reset hour
 */
export function getHabitDateKey(date: Date, resetHour: number): string {
  const habitDate = new Date(date);
  if (habitDate.getHours() < resetHour) {
    habitDate.setDate(habitDate.getDate() - 1);
  }
  return getDateKey(habitDate);
}

/**
 * Get the habit date key for today
 * @param resetHour - The hour at which the day resets (0-23)
 * @returns A string in YYYY-MM-DD format for today, adjusted for the reset hour
 */
export function getTodayKey(resetHour = 0): string {
  return getHabitDateKey(new Date(), resetHour);
}

/**
 * Format a date key for display
 * @param key - The date key in YYYY-MM-DD format
 * @param resetHour - The hour at which the day resets (0-23)
 * @returns A formatted string for display
 */
export function formatDateDisplay(key: string, resetHour: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  const today = new Date();
  const isToday = getHabitDateKey(today, resetHour) === key;

  if (isToday) {
    return `Today - ${formatFullDate(date)}`;
  }

  return formatFullDate(date);
}

/**
 * Shift a date key by a given number of days
 * @param key - The date key in YYYY-MM-DD format
 * @param deltaDays - The number of days to shift (positive or negative)
 * @returns A new date key shifted by the given number of days
 */
export function shiftDateKey(key: string, deltaDays: number): string {
  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + deltaDays);
  return getDateKey(date);
}

/**
 * Calculate the difference in days between two date keys
 * @param aKey - The first date key in YYYY-MM-DD format
 * @param bKey - The second date key in YYYY-MM-DD format
 * @returns The difference in days (aKey - bKey)
 */
export function diffInDays(aKey: string, bKey: string): number {
  const [ay, am, ad] = aKey.split("-").map(Number);
  const [by, bm, bd] = bKey.split("-").map(Number);
  const a = new Date(ay, am - 1, ad).getTime();
  const b = new Date(by, bm - 1, bd).getTime();
  return Math.round((a - b) / 86400000);
}

/**
 * Get the frequency type of a habit, defaulting to "daily"
 * @param habit - The habit object
 * @returns The frequency type
 */
export function getFrequencyType(habit: { frequencyType?: FrequencyType }): FrequencyType {
  return habit.frequencyType ?? "daily";
}

/**
 * Check if a habit is scheduled on a given date
 * @param habit - The habit object with frequency information
 * @param dateKey - The date key in YYYY-MM-DD format
 * @returns Whether the habit is scheduled on the given date
 */
export function isHabitScheduledOnDate(
  habit: { frequencyType?: FrequencyType; customDays?: string[] },
  dateKey: string,
): boolean {
  const frequencyType = getFrequencyType(habit);
  if (frequencyType === "daily") return true;

  const [year, month, day] = dateKey.split("-").map(Number);
  const weekday = new Date(year, month - 1, day).getDay();
  if (frequencyType === "weekdays") return weekday >= 1 && weekday <= 5;
  if (frequencyType === "weekends") return weekday === 0 || weekday === 6;
  return habit.customDays?.includes(WEEKDAYS[weekday]) ?? false;
}

/**
 * Calculate streak for a habit
 * @param habit - The habit object
 * @param streakFreeze - Whether streak freeze is enabled
 * @param dayResetHour - The hour at which the day resets (0-23)
 * @returns The current streak count
 */
export function calculateStreak(
  habit: { completedDates: string[]; frequencyType?: FrequencyType; customDays?: string[] },
  streakFreeze = false,
  dayResetHour = 0,
): number {
  const dateSet = new Set(habit.completedDates);
  const todayKey = getTodayKey(dayResetHour);

  if (getFrequencyType(habit) === "custom" && (habit.customDays?.length ?? 0) === 0) {
    return 0;
  }

  if (streakFreeze) {
    return [...dateSet].filter(
      (date) => date <= todayKey && isHabitScheduledOnDate(habit, date),
    ).length;
  }

  let cursor = dateSet.has(todayKey) ? todayKey : shiftDateKey(todayKey, -1);
  let streak = 0;

  while (true) {
    if (!isHabitScheduledOnDate(habit, cursor)) {
      cursor = shiftDateKey(cursor, -1);
      continue;
    }
    if (!dateSet.has(cursor)) break;
    streak++;
    cursor = shiftDateKey(cursor, -1);
  }

  return streak;
}

/**
 * Get the start of the week for a given date
 * @param date - The date
 * @param weekStart - Whether the week starts on "Sunday" or "Monday"
 * @returns The start of the week as a Date object
 */
export function getWeekStart(date: Date, weekStart: "Sunday" | "Monday"): Date {
  const d = new Date(date);
  const firstDay = weekStart === "Monday" ? 1 : 0;
  const daysSinceStart = (d.getDay() - firstDay + 7) % 7;
  d.setDate(d.getDate() - daysSinceStart);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get the start of the month for a given date
 * @param date - The date
 * @returns The start of the month as a Date object
 */
export function getMonthStart(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * Get a date that is a given number of days ago
 * @param days - The number of days ago
 * @returns A date that is the given number of days ago
 */
export function getDaysAgo(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

/**
 * Check if a challenge habit is active on a given date
 * @param habit - The habit object
 * @param dateKey - The date key in YYYY-MM-DD format
 * @returns Whether the challenge is active on the given date
 */
export function isChallengeActiveOnDate(
  habit: { type?: string; startDate?: string; durationDays?: number },
  dateKey: string,
): boolean {
  if (habit.type !== "Challenge" || !habit.startDate || !habit.durationDays) {
    return false;
  }
  const daysElapsed = diffInDays(dateKey, habit.startDate);
  return daysElapsed >= 0 && daysElapsed < habit.durationDays;
}

export { WEEKDAYS };
