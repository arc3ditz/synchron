import { getHabitDateKey } from "../utils/dates.ts";
import type { FocusSessionRecord, Milestone, Task } from "../types";

export interface TimestampedFocusSession {
  timestamp: number;
}

/**
 * Longest duration any timer control may configure, in minutes. Every
 * surface that turns user input into a Timer/Pomodoro duration (custom
 * inputs, presets, quick adjust, auto-starts, persisted settings) validates
 * against this single bound so the countdown can never render past 999:59.
 */
export const MAX_FOCUS_DURATION_MINUTES = 999;

export function getFocusSessionsForLogicalToday<T extends TimestampedFocusSession>(
  sessions: T[],
  dayResetHour: number,
  now = new Date(),
): T[] {
  const todayKey = getHabitDateKey(now, dayResetHour);
  return sessions.filter((session) =>
    getHabitDateKey(new Date(session.timestamp), dayResetHour) === todayKey,
  );
}

export interface FocusSessionInput {
  sessionType: "Timer" | "Pomodoro Focus";
  durationMinutes: number;
  habitName: string;
  habitId?: number;
  goalId?: string;
  milestoneId?: string;
  taskId?: string;
}

/**
 * Short initial commitment offered by the Next Step hero ("Start 5-min
 * focus"). Applied to the existing Focus Timer's one-shot auto-start — never
 * saved over the user's default duration, never a new timer.
 */
export const QUICK_FOCUS_MINUTES = 5;

/**
 * Build a FocusSessionRecord from a completed session, preserving the linked
 * Task ID and resolving the Project behind the session through its Task or
 * Milestone. Sessions without a Task keep working: unrelated fields pass
 * through untouched and nothing is ever auto-completed here.
 */
export function buildFocusSessionRecord(
  input: FocusSessionInput,
  context: { tasks: Task[]; milestones: Milestone[] },
  ids?: { id?: number; timestamp?: number },
): FocusSessionRecord {
  const linkedTask = input.taskId !== undefined
    ? context.tasks.find((task) => task.id === input.taskId)
    : undefined;
  const linkedMilestone = input.milestoneId !== undefined
    ? context.milestones.find((milestone) => milestone.id === input.milestoneId)
    : undefined;
  const projectId = linkedTask?.projectId ?? linkedMilestone?.projectId;
  const timestamp = ids?.timestamp ?? Date.now();

  return {
    id: ids?.id ?? timestamp,
    timestamp,
    sessionType: input.sessionType,
    durationMinutes: input.durationMinutes,
    habitName: input.habitName,
    habitId: input.habitId,
    goalId: input.goalId,
    milestoneId: input.milestoneId,
    taskId: input.taskId,
    projectId,
  };
}

/**
 * Commit a minute value coming from a duration control. Empty or
 * non-numeric input keeps `fallback`; everything else is rounded and
 * clamped into the supported [1, 999] range. Valid in-range integers pass
 * through untouched so a configured duration is never rewritten.
 */
export function clampFocusDurationMinutes(value: string | number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (typeof value === "string" && value.trim() === "") return fallback;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(MAX_FOCUS_DURATION_MINUTES, Math.round(parsed)));
}

/**
 * True when a raw control value is already a committable duration: an
 * integer minute count within [1, 999]. Callers use this to decide whether
 * to commit keystrokes live; anything else waits for blur, where
 * `clampFocusDurationMinutes` resolves it.
 */
export function isValidFocusDurationMinutes(value: string): boolean {
  const parsed = Number(value);
  return value.trim() !== "" && Number.isInteger(parsed) && parsed >= 1 &&
    parsed <= MAX_FOCUS_DURATION_MINUTES;
}

/**
 * Format remaining milliseconds as MM:SS. Minutes grow to three digits at
 * 100m+, and the minutes field is defensively capped at 999 so the largest
 * countdown the timer can ever display is 999:59.
 */
export function formatCountdownClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.min(MAX_FOCUS_DURATION_MINUTES, Math.floor(totalSeconds / 60));
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Keep a visible gap between the countdown glyphs and the ring stroke.
 * The fitted text box occupies at most this fraction of the ring's inner
 * diameter, so corners never touch the circle.
 */
export const COUNTDOWN_FIT_RATIO = 0.92;

/** Legibility floor for the fitted countdown, in CSS px. */
export const MIN_COUNTDOWN_FONT_PX = 12;

export interface CountdownFontFitInput {
  /** Rendered width of the countdown text at `fontSize`, in CSS px. */
  textWidth: number;
  /** Rendered line-box height of the countdown text at `fontSize`, in CSS px. */
  textHeight: number;
  /** The font size the width/height measurements were taken at, in CSS px. */
  fontSize: number;
  /** Diameter of the ring's usable inner circle (inner stroke edge minus padding), in CSS px. */
  innerDiameter: number;
}

/**
 * Scale a countdown font size so the measured text box fits inside the
 * timer ring. A centered box fits a circle exactly when its diagonal does
 * not exceed the diameter, so the target size is
 * `fontSize * (innerDiameter * ratio) / hypot(textWidth, textHeight)`.
 * Because glyph metrics scale linearly with font size, measuring once at
 * any size yields the fitted size in a single step. Invalid measurements
 * return the incoming size unchanged.
 */
export function fitCountdownFontSize(input: CountdownFontFitInput): number {
  const { textWidth, textHeight, fontSize, innerDiameter } = input;
  if (
    !Number.isFinite(textWidth) || !Number.isFinite(textHeight) ||
    !Number.isFinite(fontSize) || !Number.isFinite(innerDiameter) ||
    textWidth <= 0 || textHeight <= 0 || fontSize <= 0 || innerDiameter <= 0
  ) {
    return fontSize;
  }
  const diagonal = Math.hypot(textWidth, textHeight);
  const scale = (innerDiameter * COUNTDOWN_FIT_RATIO) / diagonal;
  return Math.max(MIN_COUNTDOWN_FONT_PX, fontSize * scale);
}