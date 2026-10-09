import { diffInDays, getDateKey } from "../utils/dates.ts";
import type { FocusSessionRecord, Habit } from "../types";

/**
 * Gentle restart: returning after inactivity feels like continuing.
 *
 * Pure and clock-free: the caller supplies `todayKey` (local YYYY-MM-DD),
 * so the same input always yields the same output. No network, no
 * notifications, no new storage inside this module — persistence stays with
 * the existing load/saveStorageData pattern at the call site.
 */

/** Calendar-day gap that counts as a meaningful return. Daily use and a short weekend break stay quiet. */
export const WELCOME_BACK_THRESHOLD_DAYS = 3;

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = DATE_KEY_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
  );
}

export function dateKeyFromTimestamp(timestamp: unknown): string | null {
  if (typeof timestamp !== "number") return null;
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  try {
    const key = getDateKey(new Date(timestamp));
    return isValidDateKey(key) ? key : null;
  } catch {
    return null;
  }
}

export interface WelcomeBackActivityInput {
  habits?: Pick<Habit, "completedDates">[] | null;
  focusSessions?: Pick<FocusSessionRecord, "timestamp">[] | null;
  /** Raw stored last-seen day; invalid values are ignored (unreliable → no welcome). */
  lastSeenKey?: unknown;
  /** Local calendar day "YYYY-MM-DD". Caller derives it (e.g. getTodayKey). */
  todayKey: string;
}

/**
 * Most recent reliable local-activity day on or before today, or null when
 * no reliable activity data exists. Activity = app opens (lastSeen) plus
 * existing work signals (habit completions, focus sessions). Creation-only
 * data is not enough — callers fall back to the normal Today experience.
 */
export function getLatestActivityKey(input: WelcomeBackActivityInput): string | null {
  const { habits, focusSessions, lastSeenKey, todayKey } = input;
  if (!isValidDateKey(todayKey)) return null;
  const candidates: string[] = [];
  if (isValidDateKey(lastSeenKey) && lastSeenKey <= todayKey) {
    candidates.push(lastSeenKey);
  }
  if (Array.isArray(habits)) {
    for (const habit of habits) {
      const dates = (habit as Pick<Habit, "completedDates"> | null | undefined)?.completedDates;
      if (!Array.isArray(dates)) continue;
      for (const dateKey of dates) {
        if (isValidDateKey(dateKey) && dateKey <= todayKey) candidates.push(dateKey);
      }
    }
  }
  if (Array.isArray(focusSessions)) {
    for (const session of focusSessions) {
      const key = dateKeyFromTimestamp(
        (session as Pick<FocusSessionRecord, "timestamp"> | null | undefined)?.timestamp,
      );
      if (key !== null && key <= todayKey) candidates.push(key);
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort();
  return candidates[candidates.length - 1];
}

export interface WelcomeBackDecision {
  show: boolean;
  /** Whole calendar days between today and the last reliable activity day. */
  daysAway: number;
  lastActivityKey: string | null;
}

/**
 * Show the calm welcome only after a meaningful gap with reliable data.
 * Ordinary launches (same day, next day, short break) and missing or
 * unreliable data fall back to the normal Today experience.
 */
export function shouldShowWelcomeBack(input: WelcomeBackActivityInput): WelcomeBackDecision {
  const lastActivityKey = getLatestActivityKey(input);
  if (lastActivityKey === null || !isValidDateKey(input.todayKey)) {
    return { show: false, daysAway: 0, lastActivityKey };
  }
  const daysAway = diffInDays(input.todayKey, lastActivityKey);
  if (!Number.isFinite(daysAway) || daysAway < WELCOME_BACK_THRESHOLD_DAYS) {
    return { show: false, daysAway: Number.isFinite(daysAway) ? Math.max(0, daysAway) : 0, lastActivityKey };
  }
  return { show: true, daysAway, lastActivityKey };
}

/** Calm, forward-looking copy: never mentions failure, streaks, or falling behind. */
export function getWelcomeBackTitle(): string {
  return "Welcome back — pick up where you left off.";
}

export function getWelcomeBackSubtitle(): string {
  return "Here's one good place to start.";
}
