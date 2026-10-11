import type { Mode, Session } from "../types";

export interface FocusTimerSnapshot {
  version: 1;
  mode: Mode;
  timer: {
    totalMs: number;
    remainingMs: number;
    minutes: number;
    running: boolean;
    endAt: number | null;
  };
  pomodoro: {
    totalMs: number;
    remainingMs: number;
    session: Session;
    focusMinutes: number;
    breakMinutes: number;
    focusDurationMs: number;
    breakDurationMs: number;
    running: boolean;
    endAt: number | null;
  };
  selection: {
    habitId: number | "";
    goalId: string;
    projectId: string;
    milestoneId: string;
    taskId: string;
  };
  loggedSessionKeys: string[];
}

const MIN_DURATION_MS = 60_000;
const MAX_DURATION_MS = 999 * 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isDuration(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) &&
    value >= MIN_DURATION_MS && value <= MAX_DURATION_MS;
}

function boundedRemaining(value: unknown, totalMs: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return totalMs;
  return Math.max(0, Math.min(totalMs, value));
}

function boundedMinutes(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isInteger(value)) return fallback;
  return Math.max(1, Math.min(999, value));
}

export function createFocusTimerSnapshot(defaultFocusMinutes: number): FocusTimerSnapshot {
  const duration = Math.max(1, Math.min(999, Math.round(defaultFocusMinutes))) * 60_000;
  return {
    version: 1,
    mode: "Timer",
    timer: {
      totalMs: duration,
      remainingMs: duration,
      minutes: duration / 60_000,
      running: false,
      endAt: null,
    },
    pomodoro: {
      totalMs: duration,
      remainingMs: duration,
      session: "Focus",
      focusMinutes: duration / 60_000,
      breakMinutes: 5,
      focusDurationMs: duration,
      breakDurationMs: 5 * 60_000,
      running: false,
      endAt: null,
    },
    selection: { habitId: "", goalId: "", projectId: "", milestoneId: "", taskId: "" },
    loggedSessionKeys: [],
  };
}

export function restoreFocusTimerSnapshot(
  value: unknown,
  now: number,
  defaultFocusMinutes: number,
): FocusTimerSnapshot {
  const fallback = createFocusTimerSnapshot(defaultFocusMinutes);
  if (!isRecord(value) || value.version !== 1) return fallback;
  const timer = isRecord(value.timer) ? value.timer : {};
  const pomodoro = isRecord(value.pomodoro) ? value.pomodoro : {};
  const selection = isRecord(value.selection) ? value.selection : {};

  const timerTotal = isDuration(timer.totalMs) ? timer.totalMs : fallback.timer.totalMs;
  const timerEndAt = typeof timer.endAt === "number" && Number.isFinite(timer.endAt)
    ? timer.endAt
    : null;
  const timerHasDeadline = timerEndAt !== null &&
    (timer.running === true || timer.remainingMs === 0);
  const timerRemaining = timerHasDeadline
    ? Math.max(0, timerEndAt - now)
    : boundedRemaining(timer.remainingMs, timerTotal);

  const pomodoroTotal = isDuration(pomodoro.totalMs) ? pomodoro.totalMs : fallback.pomodoro.totalMs;
  const pomodoroEndAt = typeof pomodoro.endAt === "number" && Number.isFinite(pomodoro.endAt)
    ? pomodoro.endAt
    : null;
  const pomodoroRunning = pomodoro.running === true && pomodoroEndAt !== null;
  const pomodoroRemaining = pomodoroRunning
    ? Math.max(0, pomodoroEndAt - now)
    : boundedRemaining(pomodoro.remainingMs, pomodoroTotal);

  const loggedSessionKeys = Array.isArray(value.loggedSessionKeys)
    ? value.loggedSessionKeys.filter((key): key is string => typeof key === "string").slice(-128)
    : [];
  const habitId = selection.habitId === "" ||
    (typeof selection.habitId === "number" && Number.isInteger(selection.habitId))
    ? selection.habitId
    : "";
  const stringSelection = (key: string) => {
    const selected = selection[key];
    return typeof selected === "string" ? selected : "";
  };

  return {
    version: 1,
    mode: value.mode === "Pomodoro" ? "Pomodoro" : "Timer",
    timer: {
      totalMs: timerTotal,
      remainingMs: timerRemaining,
      minutes: boundedMinutes(timer.minutes, Math.ceil(timerTotal / 60_000)),
      running: timerHasDeadline && timerRemaining > 0,
      // Keep an expired running deadline until the timer processes its
      // completion once; paused timers always have a null deadline.
      endAt: timerHasDeadline ? timerEndAt : null,
    },
    pomodoro: {
      totalMs: pomodoroTotal,
      remainingMs: pomodoroRemaining,
      session: pomodoro.session === "Break" ? "Break" : "Focus",
      focusMinutes: boundedMinutes(pomodoro.focusMinutes, fallback.pomodoro.focusMinutes),
      breakMinutes: boundedMinutes(pomodoro.breakMinutes, fallback.pomodoro.breakMinutes),
      focusDurationMs: isDuration(pomodoro.focusDurationMs)
        ? pomodoro.focusDurationMs
        : boundedMinutes(pomodoro.focusMinutes, fallback.pomodoro.focusMinutes) * 60_000,
      breakDurationMs: isDuration(pomodoro.breakDurationMs)
        ? pomodoro.breakDurationMs
        : boundedMinutes(pomodoro.breakMinutes, fallback.pomodoro.breakMinutes) * 60_000,
      running: pomodoroRunning,
      endAt: pomodoroRunning ? pomodoroEndAt : null,
    },
    selection: {
      habitId,
      goalId: stringSelection("goalId"),
      projectId: stringSelection("projectId"),
      milestoneId: stringSelection("milestoneId"),
      taskId: stringSelection("taskId"),
    },
    loggedSessionKeys,
  };
}

export function focusSessionCompletionKey(
  mode: Mode,
  session: Session,
  endAt: number,
): string {
  return `${mode}:${session}:${endAt}`;
}

export function rememberFocusSessionCompletion(
  keys: readonly string[],
  key: string,
): string[] {
  if (keys.includes(key)) return [...keys];
  return [...keys, key].slice(-128);
}

export function hasFocusSessionCompletion(
  keys: readonly string[],
  key: string,
): boolean {
  return keys.includes(key);
}
